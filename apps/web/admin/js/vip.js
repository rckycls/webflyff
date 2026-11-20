// The VIP tab (Support / VIP): players pay outside the site by one of the payment QRs shown here, then send the receipt
// and the reference number. Requests: check the payment came in, then Approve (the account's VIP for one month) or
// Reject with a reason the player sees. Payment QRs: what players see, on or off, in their order. Tiers: names and
// prices (US$ for everyone, pesos for players in the Philippines). Every change goes in the Log tab. No pop-up boxes:
// each risky button asks again in place.

import { codesView } from './codes.js';
import { api, busy, el, fill, messageLine, timeText } from './ui.js';

const STATUS_NAMES = { P: 'Processing', A: 'Approved', R: 'Rejected' };
const MAX_PICTURE_BYTES = 5 * 1024 * 1024;

/** A price as players see it: $2, $4.50, ₱115, ₱1,150. */
export function money(cents, currency = 'USD') {
  const amount = (cents / 100).toLocaleString('en-US', { minimumFractionDigits: cents % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 });
  return `${currency === 'PHP' ? '₱' : '$'}${amount}`;
}

function tierText(row) {
  return `${row.name ?? `VIP ${row.level}`} · ${money(row.priceCents, row.currency)} / month`;
}

const priceInput = (cents) => (cents === null || cents === undefined ? '' : (cents / 100).toFixed(2));

function vipNowText(row) {
  return row.vipLevel ? `Has VIP ${row.vipLevel} until ${timeText(row.vipNowEndsAt)}` : 'No VIP now';
}

/** A file picked in an input, as base64 (no `data:` start), when it is a picture of at most 5 MB. */
function readPicture(file) {
  return new Promise((resolve, reject) => {
    if (!file) { reject(new Error('Pick the QR picture.')); return; }
    if (file.size > MAX_PICTURE_BYTES) { reject(new Error('The picture is over 5 MB.')); return; }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(new Error('The picture could not be read.'));
    reader.readAsDataURL(file);
  });
}

/** Buttons that ask once more in place: the first press shows `question` with Yes and Cancel. */
function askFirst(label, question, yesLabel, message, work, { danger = false } = {}) {
  const start = el('button', { type: 'button', class: danger ? 'danger' : undefined, text: label });
  const yes = el('button', { type: 'button', class: danger ? 'danger' : undefined, text: yesLabel });
  const no = el('button', { type: 'button', class: 'quiet', text: 'Cancel' });
  const ask = el('span', { class: 'vip-ask', hidden: true }, el('span', { class: 'small', text: question }), yes, no);
  start.addEventListener('click', () => { start.hidden = true; ask.hidden = false; yes.focus(); });
  no.addEventListener('click', () => { ask.hidden = true; start.hidden = false; start.focus(); });
  yes.addEventListener('click', busy(yes, message, work));
  return el('span', { class: 'vip-actions' }, start, ask);
}

