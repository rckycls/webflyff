// The beauty shop's rules (2026-11-15, docs/2026-11-15-beauty-shop-research.md §3): WndShop.cpp's sums with
// __Y_HAIR_BUG_FIX off (a channel 0.3..1.0), the prices, the rows and OK.

import { describe, expect, it } from 'vitest';
import {
  CHANGE_FACE_COST, HAIRCOLOR_COST, HAIR_COST, atoi, channelByte, channelsOf, colorCost, confirmText, dragChannel,
  editNumber, faceCost, faceRowsFor, friendlyRow, hairCost, hairRow, knobX, newRow, okAnswer, setHairColor, setHairMesh,
  stepFriendly, stepHair, stepNew, typedChannel,
} from '../src/world/beauty/beautyRules';

describe('the hair colour bars', () => {
  it('an edit shows (c - 0.3) / 0.7 * 255 + 0.5, cut (SetRGBToEdit)', () => {
    expect(editNumber(0.3)).toBe(0);
    expect(editNumber(1)).toBe(255);
    expect(editNumber(Math.fround(0.998))).toBe(254);
    // a colour under 0.3 (a style's default) shows below 0, cut toward 0
    expect(editNumber(Math.fround(0.2))).toBe(-35);
  });

  it('a typed number is atoi\'d, held to 0..254, and made a channel (SetRGBToBar)', () => {
    expect(typedChannel('0')).toEqual({ channel: Math.fround(0.3), shown: null });
    expect(typedChannel('300')).toEqual({ channel: typedChannel('254').channel, shown: '254' });
    expect(typedChannel('-4').shown).toBe('0');
    expect(typedChannel('abc')).toEqual({ channel: Math.fround(0.3), shown: null });
    expect(editNumber(typedChannel('128').channel)).toBe(128);
    expect(channelByte(typedChannel('254').channel)).toBe(254);
    expect([atoi('  12x'), atoi('+7'), atoi('x1')]).toEqual([12, 7, 0]);
  });

  it('a drag is 0.3 + p * 0.698, its right end held (OnMouseWndSurface)', () => {
    expect(dragChannel(0, 120)).toBe(Math.fround(0.3));
    expect(dragChannel(120, 120)).toBe(dragChannel(500, 120));
    expect(channelByte(dragChannel(120, 120))).toBe(254);
  });

  it('the knob sits at width * percent / 100 + left (ReSetBar)', () => {
    expect(knobX(Math.fround(0.3), 44, 164)).toBe(44);
    expect(knobX(1, 44, 164)).toBe(164);
    expect(knobX(typedChannel('127').channel, 44, 164)).toBe(103);
  });

  it('the player\'s colour is each byte over 255', () => {
    expect(channelsOf(0xff804020).map(channelByte)).toEqual([0x80, 0x40, 0x20]);
  });
});

describe('the prices', () => {
  it('a style other than the player\'s is 2,000,000, a changed colour byte 4,000,000, a face 1,000,000', () => {
    expect(hairCost(2, 3, false)).toBe(0);
    expect(hairCost(2, 4, false)).toBe(HAIR_COST);
    expect(hairCost(2, 4, true)).toBe(0);
    const current = channelsOf(0xff804020);
    expect(colorCost(current, current, false)).toBe(0);
    expect(colorCost(current, [current[0], current[1], Math.fround(current[2] + 0.01)], false)).toBe(HAIRCOLOR_COST);
    expect(colorCost(current, [1, 1, 1], true)).toBe(0);
    expect(faceCost(4, 5, false)).toBe(0);
    expect(faceCost(4, 7, false)).toBe(CHANGE_FACE_COST);
    expect(faceCost(4, 7, true)).toBe(0);
  });

  it('OK: the coupon\'s question for a change, the confirm for a price, else the window closes', () => {
    expect(okAnswer(0, false, false)).toEqual({ kind: 'close' });
    expect(okAnswer(6_000_000, false, true)).toEqual({ kind: 'confirm', cost: 6_000_000 });
    expect(okAnswer(0, true, true)).toEqual({ kind: 'coupon' });
    expect(okAnswer(0, true, false)).toEqual({ kind: 'close' });
  });

  it('the confirm\'s words are the six texts in a row, the price with commas', () => {
    const texts: Record<string, string> = {
      TID_GAME_SHOP_CHOICE: 'Selected', TID_GAME_CHANGE_HAIR: 'Change your Hair', TID_GAME_SHOP_COST: 'Price is',
      TID_GAME_SHOP_PENYA: 'Penya.', TID_GAME_CHANGE_HAIR_QUESTION: 'Do you want to change your hair?',
      TID_GAME_CHANGE_FACE: 'Change your Appearance.', TID_GAME_CHANGE_FACE_QUESTION: 'Do you want to change your appearance?',
    };
    expect(confirmText((tid) => texts[tid] ?? '', false, 6_000_000))
      .toBe('Selected Change your Hair Price is 6,000,000 Penya. Do you want to change your hair?');
    expect(confirmText((tid) => texts[tid] ?? '', true, 1_000_000))
      .toBe('Selected Change your Appearance. Price is 1,000,000 Penya. Do you want to change your appearance?');
  });
});

describe('the rows', () => {
  it('four styles from the first, 1..10 wrapping; the arrows step it', () => {
    expect(hairRow(1)).toEqual([1, 2, 3, 4]);
    expect(hairRow(9)).toEqual([9, 10, 1, 2]);
    expect([stepHair(1, -1), stepHair(10, 1), stepHair(5, 1)]).toEqual([10, 1, 6]);
  });

  it('friendly faces 1..5 and new faces 6..11, each wrapping', () => {
    expect(friendlyRow(4)).toEqual([4, 5, 1, 2]);
    expect(friendlyRow(6)).toEqual([1, 2, 3, 4]); // a head of 5 starts the row at 6, drawn from 1
    expect(newRow(10)).toEqual([10, 11, 6, 7]);
    expect([stepFriendly(1, -1), stepFriendly(5, 1), stepNew(6, -1), stepNew(11, 1)]).toEqual([5, 1, 11, 6]);
    expect(faceRowsFor(2)).toEqual({ friendly: 3, fresh: 6 });
    expect(faceRowsFor(8)).toEqual({ friendly: 1, fresh: 9 });
  });
});

describe('what SET_HAIR leaves on a mover', () => {
  it('white stays white; a byte under 77 is 76 (0.3); a style past 9 is not taken', () => {
    expect(setHairColor(255, 255, 255)).toBe(0xffffffff);
    expect(setHairColor(200, 10, 77)).toBe(0xffc84c4d);
    expect(setHairMesh(3, 7)).toBe(7);
    expect(setHairMesh(3, 10)).toBe(3);
  });
});
