// The Support / VIP page (2026-11-16): pick VIP 1-4, pay outside the site by one of the payment QRs, then send the
// receipt and the reference number. An admin checks each payment by hand in the panel; the request shows Processing
// until then, then Approved (with the VIP's end date) or Rejected (with the reason). The game account's login is the
// web service's (apps/web/src/vip/siteVip.ts). No game code: `npm run check:public-build` checks it. Everything from the
// service is shown as text. Prices: pesos for players in the Philippines (by the browser's time zone or language), US$
// for everyone else; a switch changes it, remembered in this browser.

import { el, showLobbyArt, siteLogo, siteRoot } from './page';
import { ReceiptError, receiptBase64 } from './receiptPicture';
import { countryCurrency, priceText, tierPrice, VipApi } from './vipApi';
import type { Answer, Currency, Me, MyRequest, VipPageData, VipTier } from './vipApi';
import { giftLine, tierPerks } from './vipPerks';
import './site.css';

const api = new VipApi(fetch.bind(window));
const root = siteRoot('site-page vip-page');

const CURRENCY_KEY = 'flyff-vip-currency';
function firstCurrency(): Currency {
  try {
    const saved = localStorage.getItem(CURRENCY_KEY);
    if (saved === 'USD' || saved === 'PHP') return saved;
  } catch { /* no storage: the country decides */ }
  let timeZone: string | undefined;
  try { timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { timeZone = undefined; }
  return countryCurrency(timeZone, navigator.languages ?? [navigator.language]);
}
let currency: Currency = firstCurrency();

const STATUS = { P: 'Processing', A: 'Approved', R: 'Rejected' } as const;

const dateText = (iso: string | null): string => {
  if (iso === null) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};
const tierName = (tier: { level: number; name: string | null }) => tier.name ?? `VIP ${tier.level}`;

/** The message for a refusal; `field` refusals say what to fix. */
function problemText(answer: Exclude<Answer<unknown>, { ok: true }>): string {
  switch (answer.error) {
    case 'off': return 'Support / VIP is not open yet.';
    case 'wrong': return 'Wrong account or password.';
    case 'banned': return 'This account is banned.';
    case 'too_many': return answer.max !== undefined
      ? `You already have ${answer.max} requests processing. Please wait until we check them.`
      : 'Too many tries. Wait an hour, then try again.';
    case 'session': return 'Please log in again.';
    case 'size': return 'The picture is too big (5 MB at most).';
    case 'reference': return 'That reference number was already sent. If you paid again, use the new receipt\'s number.';
    case 'slow_down': return 'Too many sends from your account. Try again in an hour.';
    case 'invalid':
      if (answer.field === 'receipt') return 'That file is not a picture we can take. Send a PNG, JPEG or WebP picture of the receipt.';
      if (answer.field === 'reference') return 'Type the reference number as the receipt shows it (letters, digits, spaces and dashes).';
      if (answer.field === 'tier') return 'That tier is not open now. Pick another one.';
      return 'Please check the form.';
    default: return 'Something went wrong. Please try again later.';
  }
}

// --- the parts of the page ------------------------------------------------------------------------------------------

const intro = el('section', { class: 'site-panel', 'aria-labelledby': 'vip-title' },
  el('h2', { id: 'vip-title' }, 'Support / VIP'),
  el('p', {}, 'Support the server and get VIP for a month. Pay by QR, then send us the receipt: we check every payment by hand, then turn your VIP on.'),
  el('p', { class: 'site-quiet' }, 'Monthly, not automatic: nothing renews by itself. Send a new receipt each month you want VIP.'));
const account = el('div', { class: 'vip-account' });

const tiersBox = el('div', { class: 'vip-tiers', role: 'radiogroup', 'aria-label': 'VIP tier' });
const currencyBox = el('div', { class: 'vip-currency', role: 'group', 'aria-label': 'Prices in' });
const tiersPanel = el('section', { class: 'site-panel', 'aria-labelledby': 'vip-step-1' }, el('h2', { id: 'vip-step-1' }, '1. Pick a tier'), currencyBox, tiersBox);

const qrBox = el('div', { class: 'vip-qrs' });
const payLine = el('p', { class: 'site-quiet vip-pay-line' });
const payPanel = el('section', { class: 'site-panel', 'aria-labelledby': 'vip-step-2' }, el('h2', { id: 'vip-step-2' }, '2. Pay by QR'), payLine, qrBox);

const sendBox = el('div');
const sendPanel = el('section', { class: 'site-panel', 'aria-labelledby': 'vip-step-3' }, el('h2', { id: 'vip-step-3' }, '3. Send your receipt'), sendBox);

const requestsBox = el('div', { class: 'vip-requests' });
/** "Sent." after a request, until the page is left. */
const doneLine = el('p', { class: 'vip-done', role: 'status' });
const requestsPanel = el('section', { class: 'site-panel', 'aria-labelledby': 'vip-mine' }, el('h2', { id: 'vip-mine' }, 'Your requests'), doneLine, requestsBox);
requestsPanel.hidden = true;

const pageAlert = el('p', { class: 'site-alert', role: 'alert' });

root.replaceChildren(
  el('header', { class: 'site-top' }, siteLogo()),
  intro, pageAlert, tiersPanel, payPanel, sendPanel, requestsPanel,
  el('p', { class: 'site-back' }, el('a', { href: '/' }, 'Home')),
);
intro.append(account);
showLobbyArt();

// --- state ----------------------------------------------------------------------------------------------------------

let data: VipPageData | undefined;
let picked: number | undefined;

function pickedTier(): VipTier | undefined {
  return data?.tiers.find((t) => t.level === picked);
}

/** A tier's price in the currency picked (US$ when it has no peso price). */
function shownPrice(tier: VipTier): string {
  const price = tierPrice(tier, currency);
  return priceText(price.cents, price.currency);
}

/** The US$ / pesos switch, only while a tier has a peso price. */
function renderCurrency(): void {
  const tiers = data?.tiers ?? [];
  currencyBox.hidden = !tiers.some((t) => t.pricePhpCents !== null);
  const choice = (value: Currency, label: string) => {
    const button = el('button', { type: 'button', 'aria-pressed': String(currency === value) }, label);
    button.addEventListener('click', () => {
      if (currency === value) return;
      currency = value;
      try { localStorage.setItem(CURRENCY_KEY, value); } catch { /* only for this visit */ }
      renderCurrency();
      renderTiers();
      renderPay();
      renderSend();
    });
    return button;
  };
  currencyBox.replaceChildren(el('span', {}, 'Prices in'), choice('PHP', '₱ Pesos'), choice('USD', 'US$'));
}

function renderTiers(): void {
  const tiers = data?.tiers ?? [];
  if (picked === undefined || !tiers.some((t) => t.level === picked)) picked = tiers[0]?.level;
  tiersBox.replaceChildren(...tiers.map((tier) => {
    const input = el('input', { type: 'radio', name: 'vip-tier', value: String(tier.level), id: `vip-tier-${tier.level}` });
    input.checked = tier.level === picked;
    input.addEventListener('change', () => { picked = tier.level; renderPay(); renderSend(); });
    return el('label', { class: 'vip-tier', for: input.id }, input,
      el('span', { class: 'vip-tier-name' }, tier.name),
      el('span', { class: 'vip-tier-price' }, shownPrice(tier)),
      el('span', { class: 'vip-tier-month' }, 'a month'),
      // 2026-11-19 (VIP perks): what the tier gives
      el('ul', { class: 'vip-tier-perks' }, ...tierPerks(tier.level, tier.autoPlayHours ?? null).map((line) => el('li', {}, line))));
  }));
  if (tiers.length === 0) tiersBox.replaceChildren(el('p', { class: 'site-quiet' }, 'No tiers are open now.'));
}

function renderPay(): void {
  const tier = pickedTier();
  const qrs = data?.qrs ?? [];
  payLine.textContent = qrs.length === 0 ? '' : tier === undefined ? 'Pay with any of these, then keep the receipt.'
    : `Pay ${shownPrice(tier)} for ${tier.name} with any of these, then keep the receipt and its reference number.`;
  qrBox.replaceChildren(...(qrs.length === 0 ? [el('p', { class: 'site-quiet' }, 'Payments are not open yet. Please check back soon.')]
    : qrs.map((qr) => el('figure', { class: 'vip-qr' },
      el('img', { src: qr.image, alt: `${qr.label} QR code`, loading: 'lazy', width: '240', height: '240' }),
      el('figcaption', {},
        el('strong', {}, qr.label),
        el('span', {}, qr.accountName),
        ...(qr.note === '' ? [] : [el('span', { class: 'site-quiet' }, qr.note)]))))));
}

/** What a new tier does to a VIP that runs, said before sending. */
function changeNote(me: Me, tier: VipTier | undefined): string {
  if (me.vip === null || tier === undefined) return '';
  const until = dateText(me.vip.endsAt);
  if (me.vip.level === tier.level) return `You have ${tierName(me.vip)} until ${until}. Once approved, one more month is added to its end.`;
  return `You have ${tierName(me.vip)} until ${until}. ${tier.name} starts when we approve it and runs one month from then; the days left on ${tierName(me.vip)} end.`;
}

function loginForm(): HTMLElement {
  const name = el('input', { id: 'vip-account', name: 'account', type: 'text', autocomplete: 'username', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', maxlength: '32' });
  const password = el('input', { id: 'vip-password', name: 'password', type: 'password', autocomplete: 'current-password', maxlength: '64' });
  const alert = el('p', { class: 'site-alert', role: 'alert' });
  const submit = el('button', { type: 'submit', class: 'site-button' }, 'Log in');
  const form = el('form', { class: 'site-form-inline', novalidate: '' },
    el('p', { class: 'site-quiet' }, 'Log in with your game account to send a receipt.'),
    el('div', { class: 'site-field' }, el('label', { for: name.id }, 'Account'), name),
    el('div', { class: 'site-field' }, el('label', { for: password.id }, 'Password'), password),
    alert, el('div', { class: 'site-actions' }, submit));
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (submit.disabled) return;
    alert.textContent = '';
    if (name.value.trim() === '' || password.value === '') {
      alert.textContent = 'Type your account and password.';
      return;
    }
    submit.disabled = true;
    void (async () => {
      try {
        const answer = await api.login(name.value.trim(), password.value);
        password.value = '';
        if (!answer.ok) {
          alert.textContent = problemText(answer);
          return;
        }
        await load();
      } finally {
        submit.disabled = false;
      }
    })();
  });
  return form;
}

function sendForm(me: Me): HTMLElement {
  const tier = pickedTier();
  const file = el('input', { id: 'vip-receipt', name: 'receipt', type: 'file', accept: 'image/*' });
  const preview = el('img', { class: 'vip-preview', alt: 'Your receipt' });
  preview.hidden = true;
  const reference = el('input', { id: 'vip-reference', name: 'reference', type: 'text', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', maxlength: '40' });
  const alert = el('p', { class: 'site-alert', role: 'alert' });
  const progress = el('p', { class: 'site-progress', role: 'status' });
  const submit = el('button', { type: 'submit', class: 'site-button' }, tier === undefined ? 'Send' : `Send for ${tier.name}`);
  const note = changeNote(me, tier);
  let previewUrl = '';
  file.addEventListener('change', () => {
    if (previewUrl !== '') URL.revokeObjectURL(previewUrl);
    const chosenFile = file.files?.[0];
    previewUrl = chosenFile === undefined ? '' : URL.createObjectURL(chosenFile);
    preview.src = previewUrl;
    preview.hidden = previewUrl === '';
  });
  const form = el('form', { class: 'site-form-inline', novalidate: '' },
    el('div', { class: 'site-field' }, el('label', { for: file.id }, 'Receipt picture'), file,
      el('p', { class: 'site-hint' }, 'A screenshot or photo of the payment receipt.')),
    preview,
    el('div', { class: 'site-field' }, el('label', { for: reference.id }, 'Reference number'), reference,
      el('p', { class: 'site-hint' }, 'As the receipt shows it. Each payment\'s number can be sent once.')),
    ...(note === '' ? [] : [el('p', { class: 'vip-note' }, note)]),
    alert, el('div', { class: 'site-actions' }, submit, progress));
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (submit.disabled) return;
    alert.textContent = '';
    const chosen = file.files?.[0];
    const tierNow = pickedTier();
    if (tierNow === undefined) { alert.textContent = 'Pick a tier first.'; return; }
    if (chosen === undefined) { alert.textContent = 'Pick the receipt picture.'; file.focus(); return; }
    if (!/^[A-Za-z0-9][A-Za-z0-9 -]{3,39}$/.test(reference.value.trim().replace(/\s+/g, ' '))) {
      alert.textContent = 'Type the reference number as the receipt shows it (letters, digits, spaces and dashes).';
      reference.focus();
      return;
    }
    submit.disabled = true;
    progress.textContent = 'Sending…';
    void (async () => {
      try {
        let receipt: string;
        try {
          receipt = await receiptBase64(chosen);
        } catch (error) {
          alert.textContent = error instanceof ReceiptError && error.problem === 'too_big'
            ? 'The picture is too big (5 MB at most).' : 'That file is not a picture we can take. Send a PNG, JPEG or WebP picture of the receipt.';
          return;
        }
        const answer = await api.send({ tier: tierNow.level, currency: tierPrice(tierNow, currency).currency, reference: reference.value.trim(), receipt });
        if (!answer.ok) {
          alert.textContent = problemText(answer);
          if (answer.error === 'session') await load();
          return;
        }
        await load();
        doneLine.textContent = `Sent. Your request for ${tierNow.name} is processing: we check the payment by hand, usually within a day.`;
        requestsBox.querySelector<HTMLElement>('.vip-request')?.focus();
      } finally {
        submit.disabled = false;
        progress.textContent = '';
      }
    })();
  });
  return form;
}

function renderSend(): void {
  const me = data?.me;
  sendBox.replaceChildren(me === undefined ? loginForm() : sendForm(me));
}

function requestLine(r: MyRequest): HTMLElement {
  const status = el('span', { class: `vip-status vip-status-${r.status}` }, STATUS[r.status]);
  const lines: (HTMLElement | string)[] = [
    el('div', { class: 'vip-request-head' }, el('strong', {}, `${tierName(r)} · ${priceText(r.priceCents, r.currency)}`), status),
    el('p', { class: 'site-quiet' }, `Reference ${r.reference} · sent ${dateText(r.createdAt)}`),
  ];
  if (r.status === 'A' && r.vipEndsAt !== null) lines.push(el('p', {}, `VIP until ${dateText(r.vipEndsAt)}.`));
  if (r.status === 'R') lines.push(el('p', { class: 'vip-reason' }, `Reason: ${r.reason ?? ''}`));
  if (r.status === 'P') lines.push(el('p', { class: 'site-quiet' }, 'We check the payment by hand, usually within a day.'));
  lines.push(r.receipt === null
    ? el('p', { class: 'site-quiet' }, 'The receipt picture was deleted (rejected requests keep it for a while only).')
    : el('p', {}, el('a', { href: r.receipt, target: '_blank', rel: 'noopener' }, 'See the receipt you sent')));
  return el('article', { class: 'vip-request', tabindex: '-1', 'data-status': r.status }, ...lines);
}

function renderMe(): void {
  const me = data?.me;
  if (me === undefined) {
    account.replaceChildren();
    requestsPanel.hidden = true;
    return;
  }
  const logout = el('button', { type: 'button', class: 'vip-link' }, 'Log out');
  logout.addEventListener('click', () => { void api.logout().then(load); });
  account.replaceChildren(
    el('p', { class: 'vip-who' }, 'Logged in as ', el('strong', {}, me.account), ' · ', logout),
    el('p', { class: 'vip-now' }, me.vip === null ? 'No VIP now.' : `Your VIP: ${tierName(me.vip)} until ${dateText(me.vip.endsAt)}.`));
  const gift = giftLine(me.gift); // 2026-11-19 (VIP perks)
  if (gift !== null) account.append(el('p', { class: 'vip-gift' }, gift));
  requestsPanel.hidden = false;
  requestsBox.replaceChildren(...(me.requests.length === 0 ? [el('p', { class: 'site-quiet' }, 'No requests yet.')] : me.requests.map(requestLine)));
}

async function load(): Promise<void> {
  const [, answer] = await Promise.all([api.session(), api.data()]);
  if (!answer.ok) {
    data = undefined;
    pageAlert.textContent = problemText(answer);
    for (const panel of [tiersPanel, payPanel, sendPanel, requestsPanel]) panel.hidden = true;
    account.replaceChildren();
    return;
  }
  pageAlert.textContent = '';
  for (const panel of [tiersPanel, payPanel, sendPanel]) panel.hidden = false;
  data = answer.value;
  renderCurrency();
  renderTiers();
  renderPay();
  renderSend();
  renderMe();
}

void load();
