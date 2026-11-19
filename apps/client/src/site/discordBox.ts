// The home page's "Join our Discord" button (docs/superpowers/specs/2026-11-20-discord-box-design.md): `GET /api/discord`
// (the web service, apps/web/src/discord.ts) once on load. Nothing shows when the service has no invite set, says it
// is off, or cannot be reached: the page never calls Discord itself.
import { el } from './page';

/** The web service's answer (apps/web/src/discord.ts has the same type: the client and the service share no package for it). */
export interface DiscordAnswer { url: string; name: string | null; online: number | null; members: number | null }

/** Discord's logo (the Clyde mark), drawn inline: the site's CSP takes no outside pictures. */
const LOGO = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path fill="currentColor" d="'
  + 'M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762'
  + '-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699'
  + ' 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a'
  + '.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-'
  + '.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614'
  + ' 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0'
  + ' 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00'
  + '.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-'
  + '2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-'
  + '1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189'
  + '-2.1568 2.4189Z"/></svg>';

/** "42 online · 310 members", either half alone when the other is not known, or null when neither is. */
export function discordCountsText(answer: { online: number | null; members: number | null }): string | null {
  const parts: string[] = [];
  if (answer.online !== null) parts.push(`${answer.online} online`);
  if (answer.members !== null) parts.push(`${answer.members} ${answer.members === 1 ? 'member' : 'members'}`);
  return parts.length === 0 ? null : parts.join(' · ');
}

const count = (value: unknown): boolean => value === null || (typeof value === 'number' && Number.isInteger(value) && value >= 0);

function isDiscordAnswer(value: unknown): value is DiscordAnswer {
  if (typeof value !== 'object' || value === null) return false;
  const { url, name, online, members } = value as Record<string, unknown>;
  return typeof url === 'string' && /^https:\/\/discord\.gg\/[A-Za-z0-9-]{2,32}$/.test(url)
    && (name === null || typeof name === 'string') && count(online) && count(members);
}

/** Fills `slot` with the button when the service has a Discord answer; leaves it hidden otherwise. */
export async function showDiscord(slot: HTMLElement, fetchFn: typeof fetch): Promise<void> {
  slot.hidden = true;
  let answer: unknown;
  try {
    const response = await fetchFn('/api/discord', { cache: 'no-store' });
    if (!response.ok) return;
    answer = await response.json();
  } catch {
    return;
  }
  if (!isDiscordAnswer(answer)) return;
  const logo = el('span', { class: 'discord-logo' });
  logo.innerHTML = LOGO; // a constant, never the service's text
  const counts = discordCountsText(answer);
  slot.replaceChildren(el('a', { class: 'discord-button', href: answer.url, target: '_blank', rel: 'noopener noreferrer' },
    logo,
    el('span', { class: 'discord-label' }, 'Join our Discord'),
    ...(counts === null ? [] : [el('span', { class: 'discord-counts' }, counts)])));
  slot.hidden = false;
}
