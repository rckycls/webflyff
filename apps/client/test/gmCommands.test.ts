import { describe, expect, it } from 'vitest';
import { CLIENT_HALVES, runClientHalf } from '../src/world/gmCommands';
import type { ClientHalfContext } from '../src/world/gmCommands';
import { lineAction } from '../src/world/hud/chatCommands';
import { CHAT_COMMANDS, EMOTICONS } from '../src/world/hud/chatCommandTable';

const TEXTS: Record<string, { text: string; color: number }> = {
  TID_GAME_NOWPOSITION: { text: 'Position : x = %f, y = %f, z = %f', color: 0xffccffcc },
  TID_GAME_CHOICESKILL: { text: 'Please select from the skills in your skill window.', color: 0xff990000 },
  TID_GAME_SKILLLEVELLIMIT: { text: "Set %s' skill level: 1 ~ %d.", color: 0xff990000 },
  TID_GAME_GAMETEXT001: { text: '/slv %d %d', color: 0xff990000 },
};
const JOBS = ['Vagrant', 'Mercenary', 'Acrobat', 'Assist', 'Magician', 'Puppeteer', 'Knight', 'Blade', 'Jester', 'Ranger',
  'Ringmaster', 'Billposter', 'Psykeeper', 'Elementor', 'Gatekeeper', 'Doppler', 'Knight'].map((title) => ({ title }));
const RED = 0xffff0000;

function ctx(over: Partial<ClientHalfContext> = {}): ClientHalfContext {
  return {
    focus: null, chosenSkill: null, foodMillOpen: false, jobs: JOBS, pos: [6968, 100.5, 3328],
    now: new Date(2026, 10, 10, 9, 5, 7), text: (id) => TEXTS[id], ...over,
  };
}

describe('the client halves of FuncTextCmd.cpp (2026-11-10)', () => {
  it('/position and /Time print in the System window (TextCmd_Position :3568-3578, TextCmd_Time :170-183)', () => {
    expect(runClientHalf('position', '', '/pos', ctx()).lines).toEqual([
      { text: 'Position : x = 6968.000000, y = 100.500000, z = 3328.000000', color: 0xffccffcc },
    ]);
    expect(runClientHalf('Time', '', '/ti', ctx()).lines).toEqual([{ text: 'Real Time - 09:05:07', color: 0xffffffff }]);
  });

  it('/jobname prints the four red lines of TextCmd_JobName (:3723-3760), V15 defineJob.h ranges', () => {
    expect(runClientHalf('jobname', '', '/jn', ctx()).lines).toEqual([
      { text: 'Expert Job : Mercenary, Acrobat, Assist, Magician, Puppeteer', color: RED },
      { text: 'Expert Level : 16 ~ 60', color: RED },
      { text: 'Professional Job : Knight, Blade, Jester, Ranger, Ringmaster, Billposter, Psykeeper, Elementor, Gatekeeper, Doppler', color: RED },
      { text: 'Professional Level : 60 ~~~ ', color: RED },
    ]);
  });

  it('/ip asks for the focused player by name, else goes as typed (TextCmd_ip :3610-3630)', () => {
    expect(runClientHalf('ip', '', '/ip', ctx({ focus: { isPlayer: true, name: 'Rocky' } })).send).toBe('/ip Rocky');
    expect(runClientHalf('ip', 'Bob', '/ip Bob', ctx({ focus: { isPlayer: false, name: 'Aibatt' } })).send).toBe('/ip Bob');
    expect(runClientHalf('ip', 'Bob', '/ip Bob', ctx()).send).toBe('/ip Bob');
  });

  it('/skilllevel takes the skill window\'s chosen skill and sends "/slv skill level" (TextCmd_SkillLevel :1356-1404)', () => {
    expect(runClientHalf('skilllevel', '5', '/slv 5', ctx())).toEqual({
      lines: [{ text: 'Please select from the skills in your skill window.', color: RED }],
    });
    const chosen = { skill: 3, name: 'Clean Hit', expertMax: 20 };
    expect(runClientHalf('skilllevel', '5', '/slv 5', ctx({ chosenSkill: chosen }))).toEqual({ send: '/slv 3 5', lines: [] });
    expect(runClientHalf('skilllevel', '21', '/slv 21', ctx({ chosenSkill: chosen }))).toEqual({
      lines: [{ text: "Set Clean Hit' skill level: 1 ~ 20.", color: RED }],
    });
    expect(runClientHalf('skilllevel', '1', '/slv 1', ctx({ chosenSkill: { ...chosen, expertMax: 0 } })).send).toBeUndefined();
  });

  it('/createitem and /indirect with no words open a window Neuz has and send nothing; with words they go as typed', () => {
    expect(runClientHalf('createitem', '', '/ci', ctx())).toEqual({ lines: [] });
    expect(runClientHalf('createitem', '2800 5', '/ci 2800 5', ctx()).send).toBe('/ci 2800 5');
    expect(runClientHalf('indirect', '', '/id', ctx())).toEqual({ lines: [] });
    expect(runClientHalf('indirect', '9002 Hello', '/id 9002 Hello', ctx()).send).toBe('/id 9002 Hello');
  });

  it('/makepetfeed opens the food mill first, then goes as typed; /ClearPetName sends its packet', () => {
    expect(runClientHalf('makepetfeed', '', '/mpf', ctx())).toEqual({ lines: [], openFoodMill: true });
    expect(runClientHalf('makepetfeed', '', '/mpf', ctx({ foodMillOpen: true })).send).toBe('/mpf');
    expect(runClientHalf('ClearPetName', '', '/cpn', ctx())).toEqual({ lines: [], clearPetName: true });
  });

  it('/ResistItem and /Piercing need windows the web lacks: nothing sent', () => {
    expect(runClientHalf('ResistItem', '1 10 5', '/ritem 1 10 5', ctx())).toEqual({ lines: [] });
    expect(runClientHalf('Piercing', '3', '/pier 3', ctx())).toEqual({ lines: [] });
  });

  it('lineAction runs these TCM_BOTH commands here, with the line as typed', () => {
    const ADMIN = 'P'.charCodeAt(0);
    for (const name of CLIENT_HALVES) expect(CHAT_COMMANDS.some((c) => c.names[0] === name && c.route === 'both')).toBe(true);
    expect(lineAction('/ci 2800 5', ADMIN, CHAT_COMMANDS, EMOTICONS))
      .toEqual({ kind: 'client', command: 'createitem', args: '2800 5', line: '/ci 2800 5' });
    expect(lineAction('/ud', ADMIN, CHAT_COMMANDS, EMOTICONS)).toEqual({ kind: 'send' });
    expect(lineAction('/ci 2800', 'F'.charCodeAt(0), CHAT_COMMANDS, EMOTICONS)).toEqual({ kind: 'drop' });
  });
});
