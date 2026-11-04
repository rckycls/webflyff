// propItemEtc.inc: the set items and the socket cards, as `CProject::LoadPiercingAvail` reads them
// (Source/_Common/Project.cpp:4137-4229). 2026-11-05, for the item tooltip (`PutSetItemOpt`, `PutPiercingOpt`).
//
//   SetItem <id> <IDS name> { Elem { <II_*> <PARTS_*> ... } Avail { <DST_*> <adj> <pieces worn> ... } }
//   Piercing <II_*> { <DST_*> <adj> ... }
//
// `RandomOptItem` blocks would be read too, but the shipped file has none, so they are not kept (see the tooltip
// research: the old random-option prefix is dead with this data).

import { ScriptReader } from '../script/cscript';
import type { WebAccessory, WebItemEtc, WebPiercingAvail, WebSetItem } from '../web/gameData';

const READER = 'readPropItemEtc';
const CPP_REF = 'Source/_Common/Project.cpp:4137 CProject::LoadPiercingAvail';

/**
 * Reads the text of `propItemEtc.inc` (see `decodeScript`). `strings` turns a set's `IDS_*` name into text, `defines`
 * the item, part and DST names into numbers. Sets come in file order; a card's blocks are added together, in the order
 * its first block came (`CPiercingAvail::AddPiercingAvail`).
 */
export function readPropItemEtc(
  text: string,
  defines: ReadonlyMap<string, number>,
  strings: ReadonlyMap<string, string>,
  file = 'propItemEtc.inc',
): Pick<WebItemEtc, 'sets' | 'piercing'> {
  const r = new ScriptReader(text, defines, strings, { file, reader: READER, cppRef: CPP_REF });
  // `*s.token != '}'`: the number just read was the block's closing brace (atoi of "}" is 0)
  const closed = (): boolean => r.lastToken()?.text.startsWith('}') === true;
  const sets: WebSetItem[] = [];
  const piercing = new Map<number, WebPiercingAvail>();

  for (let subject = r.tokenOrEnd(); subject !== undefined; subject = r.tokenOrEnd()) {
    if (subject.text === 'Piercing') {
      const itemId = r.number('the card of a Piercing block');
      r.token("the Piercing block's {");
      const card = piercing.get(itemId) ?? { itemId, params: [] };
      piercing.set(itemId, card);
      for (let dst = r.number("a DST or '}'"); !closed(); dst = r.number("a DST or '}'")) {
        card.params.push({ dst, adj: r.number(`the value of DST ${dst}`) });
      }
    } else if (subject.text === 'SetItem') {
      const id = r.number('the id of a SetItem block');
      const name = r.token('the name of a SetItem block').text;
      const set: WebSetItem = { id, name, elems: [], avail: [] };
      r.token("the SetItem block's {");
      for (let category = r.token('Elem, Avail or }'); !category.text.startsWith('}'); category = r.token('Elem, Avail or }')) {
        if (category.text === 'Elem') {
          r.token("Elem's {");
          for (let itemId = r.number("an item or '}'"); !closed(); itemId = r.number("an item or '}'")) {
            set.elems.push({ itemId, part: r.number(`the part of item ${itemId}`) });
          }
        } else if (category.text === 'Avail') {
          r.token("Avail's {");
          for (let dst = r.number("a DST or '}'"); !closed(); dst = r.number("a DST or '}'")) {
            const adj = r.number(`the value of DST ${dst}`);
            set.avail.push({ dst, adj, count: r.number(`the pieces DST ${dst} needs`) });
          }
        } else {
          r.fail(`"${category.text}" is neither Elem nor Avail`, category);
        }
      }
      sortItemAvail(set.avail);
      sets.push(set);
    }
    // any other word is passed over, as the C++ loop's s.GetToken() does
  }
  return { sets, piercing: [...piercing.values()] };
}

/** `CSetItem::SortItemAvail` (Project.cpp:4333-4352): every pair out of order is swapped, which is not a stable sort. */
function sortItemAvail(avail: WebSetItem['avail']): void {
  for (let i = 0; i < avail.length - 1; i++) {
    for (let j = i + 1; j < avail.length; j++) {
      if (avail[i]!.count > avail[j]!.count) [avail[i], avail[j]] = [avail[j]!, avail[i]!];
    }
  }
}

/** `MAX_AAO` (`_Common/accessory.h`): the highest refine of an accessory. */
const MAX_AAO = 20;

/**
 * Reads the text of `accessory.inc` as `CAccessoryProperty::LoadScript` does (Source/_Common/accessory.cpp:39-90): for
 * each accessory, what it gives at each refine level 0 to 20 (`GetDst( id, m_nAbilityOption )`). The `Probability` block
 * is the server's and is passed over. A level outside 0 to 20 throws, where the C++ asserts.
 */
export function readAccessories(
  text: string,
  defines: ReadonlyMap<string, number>,
  file = 'accessory.inc',
): WebAccessory[] {
  const r = new ScriptReader(text, defines, new Map(), {
    file, reader: 'readAccessories', cppRef: 'Source/_Common/accessory.cpp:39 CAccessoryProperty::LoadScript',
  });
  const closed = (): boolean => r.lastToken()?.text.startsWith('}') === true;
  const accessories: WebAccessory[] = [];
  for (let subject = r.tokenOrEnd(); subject !== undefined; subject = r.tokenOrEnd()) {
    if (subject.text === 'Probability') {
      r.token("Probability's {");
      for (r.number("a chance or '}'"); !closed(); r.number("a chance or '}'"));
    } else if (subject.text === 'Accessory') {
      r.token("Accessory's {");
      for (let itemId = r.number("an item or '}'"); !closed(); itemId = r.number("an item or '}'")) {
        r.token(`the { of item ${itemId}`);
        const levels: Array<Array<{ dst: number; adj: number }>> = Array.from({ length: MAX_AAO + 1 }, () => []);
        for (let level = r.number("a level or '}'"); !closed(); level = r.number("a level or '}'")) {
          const at = r.lastToken();
          if (level < 0 || level > MAX_AAO) r.fail(`refine level ${level} of item ${itemId} is outside 0..${MAX_AAO}`, at);
          r.token(`the { of level ${level}`);
          for (let dst = r.number("a DST or '}'"); !closed(); dst = r.number("a DST or '}'")) {
            levels[level]!.push({ dst, adj: r.number(`the value of DST ${dst}`) });
          }
        }
        accessories.push({ itemId, levels });
      }
    }
  }
  return accessories;
}