function requestsView() {
  let status = 'P';
  const filters = Object.entries(STATUS_NAMES).map(([code, name]) => el('button', {
    type: 'button', class: 'quiet', text: name, 'aria-pressed': String(code === status), onclick: () => { status = code; void load(); },
  }));
  const refresh = el('button', { type: 'button', class: 'quiet', text: 'Refresh' });
  const message = messageLine();
  const list = el('div', { class: 'vip-list' });

  function card(row) {
    // a rejected request's picture is deleted after some days (web.config.json vip.deleteRejectedAfterDays)
    const receipt = row.receipt === null
      ? el('div', { class: 'vip-receipt vip-receipt-gone small', text: 'Receipt picture deleted (old rejected request).' })
      : el('a', { class: 'vip-receipt', href: row.receipt, target: '_blank', rel: 'noopener', title: 'Open the receipt' },
        el('img', { src: row.receipt, alt: `Receipt of request ${row.id}`, loading: 'lazy' }));
    const head = el('div', { class: 'vip-head' },
      el('strong', { text: row.account }), el('span', { class: 'chip', text: tierText(row) }), el('span', { class: 'small', text: timeText(row.createdAt) }));
    const facts = el('dl', { class: 'facts' },
      el('dt', { text: 'Reference' }), el('dd', {}, el('code', { text: row.reference })),
      el('dt', { text: 'Now' }), el('dd', { text: vipNowText(row) }),
      el('dt', { text: 'From' }), el('dd', { text: row.address }));
    const rowMessage = messageLine();
    const parts = [head, facts];
    if (row.status === 'P') {
      const approve = askFirst('Approve', `Give ${row.account} ${row.name ?? `VIP ${row.level}`} for one month?`, 'Yes, approve', rowMessage, async () => {
        const done = await api('vip.approve', { id: row.id }, { write: true });
        await load();
        message.ok(`Approved: ${row.account} has VIP ${done.level} until ${timeText(done.endsAt)}.`);
      });
      const reason = el('input', { placeholder: 'Reason the player will see', maxlength: '200', size: 32 });
      const rejectAsk = askFirst('Reject', 'Reason:', 'Reject', rowMessage, async () => {
        if (reason.value.trim() === '') throw new Error('Write the reason the player will see.');
        await api('vip.reject', { id: row.id, reason: reason.value.trim() }, { write: true });
        await load();
        message.ok(`Rejected request ${row.id} of ${row.account}.`);
      }, { danger: true });
      rejectAsk.querySelector('.vip-ask')?.insertBefore(reason, rejectAsk.querySelector('.vip-ask .small')?.nextSibling ?? null);
      parts.push(el('div', { class: 'row' }, approve, rejectAsk), rowMessage.node);
    } else if (row.status === 'A') {
      parts.push(el('p', { class: 'small' }, el('span', { class: 'up', text: 'Approved' }),
        ` by ${row.decidedBy ?? '?'}, ${timeText(row.decidedAt)}. VIP until ${timeText(row.vipEndsAt)}.`));
    } else {
      parts.push(el('p', { class: 'small' }, el('span', { class: 'down', text: 'Rejected' }),
        ` by ${row.decidedBy ?? '?'}, ${timeText(row.decidedAt)}: ${row.reason ?? ''}`));
    }
    return el('article', { class: 'card vip-card', 'data-request': String(row.id) }, receipt, el('div', { class: 'vip-body' }, parts));
  }

  async function load() {
    for (const [i, code] of Object.keys(STATUS_NAMES).entries()) filters[i].setAttribute('aria-pressed', String(code === status));
    try {
      const { rows } = await api('vip.requests', { status });
      fill(list, rows.length === 0
        ? el('p', { class: 'card small', text: status === 'P' ? 'No requests waiting.' : 'None yet.' })
        : rows.map(card));
    } catch (error) {
      message.problem(error.message);
    }
  }
  refresh.addEventListener('click', () => { message.clear(); void load(); });

  const node = el('div', { class: 'vip-view' },
    el('div', { class: 'card' },
      el('p', { class: 'small', text: 'Check that the payment came in (the amount in the currency shown, and the reference number) before you approve. Approve gives one month of VIP: the same tier while it runs adds a month to its end; another tier starts now and the old one ends. Rejected requests lose their receipt picture after 30 days (web.config.json vip.deleteRejectedAfterDays).' }),
      el('div', { class: 'row vip-filter' }, filters, refresh), message.node),
    list);
  return { node, show: load };
}

