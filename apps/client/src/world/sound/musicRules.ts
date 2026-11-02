// Which track plays in the world, copying the music half of CWndWorld::Process (Source/_Interface/WndWorld.cpp:8013-8048
// and the region loop :8562-8689) over Music2.cpp's player (docs/superpowers/specs/2026-11-02-piece6-m2-sound-research.md
// §3-§6). Each rules step:
//
//   - block A: with a base track and nothing playing (ended, stopped or failed), the base plays once from its start, and
//     a base that is not a direct region's is then forgotten; with no base, the world's `bgm` becomes it, or
//     BGM_TH_GENERAL;
//   - the region loop: the first region, in file order, that the player has just entered sets the base, plays its own
//     track (not again when that file already plays), and is the only one entered this step. A region the player is
//     outside of is left; an inn region counts as entered only while the player stands on the land.
//
// So a region's music changes on entry only; a direct region loops its track, another plays it once and then the world's
// track loops. Jingles (death, level-up, an NPC, a boss, the server's PLAYMUSIC) cut whatever plays, and the base comes
// back from its start when they end.

import type { WebAudio, WebWorldMusic } from '@flyffweb/formats';
import { BGM_TH_GENERAL, BGM_TITLE } from '../../audio/soundIds';

/**
 * What Music2.cpp's player does for the rules: `PlayMusic_` (a key that is playing is not restarted; loops 0 is
 * forever, 1 once), `StopMusic` and `IsStopMusic` (true when nothing plays: ended, stopped or failed).
 */
export interface MusicPort {
  playFile(key: string, loops: number): void;
  stop(): void;
  isStopped(): boolean;
}

/** NULL_ID as the server's `u_long` carries it. */
const NULL_ID = 0xffffffff;

export class MusicRules {
  /** `m_dwIdBgmMusic`: the track block A plays when nothing plays, 0 for none. */
  private base = 0;
  /** `m_bBGM`: the base is a direct region's, kept after it plays. */
  private direct = false;
  private world: WebWorldMusic | null = null;
  /** `REGIONELEM::m_bInside` of each region of the world. */
  private inside: boolean[] = [];

  constructor(private readonly port: MusicPort, private readonly audio: Pick<WebAudio, 'music' | 'worlds'>) {}

  /** `PlayMusic( id, loops )` (Music2.cpp:101-112): nothing for 0, NULL_ID or an id with no file. */
  play(id: number, loops = 1): void {
    if (id <= 0 || id === NULL_ID) return;
    const track = this.audio.music[id];
    if (track !== undefined) this.port.playFile(track.ogg, loops);
  }

  /** The title track, forever (`PlayMusic( BGM_TITLE, 0 )`, Neuz.cpp:1724, :1468). */
  title(): void {
    this.play(BGM_TITLE, 0);
  }

  /**
   * A world entered: `OnReplace` (DPClient.cpp:2422-2427) and the first entry (`OpenField`, WndManager.cpp:2153) stop
   * the music and forget the base. `m_bBGM` is left as it was. The new world's regions all start outside
   * (WorldFile.cpp:432).
   */
  enterWorld(worldId: number): void {
    this.base = 0;
    this.port.stop();
    this.world = this.audio.worlds[worldId] ?? null;
    this.inside = (this.world?.regions ?? []).map(() => false);
  }

  /** One rules step with the own player at `pos` (FlyFF). `landHeight` is `GetLandHeight` there, for inn regions. */
  step(pos: { x: number; y: number; z: number }, landHeight: () => number): void {
    if (this.base !== 0) {
      if (this.port.isStopped()) {
        this.play(this.base, 1); // PlayBGM (Music2.cpp:114-123)
        if (!this.direct) this.base = 0;
      }
    } else {
      this.base = this.world?.bgm ?? 0;
      if (this.base === 0) this.base = BGM_TH_GENERAL;
    }

    const regions = this.world?.regions ?? [];
    const x = Math.trunc(pos.x);
    const z = Math.trunc(pos.z);
    for (let i = 0; i < regions.length; i++) {
      const { rect, music, direct, inn } = regions[i]!;
      // CRect::PtInRect: left <= x < right, top <= z < bottom
      if (rect[0] <= x && x < rect[2] && rect[1] <= z && z < rect[3]) {
        if (!this.inside[i]) {
          this.base = music;
          this.direct = direct;
          this.play(music);
          if (!this.direct) this.base = 0;
          this.inside[i] = !inn || Math.trunc(pos.y) === Math.trunc(landHeight());
          break; // __VER >= 9: one region entered a step
        }
      } else {
        this.inside[i] = false;
      }
    }
  }
}
