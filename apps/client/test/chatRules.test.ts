// The desktop chat's rules, as Neuz V15's CWndChat has them (docs/superpowers/specs/2026-11-09-chat-desktop-research.md).
import { describe, expect, it } from 'vitest';
import {
  CHATSTY, CHAT_TABS, DEFAULT_FILTERS, chatLayout, chatLine, editStrip, focusPrefix, logGets, replyLine, tabShows,
  whisperNameOf, whisperedName,
} from '../src/world/hud/chatRules';
import { resizeDirection, resizeRect } from '../src/world/hud/frame';

describe('chatLine: a line as DPClient.cpp writes it', () => {
  it('a line said nearby is "Name : text" in white (OnChat)', () => {
    expect(chatLine({ kind: 'general', sender: 'Rocky', text: 'hi' }, 'Webby'))
      .toEqual({ text: 'Rocky : hi', color: 0xffffffff, style: CHATSTY.GENERAL, said: true });
  });
  it('a whisper is "-> [to]" when it is your own, "<- [from]" otherwise, in yellow (OnWhisper)', () => {
    expect(chatLine({ kind: 'whisper', sender: 'Webby', recipient: 'Rocky', text: 'yo' }, 'Webby'))
      .toEqual({ text: '-> [Rocky] yo', color: 0xffffff00, style: CHATSTY.WHISPER });
    expect(chatLine({ kind: 'whisper', sender: 'Rocky', recipient: 'Webby', text: 'yo' }, 'Webby'))
      .toEqual({ text: '<- [Rocky] yo', color: 0xffffff00, style: CHATSTY.WHISPER });
  });
  it('shout, party and guild are "[Name] text" in their colours', () => {
    expect(chatLine({ kind: 'shout', sender: 'Rocky', text: 'hey', color: 0xffaabbcc }, 'Webby'))
      .toEqual({ text: '[Rocky] hey', color: 0xffaabbcc, style: CHATSTY.SHOUT });
    expect(chatLine({ kind: 'shout', sender: 'Rocky', text: 'hey' }, 'Webby').color).toBe(0xffff99cc);
    expect(chatLine({ kind: 'party', sender: 'Lead', text: 'go' }, 'Webby'))
      .toEqual({ text: '[Lead] go', color: 0xff99cc00, style: CHATSTY.PARTY });
    expect(chatLine({ kind: 'guild', sender: 'Gm', text: 'gg' }, 'Webby'))
      .toEqual({ text: '[Gm] gg', color: 0xffffbaff, style: CHATSTY.GUILD });
  });
  it('an announcement is its text in light yellow, a system line; a game line keeps its colour', () => {
    expect(chatLine({ kind: 'announcement', text: 'Server up' }, 'Webby'))
      .toEqual({ text: 'Server up', color: 0xffffff99, style: CHATSTY.SYSTEM });
    expect(chatLine({ kind: 'game', text: 'You got 3 Penya', color: 0xffff0000 }, 'Webby'))
      .toEqual({ text: 'You got 3 Penya', color: 0xffff0000, style: CHATSTY.GAME });
    expect(chatLine({ kind: 'game', text: 'x' }, 'Webby').color).toBe(0xffffffff);
    // 2026-11-10: a game line with another style (OnGetPlayerCount's CHATSTY_GENERAL) keeps it
    expect(chatLine({ kind: 'game', text: '[World CCU] 3', style: CHATSTY.GENERAL }, 'Webby').style).toBe(CHATSTY.GENERAL);
    expect(chatLine({ kind: 'game', text: 'x' }, 'Webby').style).toBe(CHATSTY.GAME);
  });
});

