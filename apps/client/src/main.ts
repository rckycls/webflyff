import { clientConfig } from './config';
import { LobbyApp } from './lobby/LobbyApp';
import { LoginFlow } from './lobby/LoginFlow';
import { openWebSocketChannel } from './net/webSocketChannel';

const root = document.getElementById('app');
if (root === null) throw new Error('index.html has no #app');

// The flow reports to the page and the page drives the flow, so each is made before the other can be asked for.
let app: LobbyApp | undefined;
const flow = new LoginFlow(
  openWebSocketChannel(clientConfig.gatewayUrl),
  clientConfig.certifierAddress,
  (event) => app?.handle(event),
);
app = new LobbyApp(root, flow, (entry, done) => {
  // The world screen comes later. Until then the player is sent back to the login form, with the login-server connection closed.
  entry.login.close();
  done("Entering the world isn't built yet.");
});
