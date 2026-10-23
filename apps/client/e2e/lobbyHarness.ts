// A page for the e2e tests only (`/e2e/lobbyHarness.html` on the dev server; `vite build` does not ship it): the lobby
// as `src/main.ts` wires it, except that entering the world puts a stand-in world on the page and keeps every `done`
// the lobby gave, so a test can call them in an order the real world screen never would (a late `done` of an earlier entry).

import { LobbyApp } from '../src/lobby/LobbyApp';
import { LoginFlow } from '../src/lobby/LoginFlow';
import { openWebSocketChannel } from '../src/net/webSocketChannel';

/** Every `done` the lobby has handed out, in the order of the entries. */
export type Dones = ((message?: string) => void)[];

const root = document.getElementById('app');
if (root === null) throw new Error('lobbyHarness.html has no #app');

const dones: Dones = [];
(globalThis as { lobbyDones?: Dones }).lobbyDones = dones;

let app: LobbyApp | undefined;
// The same gateway address as the e2e config's, and the certifier address the scripted gateway is keyed by.
const flow = new LoginFlow(openWebSocketChannel('ws://127.0.0.1:9'), '172.31.238.55:23000', (event) => app?.handle(event));
app = new LobbyApp(root, flow, (entry, done) => {
  entry.login.close();
  // A world screen takes the whole page, as the real one will.
  root.replaceChildren(Object.assign(document.createElement('p'), { id: 'world', textContent: `In the world as ${entry.character.name}` }));
  dones.push(done);
});
