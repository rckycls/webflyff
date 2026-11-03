// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NpcAction } from '@flyffweb/protocol';
import { NO_QUESTS, type QuestLookup } from '../src/world/hud/dialogue/dialogState';
import { DialogWindow, ENTER_RECT, PICTURE_RECT, TEXT_RECT } from '../src/world/hud/dialogue/dialogWindow';

const art = { url: (key: string) => `/assets/${key}`, sheets: null };
const JULIA = { key: 'MaFl_Juria', name: 'Julia', menus: [0, 2], image: 'ui/char/char_juria.png' };
const say = (text: string, quest = 0): NpcAction => ({ kind: 'say', text, quest });
const key = (word: string, k = word): NpcAction => ({ kind: 'key', label: word, key: k, param: 0, quest: 0 });
const answer = (word: string, k = word): NpcAction => ({ kind: 'answer', label: word, key: k, param: 0, quest: 0 });
const row = (kind: 'newQuest' | 'currentQuest', title: string, k: string, quest: number): NpcAction =>
  ({ kind, label: title, key: k, param: 0, quest });

const windows: DialogWindow[] = [];
afterEach(() => { for (const window of windows.splice(0)) window.dispose(); });

function make(quests: QuestLookup = NO_QUESTS) {
  let now = 0;
  const send = vi.fn();
  const dialog = new DialogWindow(art, new Map(), quests, send, document, () => now);
  windows.push(dialog);
  document.body.append(dialog.element);
  dialog.open(9002, JULIA, 800);
  const q = <T extends Element = HTMLElement>(selector: string) => dialog.frame.element.querySelector<T & HTMLElement>(selector);
  const qa = (selector: string) => [...dialog.frame.element.querySelectorAll<HTMLElement>(selector)];
  return { dialog, send, q, qa, later: (ms: number) => { now += ms; } };
}

