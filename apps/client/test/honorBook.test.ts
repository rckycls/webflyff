// 2026-11-11: the earned honour titles (CTitleManager::m_vecEarned, _Common/honor.cpp:484-520), as the own ADD_OBJ
// (ObjSerializeOpt.cpp:612-634) and HONOR_LIST_ACK (Neuz/DPClient.cpp:17242-17278) make them.
import { describe, expect, it } from 'vitest';
import { HonorBook } from '../src/world/honor/honorBook';

/** honorList.txt's needs and titles of a few rows (Resource/honorList.txt): 7 Strongman 253, 36 Lord 1, 74 Aibatt 15000. */
const NEEDS = new Map([[7, 253], [36, 1], [74, 15000], [99, 0]]);
const TITLES = new Map([[7, 'Strongman'], [36, 'Lord'], [74, 'Aibatt Hunter'], [99, 'Zero']]);

const counts = (set: Record<number, number>): number[] => Array.from({ length: 150 }, (_, id) => set[id] ?? 0);

describe('HonorBook', () => {
  it('load: the earned list from the counts, in id order, without a word', () => {
    const book = new HonorBook(NEEDS, TITLES);
    book.load(counts({ 7: 300, 36: 1, 74: 14999 }));
    expect(book.earned).toEqual([{ id: 7, title: 'Strongman' }, { id: 36, title: 'Lord' }]);
  });

  it('a title needs a count of its need or more, and a need above 0; an id not in the list is never earned', () => {
    const book = new HonorBook(NEEDS, TITLES);
    // 99's need is 0 (`0 < nNeed` fails); 120 is in no row (GetNeedCount gives -1)
    book.load(counts({ 7: 253, 99: 5, 120: 9 }));
    expect(book.earned.map((t) => t.id)).toEqual([7]);
  });

  it('apply: a title newly earned goes at the end and is returned; one no longer earned is taken out', () => {
    const book = new HonorBook(NEEDS, TITLES);
    book.load(counts({ 36: 1 }));
    // the Lord loses the title (CheckHonorStat: IsLord is false) and Strongman comes
    expect(book.apply(counts({ 7: 260 }))).toEqual([{ id: 7, title: 'Strongman' }]);
    expect(book.earned).toEqual([{ id: 7, title: 'Strongman' }]);
    // the Lord again: after Strongman (push_back), and Strongman is not said twice
    expect(book.apply(counts({ 7: 260, 36: 1 }))).toEqual([{ id: 36, title: 'Lord' }]);
    expect(book.earned.map((t) => t.id)).toEqual([7, 36]);
    expect(book.isEarned(36)).toBe(true);
  });

  it('load after apply starts again (InitEarned), and every change counts in revision', () => {
    const book = new HonorBook(NEEDS, TITLES);
    book.apply(counts({ 7: 300, 36: 1 }));
    const before = book.revision;
    book.load(counts({ 36: 1 }));
    expect(book.earned.map((t) => t.id)).toEqual([36]);
    expect(book.revision).toBe(before + 1);
  });

  it('a title with no text is kept with \'\' (GetTitle gives NULL)', () => {
    const book = new HonorBook(new Map([[5, 1]]), new Map());
    book.load(counts({ 5: 1 }));
    expect(book.earned).toEqual([{ id: 5, title: '' }]);
  });
});
