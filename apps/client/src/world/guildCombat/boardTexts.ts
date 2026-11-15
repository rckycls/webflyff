// The Guild Siege's info boards and the offer window's Red Chip text (2026-11-15, B3; A-client.md §2.7, §2.1). Each is
// copied from the file Neuz reads (UTF-16LE with BOM, V15 markup: `#b`/`#nb` bold, `#cAARRGGBB`/`#nc` colour, read by
// `parseDialogText`) from `Client/Client/` of the V15 game files:
//
//   BOARD1  GuildCombatTEXT_1_ENG.inc   Information to Participate   (Frankie)
//   BOARD2  GuildCombatTEXT_2_ENG.inc   Basic Rule                    (Frankie)
//   BOARD3  GuildCombatTEXT_3_ENG.inc   Conditions to Win             (Frankie)
//   JACKPOT2 GuildCombatTEXT_5_ENG.inc  Information about Prize Money (Donaris)
//   INFO_TEX GuildCombatTEXT_6_ENG.inc  Commission Information        (Donaris)
//   RED_CHIP GuildCombatRedChipGuild.inc (ASCII)                      the offer window's Red Chip Info
//
// GuildCombatTEXT_4_ENG.inc is not here: no menu uses it (it is byte for byte TEXT_6).
//
// The owner's rules (plan decision D8) replace the stock numbers, in the files' own words as far as they go:
//   TEXT_1  Application Time "Sunday 00:00 to Saturday 12:00"  -> applications are open whenever no siege is running;
//           Required Guild Level 20+                            -> 50+;
//           "The 8 highest paying guilds"                       -> the 12 highest bids;
//           the schedule (13:30 / 13:10 / 13:15 / 13:45)        -> the siege opens at 6:52 AM and 6:52 PM and the war is at
//                                                                  8:00 AM and 8:00 PM, Philippine time, every day;
//           (3 or more guilds, member level 30+, Channel 1: as stock)
//   TEXT_2  "Each member has 3 lives"                           -> 6 lives
//   TEXT_6  "the 8 Guilds which succeed"                        -> the 12 guilds
// TEXT_3, TEXT_5 and the Red Chip text are the stock files unchanged.

export const BOARD1 = [
  '#b#cff0000ff* Participation#nb#nc',
  '* Application Time: whenever no Guild Siege is running',
  '* Combat Place : Server Channel 1',
  '* Conditions',
  ' - Guild Leader',
  ' - Required Guild Level: Level 50+',
  ' - Required Guild Member Level: 30+ ',
  ' - Guild Leader or Kingpin must join.',
  ' -The 12 highest bids will be granted entry to the Guild Siege. ',
  '* Schedule (Philippine time, every day)',
  ' - 6:52 AM / 6:52 PM  Siege opens, applications close',
  ' - 8:00 AM / 8:00 PM  Combat begins',
  '#b#cffff0000* Guild Siege will only begin if 3 or more Guilds are accepted.#nb#nc',
].join('\n');

export const BOARD2 = [
  '#b#cff0000ff* Basic Rules#nb#nc',
  ' - Battle lasts for 30 minutes.',
  ' - Parties and Buff will be cancelled.',
  ' - Item trading is disabled 5 minutes before combat.',
  ' - Each battle lasts 10 minutes.',
  ' - 5 members from each Guild join.',
  ' - A new member enters replaces a defeated guild member.',
  ' - Defeated members move to The end of The line.',
  ' - Each member has 6 "lives".',
  '',
  '#b#cffff0000* Players cannot join Guild seige and 1vs1 Guild Siege at the same time.#nb#nc',
].join('\n');

export const BOARD3 = [
  '#b#cff0000ff* Winning#nb#nc',
  '#b#cff0000ff* Priority#nb#nc',
  '1. The highest final point',
  '2. The most amount of revival chance of survived characters',
  '3. The lowest average level of survived characters',
  '#b#cff0000ff* Point Gaining#nb#nc',
  'Defeating the enemy (+2)',
  '#b#cff0000ff* Bonus Point Gaining (Overlapping is possible)#nb#nc',
  '- Killing the enemy who was not defeated by the character before (+1)',
  '- Killing the enemy by Guild Master (+1)',
  '- Killing Defender (+1)',
  '- Killing the enemy when the revival chance of the character is 0 (+1)',
  '- To every revival chance of survived characters (+1)',
].join('\n');

export const BOARD_PRIZE = [
  '#b#cff0000ff* Reward#nb#nc',
  ' - Red Chips',
  '* Players cannot receive Red Chips if they leave the Battle Area.',
  '* Be sure to wait for Red Chips to be awarded before leaving the Battle Area.',
  '#b#cffff0000* If a player\'s inventory is full, Red Chips will be sent to their Mailbox.#nb#nc',
].join('\n');

export const BOARD_FEE = [
  '#b#cff0000ff* Applying Fee#nb#nc',
  '- Cancellation: 20% of applying money is deducted.',
  '- Failure: 2% of applying money is deducted.',
  '* Please make it sure that the 12 Guilds which succeed to join Guild Combat cannot get back the applying money.',
].join('\n');

export const RED_CHIP_INFO = [
  '#b#cff0000ff* Information#nb#nc',
  ' - Red Chips are rewarded according to a Guild success in the Guild Siege.',
  ' - Red Chips are tradeable and can be used to purchase items from Waforu.',
  ' - Number of Red Chips rewards depends on the type of Guild Siege and the number of participants in the Guild Siege.',
].join('\n');

/** The board each menu entry opens (`WndWorld.cpp:3994-4159`), by the MMI number. */
export const BOARD_OF_ENTRY: Readonly<Record<number, string>> = {
  37: BOARD1, 38: BOARD2, 39: BOARD3, 35: BOARD_PRIZE, 40: BOARD_FEE,
};
