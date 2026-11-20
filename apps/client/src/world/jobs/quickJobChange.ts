// custom (owner 2026-11-20, "i'd like changing jobs to be easier ... pop up both for desktop and mobile after reaching the
// required level"): the Quick Job Change window's rules (docs/superpowers/specs/2026-11-20-quick-job-change-design.md).
// They are the V15 NPC scripts' own (Source/WORLDDIALOG/NpcScript.cpp), and the World's patch checks them all again (outer
// repo, WORLDSERVER/QuickJobChange.h, `CDPSrvr::OnQuickJobChange`):
//
//   1st job      a Vagrant at level 15 (V15 holds a Vagrant there)        Mercenary, Acrobat, Assist, Magician
//   2nd job      a first job at level 60 (V15 holds a first job there)   the line's two (Mercenary: Knight, Blade, ...)
//   Master       a second job at level 120 with 99.99% EXP               the line's Master (job + 10)
//   Hero         a Master at level 120 with 99.99% EXP                   the line's Hero (job + 8)
//
// The class lock is V15's too: a class NPC refuses its chain once another class's chain of the tier has begun
// (`GetQuestState( ... ) >= 0`), so once any quest of a chain is current or completed, only that class is open.

/** The tier a job change is due in. */
export type JobTier = 'first' | 'second' | 'master' | 'hero';

/** A portrait slot of the window: a job and whether it may be picked; `job: null` is a filler lock. */
export interface JobSlot {
  job: number | null;
  open: boolean;
}

/** The four first-job chains and the eight second-job chains, by the job they give (`Resource/defineQuest.h`: the last
 * `#define` wins, so the Acrobat's chain is 53-56 and the Knight's 163-167), and the Master's and the Hero's one quest. */
export const JOB_CHAINS: ReadonlyMap<number, readonly number[]> = new Map([
  [1, [151, 152, 153, 154]], // QUEST_VOCMER_BFTRN .. _TRN3
  [2, [53, 54, 55, 56]], // QUEST_VOCACR_BFTRN .. _TRN3
  [3, [155, 156, 157, 158]], // QUEST_VOCASS_BFTRN .. _TRN3
  [4, [159, 160, 161, 162]], // QUEST_VOCMAG_BFTRN .. _TRN3
  [6, [163, 164, 165, 166, 167]], // QUEST_HEROKNI_TRN1 .. _TRN5
  [7, [168, 169, 170, 171, 172]], // QUEST_HEROBLA
  [8, [57, 58, 59, 60, 61]], // QUEST_HEROJES
  [9, [62, 63, 64, 65, 66]], // QUEST_HERORAN
  [10, [178, 179, 180, 181, 182]], // QUEST_HERORIN
  [11, [173, 174, 175, 176, 177]], // QUEST_HEROBIL
  [12, [183, 184, 185, 186, 187]], // QUEST_HEROPSY
  [13, [188, 189, 190, 191, 192]], // QUEST_HEROELE
  ...[16, 17, 18, 19, 20, 21, 22, 23].map((job): [number, number[]] => [job, [5022]]), // QUEST_MASTER
  ...[24, 25, 26, 27, 28, 29, 30, 31].map((job): [number, number[]] => [job, [5023]]), // QUEST_HERO
]);

const FIRST_JOBS = [1, 2, 3, 4] as const;
const SECOND_JOB_NAMES = ['Knight', 'Blade', 'Jester', 'Ranger', 'Ringmaster', 'Billposter', 'Psykeeper', 'Elementor'];

/** The names of the jobs a change gives: the first jobs, the second jobs, their Masters (16-23) and Heroes (24-31). */
export const JOB_NAMES: ReadonlyMap<number, string> = new Map([
  [1, 'Mercenary'], [2, 'Acrobat'], [3, 'Assist'], [4, 'Magician'],
  ...SECOND_JOB_NAMES.map((name, i): [number, string] => [6 + i, name]),
  ...SECOND_JOB_NAMES.map((name, i): [number, string] => [16 + i, `${name} Master`]),
  ...SECOND_JOB_NAMES.map((name, i): [number, string] => [24 + i, `${name} Hero`]),
]);

/** The jobs' texts, from V15's own job-quest lines where they exist (propQuest.txt.txt: "Mercenaries are experts at close
 * combat", "Acrobats are able to wield both Bows and Yo-Yos", "The role of an Assist ... is primarily party support"). */
