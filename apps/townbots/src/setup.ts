// Setup: each bot's character is made on the create flow (its name and look) and given its level and job with the
// game's own GM command, once, while the account is GM for the setup (the install script sets that letter and puts it
// back). Items never come by command: the install script sends them through ITEM_SEND_TBL, and the bot puts on its
// gear from the bag as it enters (`gearToEquip`).
//   /level <job> <level> [2]   TextCmd_Level (Source/_Interface/FuncTextCmd.cpp): up to 15 a Vagrant, 16-60 a first job,
//                          61 and up a second job; `InitLevel( job, level )` sets both and the job's skills.
import type { InventoryItem } from '@flyffweb/protocol';
import type { BotSpec } from './settings';

/** A hero's job id less this is its second job's (JOB_LORDTEMPLER_HERO 24 is JOB_KNIGHT 6's hero). */
const HERO_FROM_SECOND = 18;

/** The GM lines that give `bot` its level and job, then its job's skill lines (`setup.skillLines`, by final job). */
export function setupCommands(bot: BotSpec, jobTitle: (job: number) => string, skillLines: Readonly<Record<string, readonly string[]>>): string[] {
  // a hero is named as its second job, with the legend step 2: the command takes the second match of that name after
  // the second job (its master is the first), so `/level Knight 129 2` is the Knight's hero
  const hero = bot.group === 'hero';
  const named = hero ? bot.job - HERO_FROM_SECOND : bot.job;
  const title = jobTitle(named);
  if (!/^[A-Za-z]+$/.test(title)) throw new Error(`the job ${named} has no one-word name for /level ("${title}")`);
  const level = hero ? `/level ${title} ${bot.level} 2` : `/level ${title} ${bot.level}`;
  return [level, ...(skillLines[String(bot.job)] ?? []).filter((line) => !/createitem|^\/ci\d?\b/i.test(line))];
}

/** The object ids of the bag items in `gear` that are not worn (EQUIP toggles: a worn one would come off). */
export function gearToEquip(bag: ReadonlyMap<number, InventoryItem>, worn: readonly number[], gear: readonly number[]): number[] {
  const out: number[] = [];
  for (const item of bag.values()) {
    if (gear.includes(item.itemId) && item.count > 0 && !worn.includes(item.objectId)) out.push(item.objectId);
  }
  return out;
}
