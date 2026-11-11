// The honour titles a player has earned (2026-11-11, the honour window): Neuz's `CTitleManager::m_vecEarned`, which the
// Fame/Master page of the Character window lists (`CWndHonor::RefreshList`, `_Interface/WndField.cpp:4097-4122`).
//
//   CTitleManager::IsEarned / AddEarned / RemoveEarned / InitEarned   _Common/honor.cpp:484-520
//   CTitleManager::GetNeedCount( id, -1 )                            honor.cpp:314-361 (the `case -1`: m_mapAll)
//   the own ADD_OBJ (CMover::Serialize, the active mover)             _Common/ObjSerializeOpt.cpp:612-634: InitEarned, then
//                                                                    each title earned is added, without a word
//   CDPClient::OnHonorListAck                                        Neuz/DPClient.cpp:17242-17278: a title newly earned is
//                                                                    added with TID_GAME_GET_TITLE, one no longer earned is
//                                                                    taken out; the page's list is made again

/** One earned title (`EarnedTitle`, `honor.h:23-27`): its honour id and its text (`GetTitle( nId )`). */
export interface EarnedTitle {
  id: number;
  title: string;
}

/**
 * The earned titles, in the order Neuz keeps them (`push_back` on each `AddEarned`). A title is earned when its count is
 * at least its need and the need is above 0 (`nHonorTitle[i] >= nNeed && (0 < nNeed)`). `needs` is the honour list's
 * `GetNeedCount( id, -1 )` (an id not in it gives -1, never earned); `titles` its `GetTitle` ('' for none).
 */
export class HonorBook {
  private list: EarnedTitle[] = [];
  /** Counts each change of the list, for the window to redraw only then. */
  revision = 0;

  constructor(private readonly needs: ReadonlyMap<number, number>, private readonly titles: ReadonlyMap<number, string>) {}

  /** `m_vecEarned`. */
  get earned(): readonly EarnedTitle[] {
    return this.list;
  }

  /** The own ADD_OBJ's counts (`ObjSerializeOpt.cpp:612-634`): the list made again from them, without a word. */
  load(counts: readonly number[]): void {
    this.list = [];
    counts.forEach((count, id) => {
      if (this.isEarnedBy(id, count)) this.add(id);
    });
    this.revision++;
  }

  /**
   * HONOR_LIST_ACK's counts (`OnHonorListAck`): a title now earned that was not is added at the end, one no longer earned is
   * taken out. Returns the titles newly earned, in id order, for `TID_GAME_GET_TITLE` ("You have earned the title: %s!").
   */
  apply(counts: readonly number[]): EarnedTitle[] {
    const added: EarnedTitle[] = [];
    counts.forEach((count, id) => {
      if (this.isEarnedBy(id, count)) {
        if (!this.isEarned(id)) added.push(this.add(id));
      } else {
        this.list = this.list.filter((title) => title.id !== id);
      }
    });
    this.revision++;
    return added;
  }

  /** `IsEarned( nId )`. */
  isEarned(id: number): boolean {
    return this.list.some((title) => title.id === id);
  }

  private isEarnedBy(id: number, count: number): boolean {
    const need = this.needs.get(id) ?? -1;
    return count >= need && need > 0;
  }

  /** `AddEarned( nId )`: `strTitle = GetTitle( nId )`. */
  private add(id: number): EarnedTitle {
    const title = { id, title: this.titles.get(id) ?? '' };
    this.list.push(title);
    return title;
  }
}
