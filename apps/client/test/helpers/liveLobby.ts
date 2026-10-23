import { CloseCode, NULL_ID } from '@flyffweb/protocol';
import type { NewCharacter, ServerEntry } from '@flyffweb/protocol';
import { JOB_VAGRANT, Sex, hairColorFor } from '../../src/lobby/appearance';
import { closeText, errorText } from '../../src/lobby/errorText';
import { LoginFlow } from '../../src/lobby/LoginFlow';
import type { LobbyEvent } from '../../src/lobby/LoginFlow';
import type { Link } from './liveLink';

/** How long a flow gets for an answer that needs the database. The certifier's own timeout (20 s) fires first and ends the login with an error. */
export const LOGIN_WAIT_MS = 25000;
export const WAIT_MS = 15000;

/** The first channel (an entry with a parent server) that is enabled and not full, as the lobby offers it. */
export const isOpenChannel = (e: ServerEntry): boolean =>
  e.parent !== NULL_ID && e.enabled !== 0 && !(e.maxPlayers > 0 && e.playerCount >= e.maxPlayers);

/** A male vagrant with the default look, as the create screen starts with it. */
export function newVagrant(slot: number, name: string, bankPin: string): NewCharacter {
  return {
    slot,
    name,
    face: 0,
    costume: 0,
    skinSet: 0,
    hairMesh: 0,
    hairColor: hairColorFor(Sex.MALE, 0),
    sex: Sex.MALE,
    job: JOB_VAGRANT,
    headMesh: 0,
    bankPin: Number(bankPin),
  };
}

/** Why an event the test waited for did not come: what came instead, and what usually causes it. */
export function explain(event: LobbyEvent): string {
  const said = 'message' in event ? `${event.type} ("${event.message}")` : event.type;
  let hint = '';
  if (event.type === 'alreadyConnected') {
    hint = 'The test account is logged in somewhere else (a game client, or a session that is still closing). Log it out and run again.';
  } else if (event.type === 'closed' && event.message === closeText(CloseCode.SERVER_UNREACHABLE)) {
    hint = 'The gateway could not connect to the server. Is it running, and do the routes in live.config.json point at where it listens?';
  } else if (event.type === 'error' && (event.message === errorText(134) || event.message === errorText(135))) {
    hint = 'The certifier blocks this address after an earlier wrong password (15 seconds, or 15 minutes after three in a row): wait and run again. '
      + 'If it happened in the per-address test, the certifier is not telling the simulated addresses apart: is the rebuilt Certifier.exe running, '
      + 'with a Gateway "127.0.0.1" line in Certifier.ini?';
  } else if (event.type === 'error' && event.message === errorText(120)) {
    hint = 'Check account and password in live.config.json. (A wrong password also blocks this address for 15 seconds.)';
  }
  return hint === '' ? said : `${said}\n${hint}`;
}

/** The flow reported another event than the one the test took: `event` is what it reported. */
export class UnexpectedEvent extends Error {
  constructor(message: string, readonly event: LobbyEvent) {
    super(message);
  }
}

/** One `LoginFlow` on its own `Link`, with its events queued for the test to take one by one. */
export class LiveLobby {
  readonly flow: LoginFlow;
  private readonly queue: LobbyEvent[] = [];
  private waiting: ((event: LobbyEvent) => void) | undefined;

  constructor(readonly link: Link, certifierAddress: string) {
    this.flow = new LoginFlow(link.open, certifierAddress, (event) => this.onEvent(event));
  }

  /** Takes the next event, in order, and fails with what happened instead (an `UnexpectedEvent`) unless it is a `type` event. */
  async expect<T extends LobbyEvent['type']>(type: T, timeoutMs = WAIT_MS): Promise<Extract<LobbyEvent, { type: T }>> {
    const event = await this.take(`a ${type} event`, timeoutMs);
    if (event.type !== type) throw new UnexpectedEvent(`expected a ${type} event, but the flow reported ${explain(event)}`, event);
    return event as Extract<LobbyEvent, { type: T }>;
  }

  /** Takes the next event, which must be an `error` or `closed` event with exactly this message. */
  async expectMessage(type: 'error' | 'closed', message: string, timeoutMs = LOGIN_WAIT_MS): Promise<void> {
    const event = await this.take(`the ${type} "${message}"`, timeoutMs);
    if (!('message' in event) || event.type !== type || event.message !== message) {
      throw new UnexpectedEvent(`expected the ${type} "${message}", but the flow reported ${explain(event)}`, event);
    }
  }

  /** Ends the flow and waits until every connection it opened has closed, so the next flow starts clean. */
  async end(): Promise<void> {
    this.flow.dispose();
    await this.link.closed();
  }

  private take(wanted: string, timeoutMs: number): Promise<LobbyEvent> {
    const queued = this.queue.shift();
    if (queued !== undefined) return Promise.resolve(queued);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiting = undefined;
        reject(new Error(`expected ${wanted}, but the flow said nothing for ${timeoutMs / 1000} s`));
      }, timeoutMs);
      this.waiting = (event) => {
        clearTimeout(timer);
        resolve(event);
      };
    });
  }

  private onEvent(event: LobbyEvent): void {
    const waiting = this.waiting;
    this.waiting = undefined;
    if (waiting !== undefined) waiting(event);
    else this.queue.push(event);
  }
}
