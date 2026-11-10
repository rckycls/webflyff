// @vitest-environment jsdom
// The skill window for the four first jobs (Piece 7 M2, [R §11]): CWndSkillTreeEx::InitItem's panels and titles
// (_Interface/WndField.cpp:6767-6908) and GetSkillPoint's places (:6978-7393).

import { afterEach, describe, expect, it } from 'vitest';
import type { WebSkill } from '@flyffweb/formats';
import { NULL_ID } from '@flyffweb/protocol';
import type { SkillSlot, WorldMessage } from '@flyffweb/protocol';
import type { UiArt } from '../src/world/hud/art';
import { JOB_PANELS, skillPlaceOf } from '../src/world/hud/skillPlaces';
import { SkillWindow } from '../src/world/hud/skillWindow';
import type { SkillHand } from '../src/world/hud/skillWindow';
import type { OwnState } from '../src/world/OwnState';
import { MERCENARY, OWN_ID, VAGRANT, newVagrant, ownGameData } from './helpers/ownState';
import { CLEAN_HIT, FLURRY, OVER_CUT } from './helpers/skills';

const art: UiArt = { url: (key) => `/assets/${key}`, sheets: null };

/** `SI_MER_ONE_SPLMASH` and `SI_MER_SHIELD_PROTECTION` (`Resource/defineSkill.h:23`, :26), Mercenary skills. */
const SPLMASH: WebSkill = { ...CLEAN_HIT, id: 4, name: 'Splmash', jobType: 1, job: 1, reqLevel: 15, icon: 'ui/skill_meronesplmash.png' };
const PROTECTION: WebSkill = { ...CLEAN_HIT, id: 9, name: 'Protection', jobType: 1, job: 1, reqLevel: 15, icon: 'ui/skill_mershiprotec.png' };
const SKILLS = new Map([CLEAN_HIT, FLURRY, OVER_CUT, SPLMASH, PROTECTION].map((skill) => [skill.id, skill]));
const DATA = { skills: SKILLS, texts: new Map(), jobs: [VAGRANT, MERCENARY] };

const hand: SkillHand = {
  carrySkill: () => {}, pickSkill: () => {}, pickedSkill: null, dropPick: () => {}, queueSkill: () => {},
};

function layer(width = 800, height = 600): HTMLElement {
  const element = document.createElement('div');
  Object.defineProperty(element, 'clientWidth', { value: width });
  Object.defineProperty(element, 'clientHeight', { value: height });
  document.body.append(element);
  return element;
}

/** The 45 slots after the change: the Vagrant's three, Splmash at 1 and Protection at 0 in slots 3 and 4. */
function mercenarySlots(): SkillSlot[] {
  return Array.from({ length: 45 }, (_, i) => (
    i < 3 ? { skill: i + 1, level: 0 } : i === 3 ? { skill: 4, level: 1 } : i === 4 ? { skill: 9, level: 0 }
      : { skill: NULL_ID, level: 0 }
  ));
}

const jobChange = (): WorldMessage => ({ type: 'setJobSkill', job: 1, skills: mercenarySlots() });

/** A Vagrant at 15 with the Mercenary's job row in its catalog, its skills able to be shown. */
function vagrant15(): OwnState {
  return newVagrant(15, undefined, ownGameData({ skills: new Map(SKILLS), jobs: [VAGRANT, MERCENARY] }));
}

const windows: SkillWindow[] = [];
function windowOn(own: OwnState): SkillWindow {
  const tree = new SkillWindow(art, DATA, () => {}, hand);
  windows.push(tree);
  layer().append(tree.frame.element, tree.warning.element);
  tree.toggle(own);
  return tree;
}

const shown = (tree: SkillWindow) => [...tree.frame.element.querySelectorAll<HTMLElement>('.hud-skill')]
  .map((element) => [element.dataset.skill, element.style.left, element.style.top]);
const titles = (tree: SkillWindow) => [...tree.frame.element.querySelectorAll('.hud-skills-heading')]
  .map((heading) => heading.textContent);
const panel = (tree: SkillWindow) => tree.frame.element.querySelector<HTMLImageElement>('.hud-skills-job-panel');

afterEach(() => {
  for (const tree of windows.splice(0)) tree.dispose();
  document.body.replaceChildren();
});

