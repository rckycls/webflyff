import { describe, expect, it } from 'vitest';
import { closeText, errorText } from '../src/lobby/errorText';

describe('errorText', () => {
  it('gives the text of every server error code Neuz knows (Resource/textClient.txt.txt)', () => {
    const table: [number, string][] = [
      [100, 'That ID is already in use.'],
      [103, 'This account is already connected.  Do you want to disconnect it?'],
      [105, 'The slot is in use.'],
      [107, 'Old version of client.'],
      [108, 'Server capacity has been reached.'],
      [109, 'Service currently unavailable. Please check flyff web site for details.'],
      [111, 'Character name is not allowed.'],
      [119, 'This account is banned. Contact FlyFF Support for assistance.'],
      [120, 'Login details incorrect.  Please try again.'],
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
      [136, 'Server Verification Error'],
      [137, 'Session is over. Please try again.'],
      [138, 'Version mismatch.  Try to patch again.'],
      [1316, 'That character name is already in use.'],
      [1319, 'Oops. Try again.'],
    ];
    for (const [code, text] of table) expect(errorText(code), `code ${code}`).toBe(text);
  });

  it('shows the number of a code it does not know', () => {
    expect(errorText(999)).toBe('Error 999');
    expect(errorText(0)).toBe('Error 0');
    expect(errorText(-1)).toBe('Error -1');
  });
});

describe('closeText', () => {
  it('gives each gateway close code a plain message', () => {
    expect(closeText(4001)).toBe('The game server is not reachable. Try again later.');
    expect(closeText(4002)).toBe('Disconnected from the server.');
    expect(closeText(4003)).toBe('This server address is not allowed.');
    expect(closeText(4004)).toBe('Too much data was sent. Disconnected.');
    expect(closeText(4005)).toBe('The server sent data the game could not read.');
    expect(closeText(4006)).toBe('Disconnected: the game sent a forbidden packet.');
    expect(closeText(4007)).toBe('Too many connections from your network.');
  });

  it('gives the message of 4004 to 1009, the code ws closes a message over the packet limit with', () => {
    expect(closeText(1009)).toBe(closeText(4004));
  });

  it('says the gateway cannot be reached for any other code', () => {
    for (const code of [1000, 1001, 1006, 1011, 4000, 4008, 0]) expect(closeText(code), `code ${code}`).toBe('Cannot reach the game gateway.');
  });
});
