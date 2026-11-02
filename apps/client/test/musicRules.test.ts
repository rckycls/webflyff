import { describe, expect, it } from 'vitest';
import type { WebAudio } from '@flyffweb/formats';
import { MusicRules } from '../src/world/sound/musicRules';
import type { MusicPort } from '../src/world/sound/musicRules';

/** A port that plays as Music2.cpp does: the same key while playing is not restarted; `end()` is the track's end. */
class FakePort implements MusicPort {
  log: string[] = [];
  current: string | null = null;
  stopped = true;
  playFile(key: string, loops: number): void {
    if (key === this.current && !this.stopped) return;
    this.log.push(`${key} ${loops}`);
    this.current = key;
    this.stopped = false;
  }
  stop(): void { this.log.push('stop'); this.stopped = true; }
  isStopped(): boolean { return this.stopped; }
  end(): void { this.stopped = true; }
}

const track = (name: string) => ({ ogg: `music/${name}.ogg`, mp3: null });
// default.bgm's ids (Resource/defineSound.h:1899-1946) and Madrigal's rows of [R §4], in m_aRegion order, plus a row
// with no music and an inn row
const AUDIO: Pick<WebAudio, 'music' | 'worlds'> = {
  music: {
    1: track('bgmdu1mystery'), 2: track('bgmto1flaris'), 3: track('bgmto2music'), 8: track('bgmth1general'),
    22: track('bgmindeath'), 120: track('bgmfi1flaris'),
  },
  worlds: {
    1: {
      bgm: 0,
      regions: [
        { rect: [6870, 3184, 7073, 3285], music: 2, direct: false, inn: false }, // Central Flarine (:748)
        { rect: [6848, 3172, 7261, 3385], music: 2, direct: true, inn: false }, // Flarine (:796)
        { rect: [6953, 3512, 7255, 3736], music: 120, direct: true, inn: false }, // the Flaris field (:868)
        { rect: [8229, 3534, 8604, 3941], music: 3, direct: true, inn: false }, // Saint Morning (:1324)
        { rect: [100, 100, 200, 200], music: 0, direct: false, inn: false },
        { rect: [300, 300, 400, 400], music: 120, direct: false, inn: true },
      ],
    },
    3: { bgm: 6, regions: [] },
  },
};

function setup() {
  const port = new FakePort();
  const rules = new MusicRules(port, AUDIO);
  const at = (x: number, z: number, y = 100, land = 100) => rules.step({ x, y, z }, () => land);
  return { port, rules, at };
}

describe('MusicRules (CWndWorld::Process, WndWorld.cpp:8013-8048, :8562-8689)', () => {
  it('in Central Flarine, from outside both rows: row 47 starts Flaris, row 55 makes it loop', () => {
    const { port, rules, at } = setup();
    rules.enterWorld(1);
    at(6970, 3230);
    expect(port.log).toEqual(['stop', 'music/bgmto1flaris.ogg 1']);
    at(6970, 3230);
    at(6970, 3230);
    expect(port.log).toHaveLength(2); // the same file while it plays is not asked for again
    port.end();
    at(6970, 3230);
    expect(port.log.at(-1)).toBe('music/bgmto1flaris.ogg 1'); // restarted from its start, again and again
  });

  it('entering Flarine, then walking into Central Flarine: Flaris ends once, then the general track loops', () => {
    const { port, rules, at } = setup();
    rules.enterWorld(1);
    at(6900, 3350); // row 55 only
    at(6970, 3230); // row 47 too: not direct, so the base is cleared
    at(6970, 3230);
    port.end();
    at(6970, 3230);
    expect(port.log.at(-1)).toBe('music/bgmth1general.ogg 1');
    port.end();
    at(6970, 3230);
    at(6970, 3230);
    port.end();
    at(6970, 3230);
    expect(port.log.filter((l) => l.includes('general'))).toHaveLength(2);
  });

  it('loops the Flaris field and Saint Morning, whose rows are direct', () => {
    for (const [x, z, key] of [[7100, 3638, 'bgmfi1flaris'], [8400, 3700, 'bgmto2music']] as const) {
      const { port, rules, at } = setup();
      rules.enterWorld(1);
      at(x, z);
      port.end();
      at(x, z);
      port.end();
      at(x, z);
      expect(port.log).toEqual(['stop', `music/${key}.ogg 1`, `music/${key}.ogg 1`, `music/${key}.ogg 1`]);
    }
  });

  it('plays the world\'s own bgm, or BGM_TH_GENERAL in a world without one', () => {
    const { port, rules, at } = setup();
    rules.enterWorld(1);
    at(5000, 5000); // no region: the base is the general track, played when nothing plays
    at(5000, 5000);
    expect(port.log).toEqual(['stop', 'music/bgmth1general.ogg 1']);
    rules.enterWorld(3);
    at(0, 0);
    at(0, 0);
    expect(port.log.slice(2)).toEqual(['stop']); // bgm 6 has no file here, so nothing plays
  });

  it('stops the track on a world change and lets the new world choose', () => {
    const { port, rules, at } = setup();
    rules.enterWorld(1);
    at(7100, 3638);
    rules.enterWorld(1);
    expect(port.log.at(-1)).toBe('stop');
    at(7100, 3638);
    expect(port.log.at(-1)).toBe('music/bgmfi1flaris.ogg 1'); // the rows start outside again
  });

  it('cuts the track for a jingle, and the base comes back from its start when it ends', () => {
    const { port, rules, at } = setup();
    rules.enterWorld(1);
    at(7100, 3638);
    rules.play(22);
    expect(port.log.at(-1)).toBe('music/bgmindeath.ogg 1');
    at(7100, 3638);
    port.end();
    at(7100, 3638);
    expect(port.log.at(-1)).toBe('music/bgmfi1flaris.ogg 1');
  });

  it('a region with no music lets the track end, then the world\'s track loops', () => {
    const { port, rules, at } = setup();
    rules.enterWorld(1);
    at(7100, 3638);
    at(150, 150);
    at(150, 150);
    expect(port.log).toEqual(['stop', 'music/bgmfi1flaris.ogg 1']);
    port.end();
    at(150, 150);
    expect(port.log.at(-1)).toBe('music/bgmth1general.ogg 1');
  });

  it('an inn region re-enters every step while the player is off the ground', () => {
    const { port, rules, at } = setup();
    rules.enterWorld(1);
    at(350, 350, 102, 100);
    port.end();
    at(350, 350, 102, 100); // entered again: its track plays again at once
    expect(port.log.filter((l) => l.includes('bgmfi1flaris'))).toHaveLength(2);
    port.end();
    at(350, 350, 100.5, 100); // on the ground: inside now
    port.end();
    at(350, 350, 100.5, 100);
    expect(port.log.filter((l) => l.includes('bgmfi1flaris'))).toHaveLength(3);
  });

  it('plays the title track forever, and ignores 0, NULL_ID and an id with no file', () => {
    const { port, rules } = setup();
    rules.title();
    expect(port.log).toEqual(['music/bgmdu1mystery.ogg 0']);
    rules.play(0);
    rules.play(0xffffffff);
    rules.play(999);
    expect(port.log).toHaveLength(1);
  });
});