describe('the tabs and their filters (SetChannel, PutString, HwOption.cpp:222-227)', () => {
  it('has the five tabs in order, each with its picture and prefix', () => {
    expect(CHAT_TABS.map((tab) => [tab.label, tab.picture, tab.prefix])).toEqual([
      ['Chat', 'ButtChatChat.BMP', ''], ['Whisper', 'ButtChatWhisper.BMP', '/w '], ['Shout', 'ButtChatShout.BMP', '/s '],
      ['Party', 'ButtChatTroupe.BMP', '/p '], ['Guild', 'ButtChatGuild.BMP', '/g '],
    ]);
  });
  it('Chat shows every chat style; the others General and their own; system and help everywhere; game lines nowhere', () => {
    const all = [CHATSTY.GENERAL, CHATSTY.WHISPER, CHATSTY.SHOUT, CHATSTY.PARTY, CHATSTY.GUILD];
    expect(all.map((style) => tabShows(DEFAULT_FILTERS[0]!, style))).toEqual([true, true, true, true, true]);
    expect(all.map((style) => tabShows(DEFAULT_FILTERS[1]!, style))).toEqual([true, true, false, false, false]);
    expect(all.map((style) => tabShows(DEFAULT_FILTERS[4]!, style))).toEqual([true, false, false, false, true]);
    for (const filter of DEFAULT_FILTERS) {
      expect(tabShows(filter, CHATSTY.SYSTEM)).toBe(true);
      expect(tabShows(filter, CHATSTY.HELP)).toBe(true);
      expect(tabShows(filter, CHATSTY.GAME)).toBe(false);
    }
  });
  it('the System window gets what the tab hides, but never a shout or a line said nearby; system and game lines always', () => {
    const whisperTab = DEFAULT_FILTERS[1]!;
    expect(logGets(whisperTab, { style: CHATSTY.PARTY })).toBe(true);
    expect(logGets(whisperTab, { style: CHATSTY.WHISPER })).toBe(false);
    expect(logGets(whisperTab, { style: CHATSTY.SHOUT })).toBe(false);
    const noGeneral = whisperTab & ~CHATSTY.GENERAL;
    expect(logGets(noGeneral, { style: CHATSTY.GENERAL, said: true })).toBe(false);
    expect(logGets(noGeneral, { style: CHATSTY.GENERAL })).toBe(true);
    expect(logGets(whisperTab, { style: CHATSTY.SYSTEM })).toBe(true);
    expect(logGets(whisperTab, { style: CHATSTY.GAME })).toBe(true);
    expect(logGets(whisperTab, { style: CHATSTY.HELP })).toBe(true);
  });
  it('the line takes the tab prefix when it gets the focus empty; Whisper with the last name whispered', () => {
    expect(focusPrefix(0, '')).toBe('');
    expect(focusPrefix(1, '')).toBe('/w ');
    expect(focusPrefix(1, 'Rocky')).toBe('/w Rocky ');
    expect(focusPrefix(3, 'Rocky')).toBe('/p ');
  });
});

describe('the line (WndCommunication.cpp)', () => {
  it('"/r " becomes "/whisper <the last whisperer> " (Process, :502-513)', () => {
    expect(replyLine('/r ', 'Rocky')).toBe('/whisper Rocky ');
    expect(replyLine('/R ', 'Rocky')).toBe('/whisper Rocky ');
    expect(replyLine('/r ', '')).toBeUndefined();
    expect(replyLine('/r hi', 'Rocky')).toBeUndefined();
  });
  it('a "/w name ..." line sent names whom the Whisper tab writes to (:834-845)', () => {
    expect(whisperedName('/w Rocky hi')).toBe('Rocky');
    expect(whisperedName('/whisper Rocky hi')).toBe('Rocky');
    expect(whisperedName('/s Rocky hi')).toBeUndefined();
    expect(whisperedName('hello')).toBeUndefined();
  });
  it('a right-click on a line whispers its sender, never yourself (OnRButtonDown, :1159-1258)', () => {
    expect(whisperNameOf('Rocky : hi there', 'Webby')).toBe('Rocky');
    expect(whisperNameOf('Webby : hi there', 'Webby')).toBeUndefined();
    expect(whisperNameOf('<- [Rocky] psst', 'Webby')).toBe('Rocky');
    expect(whisperNameOf('-> [Rocky] psst', 'Webby')).toBe('Rocky');
    expect(whisperNameOf('[Lead] to the party', 'Webby')).toBe('Lead');
    expect(whisperNameOf('You got 3 Penya.', 'Webby')).toBeUndefined();
    expect(whisperNameOf('Two words : no', 'Webby')).toBeUndefined();
  });
});

