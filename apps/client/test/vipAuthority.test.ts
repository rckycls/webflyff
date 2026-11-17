// VIP1-VIP4 (vip-auth, 2026-11-17) are titles only: the chat lets a VIP do what a player does, and nothing more.

import { describe, expect, it } from 'vitest';
import { isAuthorizationHigher, isGameMaster } from '../src/world/authorization';
import { lineAction, suggest } from '../src/world/hud/chatCommands';
import { CHAT_COMMANDS, EMOTICONS } from '../src/world/hud/chatCommandTable';

const PLAYER = 'F'.charCodeAt(0);
const VIPS = ['A', 'B', 'C', 'E'].map((letter) => letter.charCodeAt(0));

describe('a VIP letter in the chat', () => {
  it('reaches what a player reaches, and no more', () => {
    for (const vip of VIPS) {
      for (const need of ['F', 'G', 'J', 'L', 'M', 'N', 'O', 'P']) {
        expect(isAuthorizationHigher(vip, need.charCodeAt(0))).toBe(isAuthorizationHigher(PLAYER, need.charCodeAt(0)));
      }
      expect(isGameMaster(vip)).toBe(false);
    }
  });

  it('sends /w and /s, drops a GM command, and suggests the same commands as for a player', () => {
    for (const vip of VIPS) {
      expect(lineAction('/w Hero hi', vip, CHAT_COMMANDS, EMOTICONS)).toEqual({ kind: 'send' });
      expect(lineAction('/s hello', vip, CHAT_COMMANDS, EMOTICONS)).toEqual(lineAction('/s hello', PLAYER, CHAT_COMMANDS, EMOTICONS));
      expect(lineAction('/ci 2800 5', vip, CHAT_COMMANDS, EMOTICONS)).toEqual({ kind: 'drop' });
      expect(suggest('/', vip, CHAT_COMMANDS).rows.map((r) => r.name)).toEqual(suggest('/', PLAYER, CHAT_COMMANDS).rows.map((r) => r.name));
    }
  });
});
