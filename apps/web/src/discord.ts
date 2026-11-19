// `GET /api/discord` (docs/superpowers/specs/2026-11-20-discord-box-design.md): the home page's "Join our Discord"
// button and its live numbers. The invite link is web.config.json's `discord.invite` (never the repo); the numbers come
// from Discord's public invite endpoint, which needs no token. The service asks Discord, never the visitor's browser
// (the site's CSP allows only its own address). One answer is kept 10 minutes and shared by every visitor.

import { object, text } from './configHelpers';
import type { Logger } from './log';

export interface DiscordConfig {
  /** The invite's code, `abc` of `https://discord.gg/abc`. */
  code: string;
  /** The link the button opens: always `https://discord.gg/<code>`. */
  url: string;
}

/** The home page's type (apps/client/src/site/discordBox.ts has the same: the two share no package for it). */
export interface DiscordAnswer { url: string; name: string | null; online: number | null; members: number | null }

export const DISCORD_TTL_MS = 600_000;
export const DISCORD_RETRY_MS = 60_000;
export const DISCORD_TIMEOUT_MS = 3000;

const CODE = /^[A-Za-z0-9-]{2,32}$/;
const LINK = /^(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/([^/?#]*)\/?$/i;

/** The `discord` section: `{ "invite": "https://discord.gg/<code>" }`, `discord.com/invite/<code>` or the bare code. */
export function parseDiscordConfig(value: unknown): DiscordConfig {
  const section = object(value, 'discord');
  const invite = text(section.invite, 'discord.invite').trim();
  const code = CODE.test(invite) ? invite : LINK.exec(invite)?.[1];
  if (code === undefined || !CODE.test(code)) {
    throw new Error('discord.invite must be a Discord invite link, such as https://discord.gg/abc123, or its code');
  }
  return { code, url: `https://discord.gg/${code}` };
}

const count = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;

/** The invite's server name and numbers; the link alone when Discord fails; `'invalid'` when Discord does not know it. */
export async function loadDiscord(config: DiscordConfig, fetchFn: typeof fetch, timeoutMs = DISCORD_TIMEOUT_MS): Promise<DiscordAnswer | 'invalid'> {
  const linkOnly: DiscordAnswer = { url: config.url, name: null, online: null, members: null };
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  try {
    const response = await fetchFn(`https://discord.com/api/v10/invites/${config.code}?with_counts=true`, {
      signal: abort.signal, headers: { Accept: 'application/json' },
    });
    if (response.status === 404) return 'invalid';
    if (!response.ok) return linkOnly;
    const body: unknown = await response.json();
    if (typeof body !== 'object' || body === null) return linkOnly;
    const { guild, approximate_presence_count: online, approximate_member_count: members } = body as Record<string, unknown>;
    const name = typeof guild === 'object' && guild !== null && typeof (guild as Record<string, unknown>).name === 'string'
      ? (guild as Record<string, string>).name : null;
    return { url: config.url, name, online: count(online), members: count(members) };
  } catch {
    return linkOnly;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * One answer for 10 minutes (1 minute when Discord gave no numbers), shared by the callers that ask while it loads.
 * An invalid invite is `'off'`, warned once each time it turns invalid.
 */
export class DiscordCache {
  private kept: { answer: DiscordAnswer | 'off'; at: number; ttl: number } | undefined;
  private loading: Promise<DiscordAnswer | 'off'> | undefined;
  private warned = false;

  constructor(private readonly load: () => Promise<DiscordAnswer | 'invalid'>, private readonly now: () => number, private readonly log: Logger) {}

  get(): Promise<DiscordAnswer | 'off'> {
    if (this.kept !== undefined && this.now() - this.kept.at <= this.kept.ttl) return Promise.resolve(this.kept.answer);
    this.loading ??= this.load().then((loaded) => {
      const answer = loaded === 'invalid' ? 'off' : loaded;
      if (loaded === 'invalid' && !this.warned) this.log.warn('discord: invite is invalid or expired; the home page shows no Discord button');
      this.warned = loaded === 'invalid';
      const numbers = answer !== 'off' && answer.online !== null && answer.members !== null;
      this.kept = { answer, at: this.now(), ttl: answer === 'off' || numbers ? DISCORD_TTL_MS : DISCORD_RETRY_MS };
      return answer;
    }).finally(() => { this.loading = undefined; });
    return this.loading;
  }
}
