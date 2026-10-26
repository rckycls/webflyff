// Neuz's applets: the windows and functions an `APP_*` id names, which the task bar's slots, its Start menu and the
// hotkeys run (`CWndMgr::ObjectExecutor`). The table copies `CWndMgr::AddAllApplet` (`_Interface/FuncApplet.cpp:175-302`),
// which registers each applet's icon, its description (the tooltip, `m_pAppletDesc`) and its hotkey.

/** A text an applet names: a TID of the texts catalog (`GETTEXT`), or one the C++ writes as it is (`_T( "..." )`). */
export type AppletText = { tid: string } | { text: string };

/** An applet of `CWndMgr::AddAllApplet`: its `APP_*` name, its icon in Client/Icon (none for two), description, hotkey. */
export interface Applet {
  name: string;
  icon: string | null;
  desc: AppletText;
  hotkey: string | null;
}

const applet = (name: string, icon: string | null, desc: string, hotkey: string | null = null): Applet => ({
  name, icon, desc: desc.startsWith('TID_') ? { tid: desc } : { text: desc }, hotkey,
});

/** The `APP_*` ids the client names (`Resource/ResData.h`). */
export const AppId = {
  STATUS1: 577,
  CHARACTER3: 764,
  SKILL3: 622,
  LOGOUT: 1100,
} as const;

/**
 * The applets the live build registers, by `APP_*` id (`Resource/ResData.h`), with their icon, description and hotkey:
 * `CWndMgr::AddAllApplet` (`FuncApplet.cpp:175-302`) for `__VER` 15 and `__MAINSERVER`, in a language other than French
 * (`APP_LORD_SKILL` 'L', `APP_COUPLE_MAIN` 'F', the quest key 'Q', `NeuzMsgProc.cpp:174-181`). `__IMPROVE_MAP_SYSTEM` and
 * `__GUILDVOTE` are in the dead internal and test sections of `Neuz/VersionCommon.h` (`APP_MAP`, no `APP_GUILD_VOTE`),
 * `__TMP_POCKET`, `__NEW_WEB_BOX` and `__Y_INTERFACE_VER3` are commented out, and the `__BB_*` windows are on (:210-214).
 * `APP_MESSENGER_` is `APP_MESSENGER_EX` (`AppDefine.h:9-10`). Later registrations of an id replace earlier ones
 * (`m_mapAppletFunc.SetAt`); there are none here.
 */
