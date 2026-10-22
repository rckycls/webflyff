import { CloseCode } from '@flyffweb/protocol';

/** The server error codes `LoginFlow` acts on (`MsgHdr.h`; 1319 is `ERROR_NO_SUCH_GROUP` of `winerror.h`). */
export const ServerError = {
  DUPLICATE_ACCOUNT: 103,
  FLYFF_PASSWORD: 120,
  CERT_GENERAL: 136,
  NO_SUCH_GROUP: 1319,
} as const;

// The text of each code `CDPCertified::OnError` and `CDPLoginClient::OnError` show, from `Resource/textClient.txt.txt`.
// Some texts have two spaces after a full stop, as in that file.
const SERVER_ERRORS: ReadonlyMap<number, string> = new Map([
  [100, 'That ID is already in use.'],
  [ServerError.DUPLICATE_ACCOUNT, 'This account is already connected.  Do you want to disconnect it?'],
  [105, 'The slot is in use.'],
  [107, 'Old version of client.'],
  [108, 'Server capacity has been reached.'],
  [109, 'Service currently unavailable. Please check flyff web site for details.'],
  [111, 'Character name is not allowed.'],
  [119, 'This account is banned. Contact FlyFF Support for assistance.'],
  [ServerError.FLYFF_PASSWORD, 'Login details incorrect.  Please try again.'],
  [121, 'Login details incorrect.  Please try again.'],
  [122, 'Account verification required. Please visit the Flyff website.'],
  [123, 'Sorry. Children below 12 years of age are not permitted to play FlyFF.'],
  [124, 'The permission of a parent or guardian is required for players under 13 years old.'],
  [125, 'Unable to connect to the game. Account may have been terminated by user.'],
  [126, 'No information about charging'],
  [127, 'DB Error'],
  [128, 'Your time is up.'],
  [129, 'Other DB Error'],
  [130, 'Other DB Error'],
  [131, 'You cannot connect after 22:00.'],
  [132, 'You cannot connect from outside the service for flyff.'],
  [133, 'Your character is being checked at the moment. Please log in after a while.'],
  [134, 'Wrong Password. Cannot log into account for 15 seconds.'],
  [135, 'Wrong Passwords 3 times. Cannot log into account for 15 minutes.'],
  [ServerError.CERT_GENERAL, 'Server Verification Error'],
  [137, 'Session is over. Please try again.'],
  [138, 'Version mismatch.  Try to patch again.'],
  [1316, 'That character name is already in use.'],
  [ServerError.NO_SUCH_GROUP, 'Oops. Try again.'],
]);

/** The message for a server error code; a code the table does not have shows its number. */
export function errorText(code: number): string {
  return SERVER_ERRORS.get(code) ?? `Error ${code}`;
}

const TOO_MUCH_DATA = 'Too much data was sent. Disconnected.';

const CLOSE_TEXTS: ReadonlyMap<number, string> = new Map([
  [CloseCode.SERVER_UNREACHABLE, 'The game server is not reachable. Try again later.'],
  [CloseCode.SERVER_CLOSED, 'Disconnected from the server.'],
  [CloseCode.NOT_ALLOWED, 'This server address is not allowed.'],
  [CloseCode.LIMIT, TOO_MUCH_DATA],
  // `ws` closes a message over the gateway's size limit with 1009 before the relay can answer 4004.
  [1009, TOO_MUCH_DATA],
  [CloseCode.BAD_SERVER_DATA, 'The server sent data the game could not read.'],
  [CloseCode.FORBIDDEN_PACKET, 'Disconnected: the game sent a forbidden packet.'],
  [CloseCode.TOO_MANY_CONNECTIONS, 'Too many connections from your network.'],
]);

/** The message for the close code of a WebSocket: the gateway's own codes, and 1006 and the rest as "cannot reach". */
export function closeText(code: number): string {
  return CLOSE_TEXTS.get(code) ?? 'Cannot reach the game gateway.';
}
