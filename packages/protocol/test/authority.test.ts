import { describe, expect, it } from 'vitest';
import {
  Authority, AUTHORITY_TITLES, authorityLevel, gameAuthority, isVipAuthority, SETTABLE_AUTHORITIES, VIP_AUTHORITIES,
} from '../src';

describe('authority letters', () => {
  it('puts VIP1-VIP4 before the player letter, skipping the observer', () => {
    expect([Authority.VIP1, Authority.VIP2, Authority.VIP3, Authority.VIP4]).toEqual(['A', 'B', 'C', 'E']);
    expect(VIP_AUTHORITIES).toEqual(['A', 'B', 'C', 'E']);
    for (const vip of VIP_AUTHORITIES) {
      expect(vip < Authority.GENERAL).toBe(true);
      expect(vip).not.toBe(Authority.OBSERVER);
      // every ">= letter after F" test gives a VIP what it gives a player
      for (const higher of [Authority.LOGCHATTING, Authority.HELPER, Authority.GAMEMASTER, Authority.ADMINISTRATOR]) {
        expect(vip >= higher).toBe(Authority.GENERAL >= higher);
      }
    }
  });

  it('counts a VIP letter as the player letter, and nothing else', () => {
    expect(VIP_AUTHORITIES.map((vip) => authorityLevel(vip))).toEqual([0x46, 0x46, 0x46, 0x46]);
    expect(authorityLevel(0x41)).toBe(0x46);
    expect(authorityLevel('L')).toBe(0x4c);
    expect(authorityLevel(0x46)).toBe(0x46);
    expect(isVipAuthority('E')).toBe(true);
    expect(isVipAuthority('D')).toBe(false);
    expect(isVipAuthority(0x46)).toBe(false);
  });

  it('gives every settable letter a title (2026-11-19: VIP letters come from the VIP list, not by hand)', () => {
    expect(SETTABLE_AUTHORITIES).toEqual(['F', 'J', 'L', 'M', 'N', 'O', 'P']);
    expect(SETTABLE_AUTHORITIES.map((letter) => AUTHORITY_TITLES[letter])).toEqual([
      'Player', 'Helper', 'GM 1', 'GM 2', 'GM 3', 'Operator', 'Admin',
    ]);
    expect(VIP_AUTHORITIES.map((letter) => AUTHORITY_TITLES[letter])).toEqual(['VIP 1', 'VIP 2', 'VIP 3', 'VIP 4']);
  });

  it('plays with the account letter unless the account is a player or a VIP (DbManagerJoin.cpp)', () => {
    expect(gameAuthority('L', 'F')).toBe('L');
    expect(gameAuthority('P', 'A')).toBe('P');
    expect(gameAuthority('F', 'L')).toBe('L');
    expect(gameAuthority('F', 'B')).toBe('B');
    // a VIP account is a player account: the character's own letter counts, the VIP title stays on a player
    expect(gameAuthority('A', 'L')).toBe('L');
    expect(gameAuthority('A', 'F')).toBe('A');
    expect(gameAuthority('C', 'E')).toBe('E');
  });
});
