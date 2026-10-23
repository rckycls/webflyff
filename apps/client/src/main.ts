import { clientConfig } from './config';
import { LobbyApp } from './lobby/LobbyApp';
import { LoginFlow } from './lobby/LoginFlow';
import { openWebSocketChannel } from './net/webSocketChannel';
import { installTestHooks } from './testHooks';
import { WorldScreen } from './world/WorldScreen';

const root = document.getElementById('app');
if (root === null) throw new Error('index.html has no #app');

installTestHooks();

// One gateway for the lobby and the world: the world screen opens the cache-server connection through it.
const openChannel = openWebSocketChannel(clientConfig.gatewayUrl);

// The flow reports to the page and the page drives the flow, so each is made before the other can be asked for.
let app: LobbyApp | undefined;
const flow = new LoginFlow(openChannel, clientConfig.certifierAddress, (event) => app?.handle(event));
// Entering opens the world screen over the page; when the world is over, `done` brings the login form back with its message.
app = new LobbyApp(root, flow, (entry, done) => {
  WorldScreen.open(root, entry, openChannel, done);
});