const DESCRIPTIONS: ReadonlyMap<number, string> = new Map([
  [1, 'Mercenaries are experts at close combat. A sword strikes fast for steady damage; an axe hits harder but slower, '
    + "and both go well with a shield. Their skills stop an enemy's movement so it stays within reach. At level 60 a "
    + 'Mercenary becomes a Knight or a Blade.'],
  [2, 'Acrobats are the most versatile fighters: a bow strikes from long range and a yo-yo fights up close. They are '
    + 'quick on their feet and can pull a distant enemy right up to them. At level 60 an Acrobat becomes a Jester or a '
    + 'Ranger.'],
  [3, "The Assist's role is party support: heals that keep allies standing and buffs that make the whole group stronger. "
    + 'With a stick or a pair of knuckles, an Assist can also hold their own in a fight. At level 60 an Assist becomes a '
    + 'Ringmaster or a Billposter.'],
  [4, 'Magicians defeat their enemies with magic. A wand fires a charged blast from a distance, and a staff can also be '
    + 'swung up close. Their spells call on fire, water, wind, earth and lightning. At level 60 a Magician becomes a '
    + 'Psykeeper or an Elementor.'],
  [6, 'Knights wield two-handed swords and axes and wear the heaviest armour. They stand at the front, draw enemies onto '
    + 'themselves and take hits no one else could, while their great swings strike several foes at once.'],
  [7, 'Blades carry a weapon in each hand and attack faster than any other class. They give up defence for a relentless '
    + 'stream of hits, tearing down a single target before it can react.'],
  [8, 'Jesters fight with yo-yos and live for the critical hit. Their tricks weaken and poison enemies, and their sudden '
    + 'strikes can end a fight in a few blows.'],
  [9, 'Rangers are masters of the bow. They strike from far away with piercing, poisoned and elemental arrows, and keep '
    + 'their enemies at a distance while they fire.'],
  [10, "Ringmasters are the party's healers. With a stick in hand they restore health, bring fallen allies back and cast "
    + 'the strongest protective buffs in Madrigal.'],
  [11, 'Billposters fight with knuckles. They pour support magic into themselves, turning powerful buffs into raw '
    + 'strength, and trade blows up close where other supporters cannot.'],
  [12, 'Psykeepers wield wands and the power of the mind. They curse and weaken their enemies, and their psychic blasts '
    + 'strike whole groups at once.'],
  [13, 'Elementors wield staves and command fire, water, wind, earth and lightning. Their spells hit many enemies at once '
    + 'with great elemental damage.'],
]);

/** The job's text: its own for a first or second job; the step's for a Master or a Hero. */
export function jobDescription(job: number): string {
  if (job >= 16 && job <= 23) {
    return `Become a ${JOB_NAMES.get(job)}. You start again from level 60 with your stats reset, and gain your Master `
      + 'skill and 400 skill points.';
  }
  if (job >= 24 && job <= 31) return `Become a ${JOB_NAMES.get(job)}. You go straight to level 121 and gain your Hero skill.`;
  return DESCRIPTIONS.get(job) ?? '';
}

/** The tier a job change is due in for `job` at `level` with `expPercent` (`GetExpPercent`, 9999 = 99.99%), or null. */
export function dueTier(job: number, level: number, expPercent: number): JobTier | null {
  if (job === 0) return level === 15 ? 'first' : null;
  if (job >= 1 && job <= 4) return level === 60 ? 'second' : null;
  if (level !== 120 || expPercent !== 9999) return null;
  if (job >= 6 && job <= 13) return 'master';
  if (job >= 16 && job <= 23) return 'hero';
  return null;
}

/** The level the next job change opens at for `job`, or null for a Hero (none). */
export function nextChangeLevel(job: number): number | null {
  if (job === 0) return 15;
  if (job >= 1 && job <= 4) return 60;
  if (job >= 6 && job <= 23) return 120;
  return null;
}

/**
 * Whether the window pops up by itself (the owner: "pop up ... after reaching the required level", and again at each
 * login while a change is due): a tier due `now` that was not due `before`, or any due tier at the `login`; never after
 * the player `dismissed` it this session (until the tier changes), nor with the test switch `off`.
 */
export function shouldPopUp(before: JobTier | null, now: JobTier | null, login: boolean, dismissed: boolean, off: boolean): boolean {
  return !off && now !== null && (login || before !== now) && !dismissed;
}

/** The e2e harness's switch: `flyffweb.jobPopup` = 'off' keeps the pop-up shut (a storage that throws reads as on). */
export const JOB_POPUP_KEY = 'flyffweb.jobPopup';

export function jobPopupOff(storage: Pick<Storage, 'getItem'> | undefined): boolean {
  try {
    return storage?.getItem(JOB_POPUP_KEY) === 'off';
  } catch {
    return false;
  }
}

/**
 * The window's four slots for `job` in `tier`: the targets first, then filler locks. In the first and second tiers a
 * target is open unless another target's chain has begun and its own has not (`started` names a quest that is current or
 * completed).
 */
export function jobSlots(job: number, tier: JobTier, started: (questId: number) => boolean): JobSlot[] {
  let targets: number[];
  if (tier === 'first') targets = [...FIRST_JOBS];
  else if (tier === 'second') targets = [job * 2 + 4, job * 2 + 5]; // CMover::IsInteriorityJob: Mercenary 1 -> 6, 7
  else targets = [job + (tier === 'master' ? 10 : 8)];
  const begun = (target: number): boolean => (JOB_CHAINS.get(target) ?? []).some(started);
  const locked = (tier === 'first' || tier === 'second') && targets.some(begun);
  const slots: JobSlot[] = targets.map((target) => ({ job: target, open: !locked || begun(target) }));
  while (slots.length < 4) slots.push({ job: null, open: false });
  return slots;
}