describe('the layout (OnSize, :1017-1121; AdditionalSkinTexture, :1294-1312)', () => {
  it('lays the controls out from the client area: 518 x 118 at the default 528 x 128', () => {
    const layout = chatLayout(518, 118);
    expect(layout.text).toEqual({ left: 0, top: 0, width: 518, height: 79 });
    expect(layout.tabs.map((tab) => tab.left)).toEqual([0, 50, 100, 150, 200]);
    expect(layout.tabs[0]).toEqual({ left: 0, top: 80, width: 45, height: 17 });
    expect(layout.lock).toEqual({ left: 318, top: 80, width: 46, height: 17 });
    expect(layout.option).toEqual({ left: 368, top: 80, width: 44, height: 16 });
    expect(layout.system).toEqual({ left: 418, top: 80, width: 46, height: 17 });
    expect(layout.moveLock).toEqual({ left: 469, top: 81, width: 14, height: 14 });
    expect(layout.help).toEqual({ left: 486, top: 81, width: 15, height: 14 });
    expect(layout.close).toEqual({ left: 503, top: 81, width: 15, height: 14 });
    expect(layout.macro).toEqual({ left: 1, top: 99, width: 19, height: 19 });
    expect(layout.edit).toEqual({ left: 30, top: 100, width: 468, height: 18 });
  });
  it('paints the strip under the line: 00_1 at the left, 01 every 16 px, 02 next to last, nothing last', () => {
    const strip = editStrip(528, 128);
    expect(strip[0]).toEqual({ picture: 'WndChatEdit00_1.tga', left: 0, top: 81 });
    expect(strip.filter((piece) => piece.picture === 'WndChatEdit01.tga')).toHaveLength(23);
    expect(strip.at(-1)).toEqual({ picture: 'WndChatEdit02.tga', left: 496, top: 81 });
  });
});

describe('moving the edges (GetResizeDir, WndBase.cpp:1967-2001; the resize, :1171-1230)', () => {
  it('finds the edge or corner within 6 px of the window', () => {
    expect(resizeDirection(2, 2, 528, 128)).toBe(5);
    expect(resizeDirection(100, 2, 528, 128)).toBe(1);
    expect(resizeDirection(100, 126, 528, 128)).toBe(2);
    expect(resizeDirection(2, 60, 528, 128)).toBe(3);
    expect(resizeDirection(526, 60, 528, 128)).toBe(4);
    expect(resizeDirection(526, 2, 528, 128)).toBe(6);
    expect(resizeDirection(2, 126, 528, 128)).toBe(7);
    expect(resizeDirection(526, 126, 528, 128)).toBe(8);
    expect(resizeDirection(100, 60, 528, 128)).toBe(0);
  });
  const old = { left: 100, top: 300, width: 528, height: 128 };
  const room = { width: 1280, height: 672 };
  const least = { width: 464, height: 48 };
  it('moves an edge in whole steps of 16 px', () => {
    expect(resizeRect(old, 4, 37, 0, room, least)).toEqual({ ...old, width: 560 });
    expect(resizeRect(old, 3, 40, 0, room, least)).toEqual({ ...old, left: 132, width: 496 });
    expect(resizeRect(old, 1, 0, -20, room, least)).toEqual({ ...old, top: 284, height: 144 });
  });
  it('keeps the least size, from the edge that did not move', () => {
    expect(resizeRect(old, 4, -200, 0, room, least)).toEqual({ ...old, width: 464 });
    expect(resizeRect(old, 3, 200, 0, room, least)).toEqual({ ...old, left: 164, width: 464 });
    expect(resizeRect(old, 1, 0, 120, room, least)).toEqual({ ...old, top: 380, height: 48 });
  });
  it('an edge within 10 px of the room goes onto it', () => {
    expect(resizeRect(old, 3, -96, 0, room, least)).toEqual({ ...old, left: 0, width: 628 });
    expect(resizeRect(old, 2, 0, 240, room, least)).toEqual({ ...old, height: 372 });
  });
});