describe('the skill window for the four first jobs (Piece 7 M2)', () => {
  it('places every first-job skill where GetSkillPoint puts it: ( nRectX - 3, nRectY + 76 )', () => {
    expect(skillPlaceOf(4)).toEqual({ x: 31, y: 185 }); // Splmash, WndField.cpp:7197
    expect(skillPlaceOf(9)).toEqual({ x: 31, y: 237 }); // Protection, :7198
    expect(skillPlaceOf(44)).toEqual({ x: 15, y: 211 }); // Healing
    expect(skillPlaceOf(121)).toEqual({ x: 31, y: 172 }); // Mental Strike
    expect(skillPlaceOf(206)).toEqual({ x: 31, y: 173 }); // Pulling
    expect(skillPlaceOf(200)).toEqual({ x: 181, y: 276 }); // Arrow Rain
    expect(skillPlaceOf(1)).toEqual({ x: 62, y: 103 }); // the Vagrant's Clean Hit, as before
    expect(skillPlaceOf(50)).toEqual({ x: 199, y: 211 }); // Cannon Ball
    expect(skillPlaceOf(999)).toBeUndefined();
    expect(JOB_PANELS).toEqual({ 1: 'Back_Me.TGA', 2: 'Back_Acr.tga', 3: 'Back_As.TGA', 4: 'Back_Ma.TGA' });
  });

  it('a Mercenary\'s window shows its panel at WIDC_STATIC5 + 2 px, the titles Vagrant, Mercenary and none, and its skills', () => {
    const own = vagrant15();
    own.apply(jobChange(), OWN_ID);
    const tree = windowOn(own);
    expect(panel(tree)?.getAttribute('src')).toBe('/assets/ui/back_me.png');
    expect([panel(tree)?.style.left, panel(tree)?.style.top]).toEqual(['6px', '170px']);
    expect(titles(tree)).toEqual(['Vagrant', 'Mercenary', '']);
    expect(shown(tree)).toEqual([
      ['1', '62px', '103px'], ['2', '112px', '103px'], ['3', '164px', '103px'], ['4', '31px', '185px'], ['9', '31px', '237px'],
    ]);
  });

  it('an open window reloads on SET_JOB_SKILL', () => {
    const own = vagrant15();
    const tree = windowOn(own);
    expect(panel(tree)?.hidden ?? true).toBe(true);
    expect(shown(tree)).toHaveLength(3);
    const message = jobChange();
    own.apply(message, OWN_ID);
    tree.onMessage(OWN_ID, message, own);
    tree.update(own);
    expect(panel(tree)?.hidden).toBe(false);
    expect(shown(tree).map(([id]) => id)).toEqual(['1', '2', '3', '4', '9']);
    expect(titles(tree)).toEqual(['Vagrant', 'Mercenary', '']);
  });

  it('the phone layout lays the job\'s skills out as the PC\'s tree, in the second section', () => {
    onPhone(() => {
      const own = vagrant15();
      own.apply(jobChange(), OWN_ID);
      const tree = windowOn(own);
      // Splmash ( 34, 109 ) over Protection ( 34, 161 ): one column, centred in the section, 52 px apart stretched 2.4 times
      expect(shown(tree)).toEqual([
        ['1', '28px', '111px'], ['2', '108px', '111px'], ['3', '188px', '111px'], ['4', '372px', '100px'], ['9', '372px', '225px'],
      ]);
      expect(panel(tree)?.hidden ?? true).toBe(true);
    });
  });
});

/** Runs `body` with the phone's media query matched. */
function onPhone(body: () => void): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true, value: (query: string) => ({ matches: query === '(max-width: 1000px) and (pointer: coarse)' }),
  });
  try {
    body();
  } finally {
    delete (window as { matchMedia?: unknown }).matchMedia;
  }
}

