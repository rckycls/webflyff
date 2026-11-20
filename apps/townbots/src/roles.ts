// Who does what: about so many bots in each role at any moment (the settings' targets), each for a random while, then
// another role. Veterans never farm (nothing in their fields fits them). A bot that can no longer do a role (out of
// upgrade stones or shop stock) has it dropped until the program starts again after a refill.
import { ROLES } from './settings';
import type { Group, Role } from './settings';

const MIN = 60_000;
/** How long a role lasts (ms): farming, wandering and upgrading 20-60 minutes; shop and AFK 30-90. */
const DURATION: Record<Role, [number, number]> = {
  farming: [20 * MIN, 60 * MIN], wandering: [20 * MIN, 60 * MIN], upgrading: [20 * MIN, 60 * MIN],
  shop: [30 * MIN, 90 * MIN], afk: [30 * MIN, 90 * MIN],
};

interface Held { role: Role; until: number }

export class RolePlanner {
  private readonly held = new Map<string, Held>();
  private readonly dropped = new Map<string, Set<Role>>();

  constructor(
    private readonly targets: Record<Role, number>,
    private readonly random: () => number,
    private readonly now: () => number,
  ) {}

  /**
   * A role for a bot coming into the world. Farming is the role only rookies and first jobs can take, so they fill it
   * first; otherwise the eligible role furthest below its target (ties: random).
   */
  assign(bot: string, group: Group): Role {
    this.release(bot);
    const eligible = this.eligible(bot, group);
    const role = eligible.includes('farming') && this.deficit('farming') > 0 ? 'farming' : this.mostNeeded(eligible);
    return this.hold(bot, role);
  }

  /** The bot's time is up: the most needed role other than its own; its own again when it can take no other. */
  switchRole(bot: string, group: Group): Role {
    const current = this.held.get(bot)?.role;
    this.release(bot);
    const others = this.eligible(bot, group).filter((role) => role !== current);
    if (others.length === 0) return this.hold(bot, current ?? this.mostNeeded(this.eligible(bot, group)));
    return this.hold(bot, this.mostNeeded(others));
  }

  /** The bot's role, if it has one. */
  roleOf(bot: string): Role | undefined {
    return this.held.get(bot)?.role;
  }

  due(bot: string): boolean {
    const held = this.held.get(bot);
    return held !== undefined && this.now() >= held.until;
  }

  /** The bot left the world: its role is free. */
  release(bot: string): void {
    this.held.delete(bot);
  }

  /** The bot cannot do `role` any more (until the program starts again). */
  drop(bot: string, role: Role): void {
    let set = this.dropped.get(bot);
    if (set === undefined) this.dropped.set(bot, set = new Set());
    set.add(role);
  }

  counts(): Record<Role, number> {
    const counts = Object.fromEntries(ROLES.map((role) => [role, 0])) as Record<Role, number>;
    for (const { role } of this.held.values()) counts[role]++;
    return counts;
  }

  private eligible(bot: string, group: Group): Role[] {
    const dropped = this.dropped.get(bot);
    const roles = ROLES.filter((role) => !(group === 'veteran' && role === 'farming') && dropped?.has(role) !== true);
    // a bot that can do nothing else still wanders
    return roles.length > 0 ? roles : ['wandering'];
  }

  private deficit(role: Role): number {
    return this.targets[role] - this.counts()[role];
  }

  private mostNeeded(roles: readonly Role[]): Role {
    const best = Math.max(...roles.map((role) => this.deficit(role)));
    const ties = roles.filter((role) => this.deficit(role) === best);
    return ties[Math.min(ties.length - 1, Math.floor(this.random() * ties.length))]!;
  }

  private hold(bot: string, role: Role): Role {
    const [min, max] = DURATION[role];
    this.held.set(bot, { role, until: this.now() + min + this.random() * (max - min) });
    return role;
  }
}
