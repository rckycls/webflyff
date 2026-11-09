import { describe, expect, it } from 'vitest';
import { readPropQuest } from '../src/inc/propQuest';

const DEFINES = new Map([
  ['QUEST_VOCMER_BFTRN', 151], ['QUEST_FIND_REDBANGT', 83], ['QUEST_OLD', 900], ['QUEST_PARTY', 901],
  ['JOB_VAGRANT', 0], ['JOB_MERCENARY', 1], ['JOB_ACROBAT', 2], ['JOB_ASSIST', 3], ['JOB_MAGICIAN', 4],
  ['MI_AIBATT1', 20], ['MI_RBANG1', 300], ['II_SYS_SYS_QUE_REDBANGHEAD', 7000], ['QSAY_BEGIN1', 0],
]);
const STRINGS = new Map([
  ['IDS_PROPQUEST_INC_000670', 'The Path of the Mercenary'],
  ['IDS_PROPQUEST_INC_000671', 'Hello.'],
  ['IDS_PROPQUEST_INC_000683', 'Slay 10 Small Aibatts just north of Eastern Flarine and return to Mustang.'],
  ['IDS_PROPQUEST_INC_000684', ''],
  ['IDS_PROPQUEST_INC_000820', 'Find Red Bang Thieves'],
  ['IDS_PROPQUEST_INC_000829', 'Bring a Red Bang head to Luda.'],
]);

const MERCENARY = `
QUEST_VOCMER_BFTRN
{
	SetTitle( IDS_PROPQUEST_INC_000670 );
	setting
	{
		SetCharacter( "MaFl_Mustang" );
		SetEndCondCharacter( "MaFl_Mustang", 7153, 3244, 1 );
		SetBeginCondLevel( 15, 15 );
		SetBeginCondParty( 0, 0, 0, 0 );
		SetBeginCondJob( JOB_VAGRANT );
		SetEndCondKillNPC( 0, MI_AIBATT1, 10, 7128, 3333, 1 );
		SetEndRewardGold( 1500, 1500 );
		SetHeadQuest( 6051 );
	}
	SetDialog( QSAY_BEGIN1, IDS_PROPQUEST_INC_000671 );
	state 0
	{
		SetDesc( IDS_PROPQUEST_INC_000683 );
	}
	state 14
	{
		SetDesc( IDS_PROPQUEST_INC_000684 );
	}
}`;

const RED_BANG = `
QUEST_FIND_REDBANGT
{
	SetTitle( IDS_PROPQUEST_INC_000820 );
	setting
	{
		SetCharacter( "MaFl_Luda" );
		SetEndCondCharacter( "MaFl_Luda", 6927, 3236, QUEST_DESTINATION_ID_0000 );
		SetBeginCondLevel( 30, 60 );
		SetBeginCondParty( 0, 0, 0, 0 );
		SetBeginCondJob( JOB_MERCENARY, JOB_ACROBAT, JOB_ASSIST, JOB_MAGICIAN );
		QuestItem( MI_RBANG1, II_SYS_SYS_QUE_REDBANGHEAD, 500000000, 1 );
		SetEndCondLevel( 30, 129 );
		SetEndCondItem( -1, 0, -1, II_SYS_SYS_QUE_REDBANGHEAD, 1, 7506, 4210, QUEST_DESTINATION_ID_0002 );
		SetEndRemoveItem( 0, II_SYS_SYS_QUE_REDBANGHEAD, -1 );
		SetEndRewardExp( 14258, 14258 );
		SetHeadQuest( 6004 );
	}
	state 0 { SetDesc( IDS_PROPQUEST_INC_000829 ); }
}`;

const read = (text: string) => readPropQuest(text, DEFINES, STRINGS, 'propQuest.inc');