function qrsView() {
  const label = el('input', { placeholder: 'GCash, Maya, bank...', maxlength: '40', required: true });
  const accountName = el('input', { placeholder: 'Account name players see', maxlength: '80', required: true });
  const note = el('input', { placeholder: 'Optional, like "send the exact amount"', maxlength: '200' });
  const order = el('input', { type: 'number', min: '1', max: '999', value: '1' });
  const on = el('input', { type: 'checkbox', checked: true });
  const picture = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp' });
  const preview = el('img', { class: 'vip-preview', alt: 'The picked QR', hidden: true });
  const add = el('button', { type: 'submit', text: 'Add QR' });
  const message = messageLine();
  const list = el('div', { class: 'vip-list' });

  picture.addEventListener('change', () => {
    const file = picture.files?.[0];
    preview.hidden = true;
    if (!file || file.size > MAX_PICTURE_BYTES) return;
    const reader = new FileReader();
    reader.onload = () => { preview.src = String(reader.result); preview.hidden = false; };
    reader.readAsDataURL(file);
  });

  const form = el('form', { class: 'card' }, el('h3', { text: 'Add a payment QR' }),
    el('div', { class: 'row' }, el('label', {}, 'Label', label), el('label', {}, 'Account name', accountName), el('label', {}, 'Note', note)),
    el('div', { class: 'row' }, el('label', {}, 'Order', order), el('label', { class: 'check' }, on, 'Show to players'),
      el('label', {}, 'QR picture (PNG, JPEG or WebP, 5 MB at most)', picture)),
    preview, el('div', { class: 'row' }, add), message.node);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void busy(add, message, async () => {
      const image = await readPicture(picture.files?.[0]);
      await api('vip.qrAdd', { label: label.value, accountName: accountName.value, note: note.value, order: Number(order.value), on: on.checked, image }, { write: true });
      form.reset();
      on.checked = true;
      preview.hidden = true;
      await load();
      return 'QR added.';
    })();
  });

  function card(qr) {
    const f = {
      label: el('input', { value: qr.label, maxlength: '40', 'aria-label': 'Label' }),
      accountName: el('input', { value: qr.accountName, maxlength: '80', 'aria-label': 'Account name' }),
      note: el('input', { value: qr.note, maxlength: '200', 'aria-label': 'Note' }),
      order: el('input', { type: 'number', min: '1', max: '999', value: String(qr.order), 'aria-label': 'Order' }),
      on: el('input', { type: 'checkbox', checked: qr.on }),
    };
    const save = el('button', { type: 'button', text: 'Save' });
    const rowMessage = messageLine();
    save.addEventListener('click', busy(save, rowMessage, async () => {
      await api('vip.qrSave', { id: qr.id, label: f.label.value, accountName: f.accountName.value, note: f.note.value, order: Number(f.order.value), on: f.on.checked }, { write: true });
      await load();
      message.ok(`Saved ${f.label.value}.`);
    }));
    const remove = askFirst('Delete', `Delete ${qr.label}? Players stop seeing it at once.`, 'Yes, delete', rowMessage, async () => {
      await api('vip.qrDelete', { id: qr.id }, { write: true });
      await load();
      message.ok(`Deleted ${qr.label}.`);
    }, { danger: true });
    return el('article', { class: 'card vip-card', 'data-qr': String(qr.id) },
      el('a', { class: 'vip-receipt', href: qr.image, target: '_blank', rel: 'noopener' }, el('img', { src: qr.image, alt: `${qr.label} QR`, loading: 'lazy' })),
      el('div', { class: 'vip-body' },
        el('div', { class: 'vip-head' }, el('strong', { text: qr.label }), el('span', { class: qr.on ? 'up' : 'down', text: qr.on ? 'shown to players' : 'off' })),
        el('div', { class: 'row' }, el('label', {}, 'Label', f.label), el('label', {}, 'Account name', f.accountName)),
        el('div', { class: 'row' }, el('label', {}, 'Note', f.note), el('label', {}, 'Order', f.order), el('label', { class: 'check' }, f.on, 'Show to players')),
        el('div', { class: 'row' }, save, remove), rowMessage.node));
  }

  async function load() {
    try {
      const { rows } = await api('vip.qrs', {});
      fill(list, rows.length === 0 ? el('p', { class: 'card small', text: 'No QRs yet: players see "Payments are not open yet."' }) : rows.map(card));
      order.value = String(rows.reduce((max, r) => Math.max(max, r.order), 0) + 1);
    } catch (error) {
      message.problem(error.message);
    }
  }

  return { node: el('div', { class: 'vip-view' }, form, list), show: load };
}

function tiersView() {
  const message = messageLine();
  const list = el('div');

  async function load() {
    try {
      const { rows } = await api('vip.tiers', {});
      fill(list, el('div', { class: 'table-box' }, el('table', {},
        el('thead', {}, el('tr', {}, ['Level', 'Name', 'Price a month (US$)', 'Price a month (₱)', 'On', ''].map((h) => el('th', { text: h })))),
        el('tbody', {}, rows.map((t) => {
          const name = el('input', { value: t.name, maxlength: '32', 'aria-label': `Name of level ${t.level}` });
          const price = el('input', { value: priceInput(t.priceCents), inputmode: 'decimal', size: 8, 'aria-label': `US$ price of level ${t.level}` });
          const pricePhp = el('input', { value: priceInput(t.pricePhpCents), inputmode: 'decimal', size: 8, placeholder: 'US$ only', 'aria-label': `Peso price of level ${t.level}` });
          const on = el('input', { type: 'checkbox', checked: t.on, 'aria-label': `Level ${t.level} on` });
          const save = el('button', { type: 'button', class: 'quiet', text: 'Save', 'aria-label': `Save level ${t.level}` });
          save.addEventListener('click', busy(save, message, async () => {
            await api('vip.tierSave', { level: t.level, name: name.value, price: price.value, pricePhp: pricePhp.value.trim(), on: on.checked }, { write: true });
            return `Saved level ${t.level}.`;
          }));
          return el('tr', {}, el('td', { text: String(t.level) }), el('td', {}, name), el('td', {}, price), el('td', {}, pricePhp), el('td', {}, on), el('td', {}, save));
        })))));
    } catch (error) {
      message.problem(error.message);
    }
  }

  return {
    node: el('div', { class: 'vip-view' }, el('div', { class: 'card' },
      el('p', { class: 'small', text: 'The tiers players can pick. Players in the Philippines see the peso price (empty: they see US$); everyone else sees US$. A new price counts for new requests; requests already sent keep theirs.' }),
      list, message.node)),
    show: load,
  };
}