describe('DialogWindow (APP_DIALOG_EX, CWndDialog)', () => {
  it("shows a SAY's text as text, never as markup", () => {
    const { dialog, q } = make();
    dialog.receive(say('<img src=x onerror=alert(1)> &amp;'));
    expect(q('.dialog-text img')).toBeNull();
    expect(q('.dialog-text')!.textContent).toContain('<img src=x onerror=alert(1)> &amp;');
  });

  it('draws the picture, the title and the text where resdata.inc puts them', () => {
    const { q } = make();
    const picture = q<HTMLImageElement>('img.dialog-picture')!;
    expect(picture.src).toContain('/assets/ui/char/char_juria.png');
    expect([picture.style.left, picture.style.top, picture.style.width, picture.style.height]).toEqual(['6px', '22px', '200px', '240px']);
    expect(PICTURE_RECT).toEqual({ left: 6, top: 22, width: 200, height: 240 });
    expect(q('.dialog-title')!.textContent).toBe('Dialog');
    const text = q('.dialog-text')!;
    expect([text.style.left, text.style.top, text.style.width, text.style.height]).toEqual(['218px', '38px', '268px', '168px']);
    expect(text.style.overflowY).toBe('auto');
    expect(TEXT_RECT).toEqual({ left: 218, top: 38, width: 268, height: 168 });
  });

  it('turns pages with the Enter button, shown only before the last page', () => {
    const { dialog, q } = make();
    dialog.receive(say('first'));
    dialog.receive(say('second'));
    const enter = q<HTMLButtonElement>('button.dialog-enter')!;
    expect([enter.style.left, enter.style.top]).toEqual([`${ENTER_RECT.left}px`, `${ENTER_RECT.top}px`]);
    expect(enter.hidden).toBe(false);
    expect(q('.dialog-text')!.textContent).toContain('first');
    enter.click();
    expect(q('.dialog-text')!.textContent).toContain('second');
    expect(q<HTMLButtonElement>('button.dialog-enter')!.hidden).toBe(true);
  });

  it('links, keys, answers and quest rows send through the state', () => {
    const { dialog, send, q, later } = make();
    dialog.receive(say('Pick [x][k]'));
    q<HTMLButtonElement>('button.dialog-link[data-dialog-link="k"]')!.click();
    expect(send).toHaveBeenLastCalledWith({ key: 'k', param: 0, quest: 0 });
    later(1000);
    dialog.receive(key('Introduction', 'intro'));
    q<HTMLButtonElement>('button.dialog-key[data-dialog-key="intro"]')!.click();
    expect(send).toHaveBeenLastCalledWith({ key: 'intro', param: 0, quest: 0 });
    later(1000);
    dialog.receive(say('Will you?'));
    dialog.receive(answer('__YES__', 'QUEST_BEGIN_YES'));
    const yes = q<HTMLButtonElement>('button[data-dialog-answer="0"]')!;
    expect(yes.style.backgroundImage).toContain('buttyes');
    expect([yes.style.width, yes.style.height]).toEqual(['72px', '20px']);
    yes.click();
    expect(send).toHaveBeenLastCalledWith({ key: 'QUEST_BEGIN_YES', param: 0, quest: 0 });
    later(1000);
    dialog.receive(row('newQuest', 'Report', 'QUEST_BEGIN', 5));
    q<HTMLButtonElement>('button.dialog-key[data-dialog-key="New Quest"]')!.click();
    q<HTMLButtonElement>('button[data-quest-row="0"]')!.click();
    expect(send).toHaveBeenLastCalledWith({ key: 'QUEST_BEGIN', param: 0, quest: 5 });
    expect(send).toHaveBeenCalledTimes(4);
  });

  it('special answers sit 90 px apart, centred under the text, 20 px over its bottom', () => {
    const { dialog, qa } = make();
    dialog.receive(say('Accept?'));
    dialog.receive(answer('__YES__'));
    dialog.receive(answer('__NO__'));
    const buttons = qa('button[data-dialog-answer]');
    expect(buttons.map((button) => [button.style.left, button.style.top])).toEqual([['262px', '186px'], ['352px', '186px']]);
  });

  it('the New Quest key shows its rows with their icons; an empty list says so', () => {
    const ready: QuestLookup = {
      titleOf: (id) => (id === 7 ? { title: 'Known', levelMin: 1, levelMax: 15 } : undefined),
      isReadyToHandIn: (id) => id === 8,
    };
    const { dialog, q, qa, later } = make(ready);
    dialog.receive(row('newQuest', 'Later', 'QUEST_NEXT_LEVEL', 6));
    dialog.receive(row('newQuest', 'Known', 'QUEST_BEGIN', 7));
    dialog.receive(row('currentQuest', 'Busy', 'QUEST_END', 9));
    dialog.receive(row('currentQuest', 'Done', 'QUEST_END', 8));
    q<HTMLButtonElement>('button.dialog-key[data-dialog-key="New Quest"]')!.click();
    const rows = qa('[data-quest-list="new"] img');
    expect(rows.map((img) => (img as HTMLImageElement).src.replace(/.*\//, ''))).toEqual(['questuipaperred.png', 'questuipapergreen.png']);
    expect(qa('button[data-quest-row]').map((button) => button.textContent)).toEqual(['Later', '[1~15] Known']);
    later(1000);
    q<HTMLButtonElement>('button.dialog-key[data-dialog-key="Quests in Progress"]')!.click();
    expect(qa('[data-quest-list="current"] img').map((img) => (img as HTMLImageElement).src.replace(/.*\//, '')))
      .toEqual(['questuipapergray.png', 'questuipaperyellow.png']);
    dialog.receive({ kind: 'clear' });
    dialog.receive(key('New Quest'));
    later(1000);
    q<HTMLButtonElement>('button.dialog-key[data-dialog-key="New Quest"]')!.click();
    expect(q('.dialog-text')!.textContent).toBe('No New Quests');
  });

  it('EXIT, the close button and Escape close it; dispose removes it', () => {
    const { dialog } = make();
    dialog.receive({ kind: 'exit' });
    expect([dialog.frame.isOpen, dialog.npcId]).toEqual([false, null]);
    dialog.open(9002, JULIA, 800);
    dialog.frame.element.querySelector<HTMLButtonElement>('.hud-window-close')!.click();
    expect(dialog.frame.isOpen).toBe(false);
    dialog.open(9002, JULIA, 800);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(dialog.frame.isOpen).toBe(false);
    dialog.dispose();
    expect(dialog.element.isConnected).toBe(false);
  });
});

describe('DialogWindow: final review fixes', () => {
  it('a tap on the text turns the page (spec §3.1); a tap on a link does not', () => {
    const { dialog, send, q } = make();
    dialog.receive(say('first [go][k]'));
    dialog.receive(say('second'));
    q<HTMLButtonElement>('button.dialog-link')!.click();
    expect(send).toHaveBeenCalledTimes(1); // the link sent, and the page went with BeginText
    dialog.receive(say('one'));
    dialog.receive(say('two'));
    q('.dialog-text')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(q('.dialog-text')!.textContent).toContain('two');
    q('.dialog-text')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(q('.dialog-text')!.textContent).toContain('two'); // the last page stays
  });

  it('the keys area scrolls when the keys outgrow it', () => {
    const { q } = make();
    expect(q('.dialog-keys')!.style.overflowY).toBe('auto');
  });
});