describe('readPropQuest (CProject::LoadPropQuest, Project.cpp:1368-2517)', () => {
  it("reads the Mercenary's first quest", () => {
    expect(read(MERCENARY)).toEqual([{
      id: 151, title: 'The Path of the Mercenary', head: 6051,
      npc: 'MaFl_Mustang', endNpc: 'MaFl_Mustang', endGoal: { x: 7153, z: 3244, text: 1 },
      levelMin: 15, levelMax: 15, jobs: [0],
      kills: [{ slot: 0, mover: 20, count: 10, goal: { x: 7128, z: 3333, text: 1 } }],
      rewards: { gold: [1500, 1500] },
      states: { 0: 'Slay 10 Small Aibatts just north of Eastern Flarine and return to Mustang.', 14: '' },
    }]);
  });

  it('reads an item quest', () => {
    const [quest] = read(RED_BANG);
    expect(quest).toMatchObject({
      id: 83, head: 6004, levelMin: 30, levelMax: 60, jobs: [1, 2, 3, 4], endLevel: [30, 129],
      endGoal: { x: 6927, z: 3236, text: 0 },
      items: [{ sex: -1, type: 0, jobOrItem: -1, item: 7000, count: 1, goal: { x: 7506, z: 4210, text: 2 } }],
      rewards: { exp: [14258, 14258] },
    });
  });

  it('remaps the old head ids to the four kinds', () => {
    const heads = [1992, 1993, 1996, 1999, 1850].map((head) =>
      read(`QUEST_OLD { SetTitle( "Old" ); setting { SetHeadQuest( ${head} ); } }`)[0]!.head);
    expect(heads).toEqual([6003, 6001, 6000, 6002, 1850]);
  });

  it('skips SetDialog, QuestItem and the party conditions without losing its place', () => {
    expect(read(MERCENARY + RED_BANG).map((quest) => quest.id)).toEqual([151, 83]);
  });

  it('a ; may be missing after a statement', () => {
    const [quest] = read('QUEST_OLD { setting { SetEndCondLimitTime( 3 ) SetRepeat( 1 ); SetRemove( 0 ); } }');
    expect(quest).toMatchObject({ limitTime: 3, repeat: true, noRemove: true });
  });

  it('marks a party or guild end condition as unsupported', () => {
    const [quest] = read('QUEST_PARTY { setting { SetEndCondParty( 2, 0, 3, 0 ); SetEndCondGuild( 0, 0, 0 ); } }');
    expect(quest!.unsupported).toEqual(['party']);
  });

  it("reads the raised pet's terms and the pet level-up reward of the Pet Tamer's quests (2026-11-09)", () => {
    // QUEST_PETTAME02's setting (D to C, propQuest.inc:17635-17642)
    const [quest] = read(`QUEST_OLD
    {
      setting
      {
        SetCharacter( "MaFl_PetTamer" );
        SetBeginCondPetLevel( 1 );
        SetEndCondPetLevel( 1 );
        SetEndCondPetExp( 100 );
        SetEndRewardPetLevelup();
      }
    }`);
    expect(quest).toMatchObject({ beginPetLevel: 1, endPetLevel: 1, endPetExp: 100, rewards: { petLevelup: true } });
    // a pet level is not a term the browser cannot judge, and level 0 (the egg) is a real term
    expect(quest).not.toHaveProperty('unsupported');
    expect(quest).not.toHaveProperty('beginUnsupported');
    expect(read('QUEST_OLD { setting { SetBeginCondPetLevel( 0 ); SetBeginCondPetExp( 50 ); } }')[0])
      .toMatchObject({ beginPetLevel: 0, beginPetExp: 50 });
  });

  it('the pet terms at their defaults (-1 for a level, 0 for EXP) are no term; a later statement wins', () => {
    const [quest] = read(`QUEST_OLD { setting {
      SetBeginCondPetLevel( 2 ); SetBeginCondPetLevel( -1 ); SetBeginCondPetExp( 0 );
      SetEndCondPetLevel( 3 ); SetEndCondPetLevel( -1 ); SetEndCondPetExp( 0 );
    } }`);
    expect(quest).toEqual({ id: 900, title: '', head: 0, states: {} });
  });

  it('a title-only entry is a folder with no conditions', () => {
    expect(read('QUEST_OLD { SetTitle( "1st Job Change" ); setting { SetHeadQuest( 6001 ); } }'))
      .toEqual([{ id: 900, title: '1st Job Change', head: 6001, states: {} }]);
  });

  it("the giver is the last SetCharacter of the client's language (English), and the end NPC when none is set", () => {
    // Project.cpp:1468-1492 (a language other than the client's is skipped) and :2440-2453 (no SetEndCondCharacter)
    const [korean, priest, english] = read(`
QUEST_OLD { setting { SetCharacter( "MaFl_Alice", LANG_KOR ); SetEndCondCharacter( "MaFl_Alice", -1, -1, 46 ); } }
QUEST_PARTY { setting { SetCharacter( "MaFl_Prist" ); } }
QUEST_FIND_REDBANGT { setting { SetCharacter( "MaFl_Old" ); SetCharacter( "MaFl_Eng", LANG_ENG ); SetCharacter( "MaFl_Pick", LANG_JAP ); SetEndCondCharacter( "" ); } }`);
    expect([korean!.npc, korean!.endNpc]).toEqual([undefined, 'MaFl_Alice']);
    expect([priest!.npc, priest!.endNpc]).toEqual(['MaFl_Prist', 'MaFl_Prist']);
    expect([english!.npc, english!.endNpc]).toEqual(['MaFl_Eng', 'MaFl_Eng']);
  });

  it('a quest that cannot be read is said and skipped, and the quests round it are kept (spec §4)', () => {
    const broken = `${MERCENARY}\nQUEST_OLD\n\tSetTitle( "No brace" );\n\tsetting { SetHeadQuest( 6001 ); }\n}\n${RED_BANG}`;
    const skipped: string[] = [];
    const quests = readPropQuest(broken, DEFINES, STRINGS, 'propQuest.inc', (error) => skipped.push(error.message));
    expect(quests.map((quest) => quest.id)).toEqual([151, 83]);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]).toContain("expected '{' after quest");
    expect(() => read(broken)).toThrow("expected '{' after quest");
  });
});