// --- 2026-11-19 (VIP perks): Give VIP, the gift box contents and the gift log -------------------------------------------

/** VIP without a payment (testers, prizes): it starts or extends the account's VIP, gives the star, and queues a box. */
function giveView() {
  const message = messageLine();
  const account = el('input', { maxlength: '32', autocomplete: 'off', 'aria-label': 'Account' });
  const level = el('select', { 'aria-label': 'VIP level' }, [1, 2, 3, 4].map((n) => el('option', { value: String(n), text: `VIP ${n}` })));
  const days = el('input', { type: 'number', min: '1', max: '366', value: '30', 'aria-label': 'Days' });
  const gift = el('input', { type: 'checkbox', checked: true, 'aria-label': 'Send the gift box' });
  const go = el('button', { type: 'submit', text: 'Give VIP' });
  const form = el('form', { class: 'card' },
    el('p', { class: 'small', text: 'The same VIP level while it runs gets the days added to its end; anything else starts that level now. The star shows from the player\'s next login. The gift box goes to their character within 5 minutes.' }),
    el('label', {}, 'Account ', account), el('label', {}, ' Level ', level), el('label', {}, ' Days ', days),
    el('label', {}, ' ', gift, ' Send the gift box'), ' ', go, message.node);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void busy(go, message, async () => {
      const done = await api('vip.give', { account: account.value.trim(), level: Number(level.value), days: Number(days.value), gift: gift.checked }, { write: true });
      return `Gave ${account.value.trim()} VIP ${done.level} until ${timeText(done.endsAt)}.`;
    })();
  });
  // End VIP (a wrongly approved payment, say): asks again in place, then ends it now and cancels the unsent boxes
  const endMessage = messageLine();
  const endAccount = el('input', { maxlength: '32', autocomplete: 'off', 'aria-label': 'Account to end VIP for' });
  const endButton = askFirst('End VIP', 'End this account\'s VIP now? The star goes at their next login and their unsent gift boxes are cancelled.', 'Yes, end it', endMessage, async () => {
    const who = endAccount.value.trim();
    const done = await api('vip.end', { account: who }, { write: true });
    return `Ended ${who}'s VIP${done.cancelled > 0 ? `, ${done.cancelled} unsent gift box(es) cancelled` : ''}.`;
  }, { danger: true });
  const endCard = el('div', { class: 'card' },
    el('p', { class: 'small', text: 'End VIP stops an account\'s VIP now (for a payment approved by mistake, say).' }),
    el('label', {}, 'Account ', endAccount), ' ', endButton, endMessage.node);
  return { node: el('div', { class: 'vip-view' }, form, endCard), show: async () => {} };
}

