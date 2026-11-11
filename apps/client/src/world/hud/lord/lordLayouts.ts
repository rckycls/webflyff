// The Lord windows' layouts (2026-11-11, docs/superpowers/specs/2026-11-11-lord-research.md §6), from their resdata.inc
// entries with resData.txt.txt's English. Every window is "WndTile00.tga" tiled and opens centred (`MoveParentCenter`).
//
//   APP_LORD_INFO 756           resdata.inc:22836         304 x 320   CWndLordInfo        WndLord.cpp:1010-1117
//   APP_LORD_TENDER 718         resdata.inc:17826         304 x 576   CWndLordTender      WndLord.cpp:318-454
//   APP_LORD_STATE 722          resdata.inc:18039         432 x 320   CWndLordState       WndLord.cpp:28-178
//   APP_LORD_PLEDGE 720         resdata.inc:18141         304 x 272   CWndLordPledge      WndLord.cpp:184-314
//   APP_LORD_VOTE 724           resdata.inc:20013         352 x 288   CWndLordVote        WndLord.cpp:457-596
//   APP_LORD_EVENT 726          resdata.inc:20079         320 x 208   CWndLordEvent       WndLord.cpp:599-716
//   APP_LORD_SKILL 728          resdata.inc:17937         192 x 272   CWndLordSkill       WndLord.cpp:720-872
//   APP_LORD_SKILL_CONFIRM 736  resdata.inc:21024         272 x 208   CWndLordSkillConfirm WndLord.cpp:943-1007
//
// APP_LORD_CONFIRM (the pledge change's OK / Cancel, resdata.inc:20985) is the shared message box here, as the Forsaken
// Tower's entrance box is. Controls off the window in the original (APP_LORD_TENDER's STATIC6 at x 612, APP_LORD_STATE's
// STATIC1 and STATIC6, APP_LORD_EVENT's BUTTON6) are left out.

import type { ResControl, ResLayout } from '../resWindow';

const EDIT = 'WndEditTile00.tga';
const GROUP = 'WndEditTile200.tga';
const group = (id: string, rect: ResControl['rect'], text: string): ResControl => ({ kind: 'static', id, rect, text, group: GROUP });
const label = (id: string, rect: ResControl['rect'], text = ''): ResControl => ({ kind: 'static', id, rect, text });
const button = (id: string, rect: ResControl['rect'], picture: string, text: string): ResControl => ({ kind: 'button', id, rect, picture, label: text });

export const LORD_INFO: ResLayout = {
  title: 'Lord info Window', width: 304, height: 320, texture: 'WndTile00.tga',
  controls: [
    group('WIDC_STATIC1', [8, 8, 112, 24], 'Status'),
    group('WIDC_STATIC2', [8, 36, 112, 52], 'Lord'),
    group('WIDC_STATIC3', [8, 64, 112, 80], 'Remaining time for centralization of power'),
    { kind: 'text', id: 'WIDC_TEXT1', rect: [8, 98, 290, 242], tile: EDIT, scroll: true },
    label('WIDC_STATIC4', [132, 8, 280, 24]),
    label('WIDC_STATIC5', [132, 36, 280, 52]),
    label('WIDC_STATIC6', [132, 64, 280, 78]),
    button('WIDC_BUTTON1', [112, 254, 184, 274], 'ButOk2.bmp', 'OK'),
    // 2026-11-11 (the phone only, style.css): the Lord Skill window, which a phone has no L key for
    button('WIDC_LORD_SKILL', [8, 254, 100, 274], 'ButOk2.bmp', 'Lord Skill'),
  ],
};

export const LORD_TENDER: ResLayout = {
  title: 'Bid', width: 304, height: 576, texture: 'WndTile00.tga',
  controls: [
    group('WIDC_STATIC1', [8, 8, 144, 24], 'Current application fee'),
    { kind: 'edit', id: 'WIDC_EDIT1', rect: [154, 8, 284, 26], tile: EDIT, maxLength: 10 },
    group('WIDC_STATIC2', [8, 44, 144, 60], 'Bid Info.'),
    { kind: 'text', id: 'WIDC_TEXT1', rect: [8, 68, 290, 220], tile: EDIT, scroll: true },
    group('WIDC_STATIC3', [8, 232, 144, 248], 'Bid Rank'),
    label('WIDC_STATIC4', [16, 258, 70, 274], 'Rank'),
    label('WIDC_STATIC5', [76, 258, 212, 274], 'Character name'),
    { kind: 'text', id: 'WIDC_TEXT2', rect: [8, 280, 290, 504], tile: EDIT, scroll: true },
    button('WIDC_BUTTON1', [56, 516, 130, 536], 'ButtAccept.tga', 'Accept'),
    button('WIDC_BUTTON2', [160, 516, 232, 536], 'ButtClose.tga', 'Close'),
  ],
};

