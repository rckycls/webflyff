import { watchTouch } from '@flyffweb/scene';
import { clientConfig } from './config';
import { installLandscape } from './landscape';
import { LobbyApp } from './lobby/LobbyApp';
import { LoginFlow } from './lobby/LoginFlow';
import { openWebSocketChannel } from './net/webSocketChannel';
import { installTestHooks } from './testHooks';
import { WorldScreen } from './world/WorldScreen';

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

// One gateway for the lobby and the world: the world screen opens the cache-server connection through it.
const openChannel = openWebSocketChannel(clientConfig.gatewayUrl);

// The flow reports to the page and the page drives the flow, so each is made before the other can be asked for.
let app: LobbyApp | undefined;
const flow = new LoginFlow(openChannel, clientConfig.certifierAddress, (event) => app?.handle(event));
// Entering opens the world screen over the page; when the world is over, `done` brings the login form back with its message.
app = new LobbyApp(root, flow, (entry, done) => {
  WorldScreen.open(root, entry, openChannel, done);
}, () => void landscape.requestLock());