/** What each tier's box holds: up to 6 item stacks, searched in the item list as in the Send tab. */
function giftBoxView() {
  const message = messageLine();
  const list = el('div');

  function slotRow(level, slot, row) {
    const query = el('input', { autocomplete: 'off', placeholder: 'Search an item', value: row ? (row.name ?? `id ${row.itemId}`) : '', 'aria-label': `VIP ${level} slot ${slot} item` });
    const count = el('input', { type: 'number', min: '0', max: '9999', size: 6, value: row ? String(row.count) : '0', 'aria-label': `VIP ${level} slot ${slot} count` });
    const picks = el('div', { class: 'picks' });
    let itemId = row ? row.itemId : 0;
    let timer = 0;
    query.addEventListener('input', () => {
      itemId = 0; // typing forgets the item: Save then asks for one picked from the search, never keeps the old one
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const text = query.value.trim();
        if (text === '') { fill(picks); return; }
        api('items.search', { query: text }).then(({ rows }) => {
          fill(picks, rows.length === 0 ? el('p', { class: 'small', text: 'No item found.' })
            : rows.map((i) => el('button', { type: 'button', text: `${i.name} (id ${i.id}, stacks to ${i.packMax})`, onclick: () => {
              itemId = i.id; query.value = i.name; count.max = String(i.packMax); if (Number(count.value) < 1) count.value = '1'; fill(picks);
            } })));
        }).catch((error) => message.problem(error.message));
      }, 300);
    });
    const save = el('button', { type: 'button', class: 'quiet', text: 'Save', 'aria-label': `Save VIP ${level} slot ${slot}` });
    save.addEventListener('click', busy(save, message, async () => {
      await api('vip.giftItemSave', { level, slot, itemId, count: Number(count.value) }, { write: true });
      return Number(count.value) === 0 ? `Emptied VIP ${level} slot ${slot}.` : `Saved VIP ${level} slot ${slot}.`;
    }));
    return el('tr', {}, el('td', { text: String(slot) }), el('td', {}, query, picks), el('td', {}, count), el('td', {}, save));
  }

  async function load() {
    try {
      const { rows } = await api('vip.giftItems', {});
      fill(list, [1, 2, 3, 4].map((level) => el('div', { class: 'table-box' }, el('h3', { text: `VIP ${level} box` }), el('table', {},
        el('thead', {}, el('tr', {}, ['Slot', 'Item', 'Count (0 empties it)', ''].map((h) => el('th', { text: h })))),
        el('tbody', {}, [1, 2, 3, 4, 5, 6].map((slot) => slotRow(level, slot, rows.find((r) => r.level === level && r.slot === slot))))))));
    } catch (error) {
      message.problem(error.message);
    }
  }

  return {
    node: el('div', { class: 'vip-view' }, el('div', { class: 'card' },
      el('p', { class: 'small', text: 'Each approved month (and each Give VIP with the box ticked) sends that tier\'s box by in-game mail: one mail per item stack. A change counts for boxes not sent yet.' }),
      list, message.node)),
    show: load,
  };
}

/** The latest gift boxes: queued, then sent to a character. */
function giftsView() {
  const message = messageLine();
  const list = el('div');
  async function load() {
    try {
      const { rows } = await api('vip.giftLog', {});
      fill(list, rows.length === 0 ? el('p', { class: 'small', text: 'No gift boxes yet.' }) : el('div', { class: 'table-box' }, el('table', {},
        el('thead', {}, el('tr', {}, ['Queued', 'Account', 'Level', 'From', 'Sent', 'Character', 'Items'].map((h) => el('th', { text: h })))),
        el('tbody', {}, rows.map((g) => el('tr', {},
          el('td', { text: timeText(g.createdAt) }), el('td', { text: g.account }), el('td', { text: `VIP ${g.level}` }),
          el('td', { text: g.requestId === null ? `Give VIP (${g.createdBy})` : `Request ${g.requestId}` }),
          el('td', { text: g.items === 'cancelled' ? `Cancelled ${timeText(g.sentAt)}` : g.sentAt ? timeText(g.sentAt) : 'Waiting (no character yet, or the box is empty)' }),
          el('td', { text: g.characterName ?? '' }), el('td', { text: g.items ?? '' })))))));
    } catch (error) {
      message.problem(error.message);
    }
  }
  return { node: el('div', { class: 'vip-view' }, el('div', { class: 'card' }, list, message.node)), show: load };
}

export function vipTab() {
  const views = { Requests: requestsView(), 'Payment QRs': qrsView(), Tiers: tiersView(), 'Give VIP': giveView(), 'Gift box': giftBoxView(), Gifts: giftsView(), Codes: codesView() };
  let current = 'Requests';
  const buttons = Object.keys(views).map((name) => el('button', { type: 'button', class: 'quiet', text: name, 'aria-pressed': String(name === current), onclick: () => pick(name) }));
  const box = el('div');

  function pick(name) {
    current = name;
    for (const b of buttons) b.setAttribute('aria-pressed', String(b.textContent === name));
    for (const [n, v] of Object.entries(views)) v.node.hidden = n !== name;
    void views[name].show();
  }

  for (const v of Object.values(views)) box.append(v.node);
  const node = el('section', { 'aria-label': 'VIP' }, el('h2', { text: 'Support / VIP' }), el('div', { class: 'row vip-views' }, buttons), box);
  return { node, show() { pick(current); } };
}