export const LORD_STATE: ResLayout = {
  title: 'Candidate registration Status', width: 432, height: 320, texture: 'WndTile00.tga',
  controls: [
    label('WIDC_STATIC7', [8, 8, 232, 24], '* Minimum number of voting people condition(Live) :'),
    label('WIDC_LIVE', [232, 8, 328, 24]),
    label('WIDC_STATIC2', [20, 34, 72, 50], 'Rank'),
    label('WIDC_STATIC3', [74, 34, 214, 50], 'Character name'),
    label('WIDC_STATIC4', [232, 34, 316, 50], 'Class'),
    label('WIDC_STATIC5', [324, 34, 404, 50], 'Pledge'),
    { kind: 'list', id: 'WIDC_LISTBOX1', rect: [12, 56, 408, 252], tile: EDIT },
    button('WIDC_BUTTON1', [168, 260, 240, 280], 'ButOk2.bmp', 'OK'),
  ],
};

export const LORD_PLEDGE: ResLayout = {
  title: 'Pledge', width: 304, height: 272, texture: 'WndTile00.tga',
  controls: [
    { kind: 'text', id: 'WIDC_TEXT1', rect: [8, 8, 288, 200], tile: EDIT, scroll: true },
    // EBS_AUTOVSCROLL | EBS_WANTRETURN: a text area, put in by the window
    { kind: 'custom', id: 'WIDC_EDIT1', rect: [8, 8, 288, 200], tile: EDIT },
    button('WIDC_BUTTON2', [114, 210, 186, 230], 'ButOk2.bmp', 'OK'),
  ],
};

export const LORD_VOTE: ResLayout = {
  title: 'Vote', width: 352, height: 288, texture: 'WndTile00.tga',
  controls: [
    label('WIDC_STATIC1', [18, 10, 68, 26], 'Level'),
    label('WIDC_STATIC2', [74, 10, 202, 26], 'Name'),
    label('WIDC_STATIC3', [238, 10, 326, 26], 'Class'),
    { kind: 'list', id: 'WIDC_LISTBOX1', rect: [10, 32, 330, 204], tile: EDIT },
    { kind: 'edit', id: 'WIDC_EDIT1', rect: [20, 218, 200, 238], tile: EDIT, maxLength: 31 },
    button('WIDC_BUTTON1', [228, 216, 300, 238], 'ButOk2.bmp', 'OK'),
  ],
};

export const LORD_EVENT: ResLayout = {
  title: "Lord's Event Window", width: 320, height: 208, texture: 'WndTile00.tga',
  controls: [
    group('WIDC_STATIC1', [8, 28, 136, 44], 'Exp Up Event'),
    group('WIDC_STATIC2', [8, 60, 136, 76], 'Drop Up Event'),
    label('WIDC_STATIC3', [8, 102, 74, 118], 'Penya'),
    button('WIDC_BUTTON1', [138, 26, 180, 46], 'Buttleft2.bmp', '◄'),
    button('WIDC_BUTTON2', [258, 26, 300, 46], 'Buttright2.bmp', '►'),
    button('WIDC_BUTTON3', [138, 58, 180, 80], 'Buttleft2.bmp', '◄'),
    button('WIDC_BUTTON4', [258, 58, 300, 78], 'Buttright2.bmp', '►'),
    button('WIDC_BUTTON5', [126, 138, 192, 158], 'ButtStart.bmp', 'Start'),
    { kind: 'text', id: 'WIDC_TEXT1', rect: [182, 24, 258, 48], tile: EDIT },
    { kind: 'text', id: 'WIDC_TEXT2', rect: [182, 56, 258, 80], tile: EDIT },
    { kind: 'text', id: 'WIDC_TEXT3', rect: [62, 96, 294, 120], tile: EDIT },
  ],
};

/** The eight icons' places, WIDC_CUSTOM1 to WIDC_CUSTOM8 (CUSTOM9 holds nothing: `OnDraw` draws 8). */
export const LORD_SKILL_ICONS: ReadonlyArray<readonly [number, number]> = [
  [18, 90], [74, 90], [128, 90], [18, 138], [74, 138], [128, 138], [18, 190], [74, 190],
];

export const LORD_SKILL: ResLayout = {
  title: 'Lord Skill', width: 192, height: 272, texture: 'WndTile00.tga',
  controls: [
    { kind: 'text', id: 'WIDC_TEXT1', rect: [8, 8, 176, 68], tile: EDIT },
    ...LORD_SKILL_ICONS.map(([x, y], i): ResControl => ({ kind: 'custom', id: `WIDC_CUSTOM${i + 1}`, rect: [x, y, x + 32, y + 32] })),
  ],
};

export const LORD_SKILL_CONFIRM: ResLayout = {
  title: '', width: 272, height: 208, texture: 'WndTile00.tga',
  controls: [
    { kind: 'text', id: 'WIDC_TEXT1', rect: [8, 8, 256, 96], tile: EDIT },
    { kind: 'edit', id: 'WIDC_EDIT1', rect: [8, 110, 248, 134], tile: EDIT, maxLength: 31 },
    button('WIDC_BUTTON1', [98, 146, 170, 166], 'ButtOk.tga', 'OK'),
  ],
};
