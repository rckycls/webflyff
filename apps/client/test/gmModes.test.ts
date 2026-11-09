import { describe, expect, it } from 'vitest';
import { INVISIBLE_ALPHA, Mode, bodyAlpha, isInvisible, modeLine, showsBubble } from '../src/world/gmModes';

const TEXTS: Record<string, string> = {
  TID_ADMIN_IMMORTAL: 'Undying1', TID_ADMIN_IMMORTALHALF: 'Undying2', TID_ADMIN_INVISIBLE: 'Invisible',
  TID_ADMIN_MIGHTY: 'OneKill', TID_ADMIN_NOMOVING: 'Freeze player', TID_ADMIN_STATE: 'Status', TID_ADMIN_NORMAL: 'Normal',
};
const text = (id: string) => (TEXTS[id] === undefined ? undefined : { text: TEXTS[id]!, color: 0xffffff99 });
const ADMIN = 'P'.charCodeAt(0), GM = 'L'.charCodeAt(0), PLAYER = 'F'.charCodeAt(0), HELPER = 'J'.charCodeAt(0);

describe('modeLine: the own game master\'s state after MODIFYMODE (OnModifyMode, DPClient.cpp:12285-12356)', () => {
  it('names each mode, run together as the English texts have no spaces, then "Status"', () => {
    expect(modeLine(Mode.MATCHLESS | Mode.TRANSPARENT, ADMIN, text)).toEqual({ text: 'Undying1InvisibleStatus', color: 0xffffff99 });
    expect(modeLine(Mode.MATCHLESS2 | Mode.ONEKILL | Mode.DONMOVE, GM, text)?.text).toBe('Undying2OneKillFreeze playerStatus');
    expect(modeLine(Mode.FREEPK | Mode.PVPCONFIRM, GM, text)?.text).toBe('PK PVP Status');
  });

  it('says "Normal" for no mode at all', () => {
    expect(modeLine(0, ADMIN, text)?.text).toBe('Normal');
  });

  it('leaves out the Korean literal words an English Neuz cannot draw, but still says "Status"', () => {
    expect(modeLine(Mode.TALK | Mode.ITEM, ADMIN, text)?.text).toBe('Status');
  });

  it('says nothing to a player who is not a game master (IsAuthHigher( AUTH_GAMEMASTER ))', () => {
    expect(modeLine(Mode.TRANSPARENT, PLAYER, text)).toBeNull();
    expect(modeLine(Mode.TRANSPARENT, HELPER, text)).toBeNull();
  });
});

const player = (authorization: number, mode: number, isSelf = false) =>
  ({ isSelf, added: { player: { authorization, mode } } });

describe('an invisible player (TRANSPARENT_MODE) as Neuz draws it', () => {
  it('isInvisible reads the mode bit; a monster never is', () => {
    expect(isInvisible(player(ADMIN, Mode.TRANSPARENT))).toBe(true);
    expect(isInvisible(player(ADMIN, Mode.MATCHLESS))).toBe(false);
    expect(isInvisible({ isSelf: false, added: {} })).toBe(false);
  });

  it('bodyAlpha: the own body at blend 80, another GM sees it at 80, a player not at all (MoverRender.cpp:517-531)', () => {
    expect(INVISIBLE_ALPHA).toBeCloseTo(80 / 255);
    expect(bodyAlpha(player(ADMIN, 0), PLAYER)).toBe(1);
    expect(bodyAlpha(player(ADMIN, Mode.TRANSPARENT, true), ADMIN)).toBe(INVISIBLE_ALPHA);
    expect(bodyAlpha(player(ADMIN, Mode.TRANSPARENT), GM)).toBe(INVISIBLE_ALPHA);
    expect(bodyAlpha(player(GM, Mode.TRANSPARENT), PLAYER)).toBe(0);
    expect(bodyAlpha(player(GM, Mode.TRANSPARENT), HELPER)).toBe(0);
  });

  it('showsBubble: no bubble for an invisible game master, the own one included (WndManager.cpp:4101)', () => {
    expect(showsBubble(player(ADMIN, Mode.TRANSPARENT, true))).toBe(false);
    expect(showsBubble(player(GM, Mode.TRANSPARENT))).toBe(false);
    expect(showsBubble(player(GM, 0))).toBe(true);
    expect(showsBubble(player(PLAYER, Mode.TRANSPARENT))).toBe(true);
  });
});
