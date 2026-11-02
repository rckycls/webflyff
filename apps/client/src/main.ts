import { watchTouch } from '@flyffweb/scene';
import { clientConfig } from './config';
import { installLandscape } from './landscape';
import { LobbyApp } from './lobby/LobbyApp';
import { LoginFlow } from './lobby/LoginFlow';
import { openWebSocketChannel } from './net/webSocketChannel';
import { installTestHooks } from './testHooks';
import { WorldScreen } from './world/WorldScreen';
import { loadAudio } from './audio/audioCatalog';
import { installClickSound } from './audio/clickSound';
import { GameAudio } from './audio/gameAudio';
import { PREFETCHED } from './audio/soundIds';
import { lobbyAssets } from './lobby/skin';
import './lobby/lobby.css';

const root = document.getElementById('app');
if (root === null) throw new Error('index.html has no #app');

// `window.__client` (src/testHooks.ts) is for the dev server, which the Playwright tests run against, and for a build made
// on purpose with `VITE_TEST_HOOKS=1`. A page built for the public does not get it: its `pause()` and `step(n)` run the
// game's rules at will (ten seconds of them in one frame), and `movers()` and `own()` read its state, which no player needs.
if (import.meta.env.DEV || import.meta.env.VITE_TEST_HOOKS === '1') installTestHooks();

// The whole game is landscape (spec §3.10): a cover over the page while it is taller than wide, and on a touch screen full
// screen and the landscape lock asked for by the taps that log in and enter the world. A touch screen is told by the
// one touch rule, the joystick's (`watchTouch`).
const landscape = installLandscape(root, watchTouch(window));

// The game's music and sound (Piece 6 M2), one for the lobby and the world: it starts with the first tap or key, and
// every button under the page plays Neuz's click. The audio catalog is read from the lobby's asset store; without it the
// game is silent.
const audio = new GameAudio({
  context: () => (typeof AudioContext === 'undefined' ? null : new AudioContext()),
  media: () => new Audio(),
  doc: document,
  storage: (() => { try { return window.localStorage; } catch { return null; } })(),
  report: (error) => console.warn(error.message),
});
installClickSound(root, (id) => audio.play(id));
void lobbyAssets().then(async (store) => {
  audio.setCatalog(await loadAudio(store, (error) => console.warn(error.message)), store);
  audio.prefetch(PREFETCHED);
}).catch(() => {});

// One gateway for the lobby and the world: the world screen opens the cache-server connection through it.
const openChannel = openWebSocketChannel(clientConfig.gatewayUrl);

// The flow reports to the page and the page drives the flow, so each is made before the other can be asked for.
let app: LobbyApp | undefined;
const flow = new LoginFlow(openChannel, clientConfig.certifierAddress, (event) => app?.handle(event));
// Entering opens the world screen over the page; when the world is over, `done` brings the login form back with its message.
app = new LobbyApp(root, flow, (entry, done, onDrop, reconnected) => {
  WorldScreen.open(root, entry, openChannel, done, audio, onDrop, reconnected);
}, () => void landscape.requestLock(), audio);
