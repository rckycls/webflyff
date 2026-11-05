// FuncTextCmd.cpp's command table as V15 runs it in English (2026-11-05, docs/superpowers/specs/2026-11-05-ui-fixes-research.md
// §5): `BEGINE_TEXTCMDFUNC_MAP` (_Interface/FuncTextCmd.cpp:5135-5284), the 111 entries before `open`, where both Neuz
// and the world server stop outside Korea (:5561-5565). Each: its long and short names (typed exactly, case and all),
// the authorization it needs, where it runs (TCM_CLIENT, _SERVER, _BOTH), what it takes and what it does (`m_pszDesc`,
// translated: Neuz shows no description in English). The emoticons (`textEmotion.txt`) are the only other "/" lines Neuz
// sends: as plain chat.

import type { ChatCommand } from './chatCommands';

/** `TCM_CLIENT` 0: Neuz runs it and sends nothing; `TCM_SERVER` 1 and `TCM_BOTH` 2: the line goes to the server. */
export type CommandRoute = 'client' | 'server' | 'both';

/** A command of the table with its route. */
export interface TableCommand extends ChatCommand {
  route: CommandRoute;
}

type Row = readonly [long: string, short: string, auth: string, route: 'C' | 'S' | 'B', usage: string, help: string];

const ROWS: readonly Row[] = [
  // AUTH_GENERAL 'F': every player (:5137-5166)
  ['whisper', 'w', 'F', 'S', '<name> <text>', 'Whisper'],
  ['say', 'say', 'F', 'S', '<name> <text>', 'Whisper'],
  ['position', 'pos', 'F', 'C', '', 'Show your position'],
  ['shout', 's', 'F', 'B', '<text>', 'Shout'],
  ['partychat', 'p', 'F', 'B', '<text>', 'Party chat'],
  ['Time', 'ti', 'F', 'C', '', 'Show the real and the Madrigal time'],
  ['GuildChat', 'g', 'F', 'B', '<text>', 'Guild chat'],
  ['PartyInvite', 'partyinvite', 'F', 'S', '<name>', 'Invite to the party'],
  ['GuildInvite', 'guildinvite', 'F', 'S', '<name>', 'Invite to the guild'],
  ['CampusInvite', 'campusinvite', 'F', 'S', '<name>', 'Invite as a pupil'],
  ['tradeagree', 'ta', 'F', 'C', '', 'Accept trade requests'],
  ['traderefuse', 'tr', 'F', 'C', '', 'Refuse trade requests'],
  ['whisperagree', 'wa', 'F', 'C', '', 'Accept whispers'],
  ['whisperrefuse', 'wr', 'F', 'C', '', 'Refuse whispers'],
  ['messengeragree', 'ma', 'F', 'C', '', 'Accept friend requests'],
  ['messengerrefuse', 'mr', 'F', 'C', '', 'Refuse friend requests'],
  ['stageagree', 'ga', 'F', 'C', '', 'Accept party invites'],
  ['stagerefuse', 'gr', 'F', 'C', '', 'Refuse party invites'],
  ['connectagree', 'ca', 'F', 'C', '', 'Friend log-in notices on'],
  ['connectrefuse', 'cr', 'F', 'C', '', 'Friend log-in notices off'],
  ['shoutagree', 'ha', 'F', 'C', '', 'Show shouts'],
  ['shoutrefuse', 'hr', 'F', 'C', '', 'Hide shouts'],
  ['ignore', 'ig', 'F', 'C', '<name>', "Block a player's chat"],
  ['unignore', 'uig', 'F', 'C', '<name>', 'Unblock a player'],
  ['ignorelist', 'igl', 'F', 'C', '', 'The blocked players'],
  // AUTH_GAMEMASTER 'L' (:5171-5175)
  ['teleport', 'te', 'L', 'S', '<name> | <world> <x> <z>', 'Teleport'],
  ['invisible', 'inv', 'L', 'S', '', 'Invisible'],
  ['noinvisible', 'noinv', 'L', 'S', '', 'Visible again'],
  ['summon', 'su', 'L', 'S', '<name>', 'Summon a player to you'],
  ['count', 'cnt', 'L', 'S', '', 'Players online'],
  // AUTH_GAMEMASTER2 'M' and AUTH_HELPER 'J' (:5178-5190)
  ['out', 'out', 'M', 'S', '<name>', 'Kick a player'],
  ['talk', 'nota', 'M', 'S', '<name>', 'Let a player talk again'],
  ['notalk', 'ta', 'M', 'S', '<name>', 'Forbid a player to talk (/ta is tradeagree here)'],
  ['ip', 'ip', 'M', 'B', '<name>', "A player's IP"],
  ['Mute', 'mute', 'M', 'S', '<name> <seconds>', 'Mute a player'],
  ['GuildRanking', 'ranking', 'M', 'S', '', 'Refresh the guild ranking'],
  ['FallSnow', 'fs', 'M', 'S', '', 'Snow on'],
  ['StopSnow', 'ss', 'M', 'S', '', 'Snow off'],
  ['FallRain', 'frain', 'M', 'S', '', 'Rain on'],
  ['StopRain', 'sr', 'M', 'S', '', 'Rain off'],
  ['system', 'sys', 'J', 'S', '<text>', 'A system message to all'],
  // AUTH_GAMEMASTER3 'N' (:5193-5231)
  ['PvpParam', 'p_Param', 'N', 'S', '<fame> <slaughter>', 'PvP values'],
  ['PKParam', 'pkparam', 'N', 'S', '<pk> <propensity>', 'PK values'],
  ['undying', 'ud', 'N', 'B', '', 'Invincible'],
  ['undying2', 'ud2', 'N', 'B', '', 'Hurt but never dying'],
  ['noundying', 'noud', 'N', 'B', '', 'Invincibility off'],
  ['onekill', 'ok', 'N', 'B', '', 'One-hit kills'],
  ['noonekill', 'nook', 'N', 'B', '', 'One-hit kills off'],
  ['aroundkill', 'ak', 'N', 'S', '', 'Hit the monsters around'],
  ['stat', 'stat', 'N', 'S', '<str|sta|dex|int|gp|restate|all> <n>', 'Set a stat'],
  ['level', 'lv', 'N', 'S', '<job> <level> [1|2]', 'Set the level and job'],
  ['InitSkillExp', 'InitSE', 'N', 'S', '', 'Reset the skills'],
  ['skilllevel', 'slv', 'N', 'B', '<level>', 'The chosen skill to a level'],
  ['skilllevelAll', 'slvAll', 'N', 'B', '', 'Every skill to its most'],
  ['BeginQuest', 'bq', 'N', 'S', '<quest>', 'Start a quest'],
  ['EndQuest', 'eq', 'N', 'S', '<quest>', 'Finish a quest'],
  ['RemoveQuest', 'rq', 'N', 'S', '<quest> [name]', 'Remove a quest'],
  ['RemoveAllQuest', 'raq', 'N', 'S', '', 'Remove all quests'],
  ['RemoveCompleteQuest', 'rcq', 'N', 'S', '', 'Remove the finished quests'],
  ['changejob', 'cjob', 'N', 'S', '<job>', 'Change job'],
  ['freeze', 'fr', 'N', 'S', '<name>', 'Freeze a player'],
  ['nofreeze', 'nofr', 'N', 'S', '<name>', 'Unfreeze a player'],
  ['PartyLevel', 'plv', 'N', 'S', '<level> <points>', 'Party level'],
  ['GuildStat', 'gstat', 'N', 'S', '<logo|pxp|penya> <n> | notice <text>', 'Guild values'],
  ['createguild', 'cg', 'N', 'S', '<name>', 'Create a guild'],
  ['destroyguild', 'dg', 'N', 'C', '', 'Destroy your guild'],
  ['GCIn', 'gcin', 'N', 'B', '', 'Enter the guild siege'],
  ['GCOpen', 'gcopen', 'N', 'B', '', 'Open the guild siege'],
  ['GCClose', 'gcclose', 'N', 'B', '<n>', 'Close the guild siege'],
  ['GCNext', 'gcNext', 'N', 'B', '', 'The guild siege\'s next stage'],
  ['indirect', 'id', 'N', 'B', '<npc id> <text>', 'Make an NPC speak'],
  ['createnpc', 'cn', 'N', 'S', '<mover> [count] [aggressive]', 'Spawn monsters or NPCs'],
  ['EVENTLIST', 'eventlist', 'N', 'S', '', 'The Lua events'],
  ['EVENTINFO', 'eventinfo', 'N', 'S', '<id>', 'A Lua event'],
  ['gamesetting', 'gs', 'N', 'S', '', 'The game settings'],
  ['rmvnpc', 'rn', 'N', 'S', '<object id>', 'Remove an NPC'],
  // AUTH_ADMINISTRATOR 'P' (:5234-5284)
  ['disguise', 'dis', 'P', 'S', '<mover>', 'Transform'],
  ['noDisguise', 'nodis', 'P', 'S', '', 'Undo the transformation'],
  ['ResistItem', 'ritem', 'P', 'B', '<element> <level> <upgrade>', 'Element on an item'],
  ['jobname', 'jn', 'P', 'C', '', 'The job names'],
  ['getgold', 'gg', 'P', 'S', '<amount>', 'Get Penya'],
  ['createitem', 'ci', 'P', 'B', '<item> [count] [charged]', 'Create an item'],
  ['createitem2', 'ci2', 'P', 'S', '<"name"> <awakening>', 'Create an item with an awakening'],
  ['QuestState', 'qs', 'P', 'S', '<quest> <state> [name]', "Set a quest's state"],
  ['loadscript', 'loscr', 'P', 'B', '', 'Reload the scripts'],
  ['ReloadConstant', 'rec', 'P', 'S', '', 'Reload constant.inc'],
  ['ctd', 'ctd', 'P', 'B', '', 'The duel zone event'],
  ['Piercing', 'pier', 'P', 'B', '<sockets>', 'Piercing'],
  ['petlevel', 'pl', 'P', 'B', '', 'Pet level up'],
  ['petexp', 'pe', 'P', 'B', '', 'Pet EXP to its most'],
  ['makepetfeed', 'mpf', 'P', 'B', '', 'The pet food mill'],
  ['Pet', 'pet', 'P', 'B', '<name> <kind> <exp> <level> <life>', 'Set a pet'],
  ['Lua', 'lua', 'P', 'S', '<event|ms|rr>', 'Reload a Lua script'],
  ['GC1TO1OPEN', 'gc1to1open', 'P', 'B', '[1]', 'Open the 1:1 guild war'],
  ['GC1TO1CLOSE', 'gc1to1close', 'P', 'B', '', 'Close the 1:1 guild war'],
  ['GC1TO1NEXT', 'gc1to1next', 'P', 'B', '', 'The 1:1 guild war\'s next stage'],
  ['RefineAccessory', 'ra', 'P', 'B', '<level>', 'Upgrade the accessory in bag slot 1'],
  ['RefineCollector', 'rc', 'P', 'B', '<level>', 'Upgrade the collector in bag slot 1'],
  ['GenRandomOption', 'gro', 'P', 'B', '', 'An awakening on bag slot 1'],
  ['InitializeRandomOption', 'iro', 'P', 'B', '', 'Clear the awakening on bag slot 1'],
  ['SetRandomOption', 'sro', 'P', 'B', '<dst> <adj> ...', 'Set the awakening on bag slot 1'],
  ['SetPetName', 'setpetname', 'P', 'S', '<name>', 'Name the pet'],
  ['ClearPetName', 'cpn', 'P', 'C', '', "Clear the pet's name"],
  ['Propose', 'propose', 'P', 'S', '<name>', 'Propose'],
  ['Refuse', 'refuse', 'P', 'S', '', 'Refuse a proposal'],
  ['Couple', 'couple', 'P', 'S', '', 'Accept, couple'],
  ['Decouple', 'decouple', 'P', 'S', '', 'Break up'],
  ['ClearPropose', 'clearpropose', 'P', 'S', '', 'Clear the proposal'],
  ['NextCoupleLevel', 'ncl', 'P', 'S', '', 'Couple level up'],
  ['RemoveBuff', 'rb', 'P', 'B', '', 'Remove all your buffs'],
  ['HonorTitleSet', 'hts', 'P', 'B', '<title> <count>', 'Set a title counter'],
];

const ROUTES = { C: 'client', S: 'server', B: 'both' } as const;

/** The table, in its order (the first entry a name matches wins, `ParsingCommand`). */
export const CHAT_COMMANDS: readonly TableCommand[] = ROWS.map(([long, short, auth, route, usage, help]) => ({
  names: short === long ? [long] : [long, short], usage, help, auth: auth.charCodeAt(0), route: ROUTES[route],
}));

/** The emoticons (`Resource/textEmotion.txt.txt`, `CDialogMsg::LoadEmotion`): "/" and one of these goes as plain chat. */
export const EMOTICONS: readonly string[] = [
  'laugh', 'sad', 'kiss', 'surprise', 'blush', 'anger', 'sigh', 'wink', 'ache', 'hunger', 'yummy', 'sneer', 'sparkle',
  'ridicule', 'sleepy', 'rich', 'glare', 'sweat', 'cat face', 'tongue', 'mad', 'aha', 'embarrassed', 'help', 'crazy', 'oh!',
  'confused', 'ouch', 'love',
];