export const APPLETS: ReadonlyMap<number, Applet> = new Map([
  [1000, applet('APP_NAVIGATOR', 'Icon_Navigator.dds', 'TID_TIP_NAVIGATOR', 'N')],
  [AppId.STATUS1, applet('APP_STATUS1', 'Icon_Status.dds', 'TID_TIP_STATUS', 'T')],
  [228, applet('APP_MAP', 'Icon_Applet.dds', 'TID_TIP_MAP', 'M')],
  [728, applet('APP_LORD_SKILL', 'Icon_Infopang.dds', 'TID_TIP_INFOPANG', 'L')],
  [712, applet('APP_INFOPANG', 'Icon_Infopang.dds', 'TID_TIP_INFOPANG')],
  [811, applet('APP_HOUSING', 'Icon_Housing.dds', 'TID_GAME_HOUSING_BOX', 'Y')],
  [853, applet('APP_GH_FURNITURE_STORAGE', 'Icon_Housing.dds', 'TID_GAME_HOUSING_BOX', 'R')],
  [AppId.CHARACTER3, applet('APP_CHARACTER3', 'Icon_Character.dds', 'TID_TIP_CHARACTER', 'H')],
  [1003, applet('APP_INVENTORY', 'Icon_Inventory.dds', 'TID_TIP_INVENTORY', 'I')],
  [400, applet('APP_WEBBOX', 'Icon_CitemMall.dds', 'TID_TIP_ITEMMALL')],
  [AppId.SKILL3, applet('APP_SKILL3', 'Icon_Skill.dds', 'TID_TIP_SKILL', 'K')],
  [172, applet('APP_MOTION', 'Icon_Motion.dds', 'TID_TIP_MOTION', 'O')],
  [1009, applet('APP_TRADE', 'Icon_Trade.dds', 'TID_TIP_TRADE')],
  [591, applet('APP_VENDOR_REVISION', 'Icon_Applet.dds', 'TID_TIP_VENDOR')],
  [859, applet('APP_QUEST_EX_LIST', 'Icon_Quest.dds', 'TID_TIP_QUEST', 'Q')],
  [195, applet('APP_PARTY', 'Icon_Troupe.dds', 'TID_TIP_PARTY', 'P')],
  [2023, applet('APP_TELEPORTER', 'Icon_Applet.dds', 'Teleporter', 'U')],
  [2024, applet('APP_ARENA_3V3', 'Icon_Applet.dds', '3v3 Arena', 'Z')],
  [2026, applet('APP_DUNGEON_STATUS', 'Icon_Applet.dds', 'Dungeon Status')],
  [2025, applet('APP_DUNGEON_UI', 'Icon_Applet.dds', 'Dungeon Entry', 'Y')], // BB_DUNGEON_UI_HOTKEY, _Common/DungeonUiInfo.h:6
  [323, applet('APP_GUILD', 'Icon_Troupe.dds', 'TID_TIP_COMPANY', 'G')],
  [689, applet('APP_BAG_EX', 'Icon_BagBag.tga', 'TID_APP_BAG_EX', 'B')],
  [398, applet('APP_COMM_ITEM', 'Icon_CItemTime.dds', 'TID_TIP_ITEMTIME', 'J')],
  [394, applet('APP_TEST', 'Icon_Troupe.dds', 'TID_TIP_PARTY')],
  [493, applet('APP_PIERCING', 'Icon_Troupe.dds', 'TID_TIP_PARTY')],
  [1014, applet('APP_COMMUNICATION_CHAT', 'Icon_Chat.dds', 'TID_TIP_COMMUNICATION_CHAT')],
  [302, applet('APP_MESSENGER_EX', 'Icon_Messenger.dds', 'TID_TIP_MESSENGER', 'E')],
  [1061, applet('APP_OPTION_SOUND', 'Icon_OptSound.dds', 'TID_TIP_OPTION_SOUND')],
  [163, applet('APP_OPTION_WINDOW', 'Icon_Applet.dds', 'TID_TIP_OPTION_WINDOW')],
  [1065, applet('APP_OPTION_MYINFO', 'Icon_Applet.dds', 'TID_TIP_OPTION_MYINFO')],
  [412, applet('APP_OPTIONEX', 'Icon_Applet.dds', 'TID_APP_OPTION')],
  [1030, applet('APP_INFO_NOTICE', 'Icon_Applet.dds', 'TID_TIP_INFO_NOTICE')],
  [1040, applet('APP_HELPER_HELP', 'Icon_HelperHelp.dds', 'TID_TIP_HELPER_HELP')],
  [1041, applet('APP_HELPER_TIP', 'Icon_HelperTip.dds', 'TID_TIP_HELPER_TIP')],
  [1042, applet('APP_HELPER_FAQ', 'Icon_HelperFAQ.dds', 'TID_TIP_HELPER_FAQ')],
  [AppId.LOGOUT, applet('APP_LOGOUT', 'Icon_Logout.dds', 'TID_TIP_LOGOUT')],
  [1101, applet('APP_QUIT', 'Icon_Quit.dds', 'TID_TIP_QUIT')],
  [2016, applet('APP_WEBBOX2', 'QOODO.dds', 'TID_TIP_QOODO')],
  [2002, applet('APP_WORLD', 'Icon_Applet.dds', 'TID_TIP_WORLD')],
  [2004, applet('APP_DEBUGINFO', 'Icon_Applet.dds', 'TID_TIP_DEBUGINFO')],
  [501, applet('APP_LOGIN', 'Icon_Login.dds', 'TID_TIP_APPLET')],
  [502, applet('APP_SELECT_SERVER', 'Icon_SelectServer.dds', 'TID_TIP_WORLD')],
  [503, applet('APP_CREATE_CHAR', 'Icon_CreateChar.dds', 'TID_TIP_WORLD')],
  [504, applet('APP_SELECT_CHAR', 'Icon_SelectChar.dds', 'TID_TIP_DIALOG')],
  [593, applet('APP_PARTY_QUICK', null, 'TID_TIP_DIALOG')],
  [597, applet('APP_BUFF_STATUS', null, 'TID_TIP_DIALOG')],
  [813, applet('APP_COUPLE_MAIN', 'Icon_Couple.dds', 'TID_GAME_COUPLE', 'F')],
  [875, applet('APP_2ND_PASSWORD_NUMBERPAD', 'Icon_Applet.dds', 'TID_2ND_PASSWORD_WINDOW_OPEN')],
]);

/** The text `text` names: the catalog's for a TID (`texts`, '' for one it lacks), the C++'s own otherwise. */
export function appletText(text: AppletText, texts: ReadonlyMap<string, { text: string }>): string {
  return 'tid' in text ? texts.get(text.tid)?.text ?? '' : text.text;
}