describe("the phone's arrows in the first- and second-job sections (2026-11-10, owner: the first section's only had them)", () => {
  const skill = (id: number, job: number, reqs: number[] = []): WebSkill => ({
    ...CLEAN_HIT, id, name: `Skill ${id}`, jobType: job < 6 ? 1 : 2, job, reqLevel: 15,
    reqSkills: reqs.map((req) => ({ skill: req, level: 1 })), icon: `ui/skill_${id}.png`,
  });
  // the Magician's (job 4): Mental Strike, Blinkpool and Swordwind need it, Flame Ball needs it, Flame Geyser needs Flame Ball,
  // Fire Strike needs Flame Geyser; the Elementor's (13): Firebird needs Fire Strike (the section above), Burningfield needs
  // Firebird, Earthquake needs Stone Spear (not in the set), Meteo Shower needs Burningfield and Earthquake
  const magic = [skill(121, 4), skill(107, 4, [121]), skill(64, 4, [121]), skill(69, 4, [121]), skill(65, 4, [64]), skill(30, 4, [65])];
  const elementor = [skill(168, 13, [30]), skill(170, 13, [168]), skill(176, 13, [174]), skill(183, 13, [170, 176])];
  const catalog = new Map([CLEAN_HIT, FLURRY, OVER_CUT, ...magic, ...elementor].map((s) => [s.id, s]));
  const jobs = Array.from({ length: 32 }, (_, i) => ({ ...MERCENARY, title: `Job ${i}` }));

  function elementorWindow(): SkillWindow {
    const own = newVagrant(70, undefined, ownGameData({ skills: catalog, jobs }));
    const ids = [1, 2, 3, ...magic.map((s) => s.id), ...elementor.map((s) => s.id)];
    const slots: SkillSlot[] = Array.from({ length: 45 }, (_, i) => ({ skill: ids[i] ?? NULL_ID, level: 0 }));
    own.apply({ type: 'setJobSkill', job: 13, skills: slots }, OWN_ID);
    const tree = new SkillWindow(art, { skills: catalog, texts: new Map(), jobs }, () => {}, hand);
    windows.push(tree);
    layer().append(tree.frame.element, tree.warning.element);
    tree.toggle(own);
    return tree;
  }
  const at = (tree: SkillWindow, id: number) => {
    const element = tree.frame.element.querySelector<HTMLElement>(`.hud-skill[data-skill="${id}"]`)!;
    return { left: parseFloat(element.style.left), top: parseFloat(element.style.top) };
  };
  const links = (tree: SkillWindow, section: number) => [...tree.frame.element
    .querySelectorAll(`.hud-skills-tree[data-section="${section}"] [data-link]`)].map((link) => link.getAttribute('data-link'));

  it('lays each section out as the PC\'s tree: a skill\'s column and row kept, 40 px icons', () => {
    onPhone(() => {
      const tree = elementorWindow();
      // the first job's: Blinkpool under Mental Strike, Flame Ball beside it, Swordwind under Flame Ball, Flame Geyser next
      expect(at(tree, 107).left).toBe(at(tree, 121).left);
      expect(at(tree, 107).top).toBeGreaterThan(at(tree, 121).top + 40);
      expect(at(tree, 64).top).toBe(at(tree, 121).top);
      expect(at(tree, 64).left).toBeGreaterThan(at(tree, 121).left + 40);
      expect(at(tree, 69).left).toBe(at(tree, 64).left);
      expect(at(tree, 69).top).toBeGreaterThan(at(tree, 64).top + 40);
      expect(at(tree, 65).left).toBeGreaterThan(at(tree, 64).left + 40);
      // within the second section ( 268, 92, 248 x 304 ) and the third ( 528, 92, 248 x 304 )
      for (const id of magic.map((s) => s.id)) {
        expect(at(tree, id).left).toBeGreaterThanOrEqual(268);
        expect(at(tree, id).left + 40).toBeLessThanOrEqual(268 + 248);
        expect(at(tree, id).top + 40).toBeLessThanOrEqual(92 + 304);
      }
      for (const id of elementor.map((s) => s.id)) {
        expect(at(tree, id).left).toBeGreaterThanOrEqual(528);
        expect(at(tree, id).left + 40).toBeLessThanOrEqual(528 + 248);
      }
      // Meteo Shower ( 134, 246 ) sits between Burningfield's row ( 234 ) and Earthquake's ( 260 )
      expect(at(tree, 183).top).toBeGreaterThan(at(tree, 170).top);
      expect(at(tree, 183).top).toBeLessThan(at(tree, 176).top);
    });
  });

  it('draws an arrow from each skill to the skills of its own section that need it, none across sections', () => {
    onPhone(() => {
      const tree = elementorWindow();
      expect(links(tree, 1)).toEqual(['121>107', '121>64', '121>69', '64>65', '65>30']);
      // Fire Strike > Firebird crosses into the section above, Stone Spear is not shown: neither has an arrow
      expect(links(tree, 2)).toEqual(['168>170', '170>183', '176>183']);
      // the arrows are under the icons, and take no presses
      const svg = tree.frame.element.querySelector<SVGElement>('.hud-skills-tree[data-section="1"]')!;
      const first = tree.frame.element.querySelector('.hud-skill')!;
      expect(svg.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(svg.getAttribute('aria-hidden')).toBe('true');
    });
  });

  it('the PC keeps its panels and draws no arrows of its own', () => {
    const tree = elementorWindow();
    expect(tree.frame.element.querySelectorAll('.hud-skills-tree')).toHaveLength(0);
    expect(at(tree, 121)).toEqual({ left: 31, top: 172 });
  });
});

describe('the skill window for the second jobs (2026-11-05: their skills were never drawn)', () => {
  /** `SI_PSY_NLG_DEMONOLGY` and `SI_MAG_MAG_MENTALSTRIKE`: a Psykeeper's own skill and its Magician skill. */
  const DEMONOLOGY: WebSkill = { ...CLEAN_HIT, id: 160, name: 'Demonology', jobType: 2, job: 12, reqLevel: 60, icon: 'ui/skill_psynlgdemonolgy.png' };
  const MENTAL: WebSkill = { ...CLEAN_HIT, id: 121, name: 'Mental Strike', jobType: 1, job: 4, reqLevel: 15, icon: 'ui/skill_magmagmentalstr.png' };
  const jobs = Array.from({ length: 32 }, (_, i) => ({ ...MERCENARY, title: i === 0 ? 'Vagrant' : i === 4 ? 'Magician' : i === 12 ? 'Psykeeper' : `Job ${i}` }));

  it('places a second job\'s skills in the lower section ( nRectX - 8 + 6, nRectY - 228 + 346 ), 2 px up', () => {
    // GetSkillPoint, WndField.cpp:7307: Demonology at ( 34, 260 ) of MAX_PROFESSIONAL; WIDC_STATIC7's top left ( 6, 346 )
    expect(skillPlaceOf(160)).toEqual({ x: 32, y: 376 });
    // SI_KNT_TWOSW_CHARGE ( 34, 260 ), :7213; SI_RAG_BOW_SILENTARROW ( 134, 312 ), :7350
    expect(skillPlaceOf(133)).toEqual({ x: 32, y: 376 });
    expect(skillPlaceOf(220)).toEqual({ x: 132, y: 428 });
  });

  it('a Psykeeper, a Psykeeper Master and Hero: both panels, the titles Vagrant, Magician and Psykeeper, every skill', () => {
    const skills = new Map([...SKILLS, [121, MENTAL], [160, DEMONOLOGY]]);
    for (const job of [12, 22, 30]) {
      const own = newVagrant(60, undefined, ownGameData({ skills, jobs }));
      const slots: SkillSlot[] = Array.from({ length: 45 }, (_, i) => (
        i < 3 ? { skill: i + 1, level: 1 } : i === 3 ? { skill: 121, level: 0 } : i === 4 ? { skill: 160, level: 0 } : { skill: NULL_ID, level: 0 }
      ));
      own.apply({ type: 'setJobSkill', job, skills: slots }, OWN_ID);
      const tree = new SkillWindow(art, { skills, texts: new Map(), jobs }, () => {}, hand);
      windows.push(tree);
      layer().append(tree.frame.element, tree.warning.element);
      tree.toggle(own);
      const panels = [...tree.frame.element.querySelectorAll<HTMLImageElement>('.hud-skills-job-panel, .hud-skills-pro-panel')].filter((img) => !img.hidden);
      expect(panels.map((img) => [img.getAttribute('src'), img.style.left, img.style.top])).toEqual([
        ['/assets/ui/back_ma.png', '6px', '170px'], ['/assets/ui/back_psy.png', '6px', '348px'],
      ]);
      expect(titles(tree)).toEqual(['Vagrant', 'Magician', 'Psykeeper']);
      expect(shown(tree).map(([id]) => id)).toEqual(['1', '2', '3', '121', '160']);
      tree.dispose();
    }
  });
});
