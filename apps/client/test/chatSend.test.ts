// 2026-11-09: a line sent as Neuz sends it (CWndMgr::ParsingChat, WndManager.cpp:3820-3999; the client halves of
// TextCmd_shout, _PartyChat, _GuildChat, FuncTextCmd.cpp): the 120-byte cut, the quotes, the word filter, the anti-spam.
import { describe, expect, it } from 'vitest';
import { ChatSender, wordChange } from '../src/world/hud/chatSend';
import type { SendOutcome } from '../src/world/hud/chatSend';
import { CHAT_COMMANDS, EMOTICONS } from '../src/world/hud/chatCommandTable';

const TEXTS: Record<string, { text: string; color: number }> = {
  TID_GAME_CHATSAMETEXT: { text: 'Unable to enter the same sentence twice in a row.', color: 0xffff0000 },
  TID_GAME_ERROR_CHATTING_1: { text: 'The last message could not be transmitted due to chat spam limitations.', color: 0xffff0000 },
  TID_GAME_ERROR_CHATTING_2: { text: 'You received %d minutes penalty because of too much of chatting', color: 0xffff0000 },
  TID_GAME_ERROR_CHATTING_3: { text: 'Currently your chat has been blocked.(Remaining: %d minute %d second)', color: 0xffff0000 },
  TID_GAME_PARTYNOTCHAT: { text: 'Unable to use the party chat function.', color: 0xffff0000 },
};
const FILTER = { alpha: { asshole: '*****', jerk: '*****' }, nonAlpha: { 'f.u': '***' } };

function sender(): { s: ChatSender; clock: { now: number } } {
  const clock = { now: 100_000 };
  const s = new ChatSender({ now: () => clock.now, text: (id) => TEXTS[id], commands: CHAT_COMMANDS, emoticons: EMOTICONS });
  s.setFilter(FILTER);
  return { s, clock };
}
const PLAYER = { authorization: 'F'.charCodeAt(0), partySize: 0 };
const sent = (outcome: SendOutcome) => outcome.send;
const notes = (outcome: SendOutcome) => outcome.notes.map((n) => [n.text, n.game === true]);

describe('ChatSender: a plain line (ParsingChat)', () => {
  it('trims, takes the quotes off, cuts at 120 bytes and filters the words', () => {
    const { s } = sender();
    expect(sent(s.line('   "hello there"  ', PLAYER))).toBe('hello there');
    expect(sent(s.line('x'.repeat(130), { ...PLAYER }))).toBeUndefined(); // within 0.7 s of the last: spam
    const { s: fresh } = sender();
    expect(sent(fresh.line('x'.repeat(130), PLAYER))).toBe('x'.repeat(120));
    const { s: rude } = sender();
    expect(sent(rude.line('you Asshole, f.u!', PLAYER))).toBe('you *******, ***!');
    expect(rude.line('   ', PLAYER)).toEqual({ notes: [] });
  });

  it('the same line within 2 s is not sent: a red line in the chat', () => {
    const { s, clock } = sender();
    expect(sent(s.line('hi', PLAYER))).toBe('hi');
    clock.now += 1500;
    const again = s.line('hi', PLAYER);
    expect(sent(again)).toBeUndefined();
    expect(notes(again)).toEqual([['Unable to enter the same sentence twice in a row.', false]]);
    clock.now += 600;
    expect(sent(s.line('hi', PLAYER))).toBe('hi');
  });

  it('a line within 0.7 s is refused; the 5th blocks the chat 3 minutes, which counts down', () => {
    const { s, clock } = sender();
    expect(sent(s.line('a', PLAYER))).toBe('a');
    for (let i = 1; i <= 4; i++) {
      clock.now += 100;
      const fast = s.line(`b${i}`, PLAYER);
      expect(sent(fast)).toBeUndefined();
      expect(notes(fast)).toEqual([['The last message could not be transmitted due to chat spam limitations.', false]]);
    }
    clock.now += 100;
    expect(notes(s.line('b5', PLAYER))).toEqual([['You received 3 minutes penalty because of too much of chatting', false]]);
    clock.now += 61_000;
    const blocked = s.line('later', PLAYER);
    expect(sent(blocked)).toBeUndefined();
    expect(notes(blocked)).toEqual([['Currently your chat has been blocked.(Remaining: 1 minute 59 second)', false]]);
    clock.now += 120_000;
    expect(sent(s.line('free', PLAYER))).toBe('free');
  });

  it('a line 0.7 to 1 s after the last is sent; the 2nd such blocks', () => {
    const { s, clock } = sender();
    s.line('a', PLAYER);
    clock.now += 800;
    expect(sent(s.line('b', PLAYER))).toBe('b');
    clock.now += 800;
    expect(notes(s.line('c', PLAYER))).toEqual([['You received 3 minutes penalty because of too much of chatting', false]]);
  });

  it('a game master skips it all', () => {
    const { s, clock } = sender();
    const gm = { authorization: 'L'.charCodeAt(0), partySize: 0 };
    s.line('a', gm);
    clock.now += 10;
    expect(sent(s.line('a', gm))).toBe('a');
  });

  it('a chat shortcut of the task bar within 3 s of the last is refused', () => {
    const { s, clock } = sender();
    expect(sent(s.line('macro', { ...PLAYER, shortcut: true }))).toBe('macro');
    clock.now += 2500;
    expect(notes(s.line('macro two', { ...PLAYER, shortcut: true })))
      .toEqual([['The last message could not be transmitted due to chat spam limitations.', false]]);
  });
});

describe('ChatSender: commands (ParsingCommand and the client halves)', () => {
  it('a shout goes as "/s text", filtered; the same shout within 3 s is refused; a bare "#" is not sent', () => {
    const { s, clock } = sender();
    expect(sent(s.line('/shout hey jerk', PLAYER))).toBe('/s hey ****');
    clock.now += 2000;
    const again = s.line('/s hey jerk', PLAYER);
    expect(sent(again)).toBeUndefined();
    expect(notes(again)).toEqual([['Unable to enter the same sentence twice in a row.', true]]);
    clock.now += 2000;
    expect(s.line('/s #', PLAYER)).toEqual({ notes: [] });
  });

  it('party chat needs a party of two; guild chat goes as "/g text"', () => {
    const { s } = sender();
    expect(notes(s.line('/p hello', PLAYER))).toEqual([['Unable to use the party chat function.', true]]);
    expect(sent(s.line('/partychat hello', { ...PLAYER, partySize: 2 }))).toBe('/p hello');
    expect(sent(s.line('/g hi jerk', PLAYER))).toBe('/g hi ****');
  });

  it('a whisper goes as typed; an unknown command nowhere; a client command runs here', () => {
    const { s } = sender();
    expect(sent(s.line('/w Rocky hi', PLAYER))).toBe('/w Rocky hi');
    expect(s.line('/nosuch thing', PLAYER)).toEqual({ notes: [] });
    expect(s.line('/position', PLAYER)).toEqual({ client: { command: 'position', args: '' }, notes: [] });
  });
});

describe('wordChange (CWndMgr::WordChange, __FILTER_0705)', () => {
  it('a word of letters in the list, in any case, becomes asterisks of its length; the others are replaced', () => {
    expect(wordChange('JERK jerky jerk2 jerk, jerk.', FILTER)).toBe('**** jerky jerk2 ****, jerk.');
    expect(wordChange('f.u', FILTER)).toBe('***');
  });
});
