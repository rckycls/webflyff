// The `ultimate` stage (2026-11-10, docs/superpowers/specs/2026-11-10-jewels-research.md): data/ultimate.json, what the
// jewel windows and the tooltip's set jewels need (WebUltimate):
//
//   abilities, levelGems   Ultimate_GemAbility.txt (the resource packs) as CUltimateWeapon::Load_GemAbility reads it
//                          (_Common/UltimateWeapon.cpp:46-102): `ABILITY <DST> { <jewel> <ability jewel> v1 .. v5 ... }`
//                          and `LEVEL_GEM { <jewel> <min> <max> ... }`
//   descriptions           Client/SmeltJewel.inc and Client/SmeltExtraction.inc (loose in the client folder), as
//                          CWndSmeltJewel::SetDescription and CWndExtraction::SetDescription load them (`CScript::Load`'s
//                          whole text, WndField.cpp:20405-20417, :19831-19843); 2026-11-10, and Client/summonAngelQuest.inc,
//                          the Summon Angel window's text (`SetQuestText( scanner.m_pProg )`, WndWorld.cpp:4861-4869;
//                          docs/superpowers/specs/2026-11-10-summon-angel-research.md)
//
// It runs when there is no `--only`, or when a glob matches `ultimate`: `--only ultimate` writes this catalog alone, so a
// folder whose data/itemProps.json is kept by hand needs no `--only data`. The packs' Ultimate_GemAbility.txt is the one
// Neuz's tooltip reads (the owner's server keeps its own, custom values: research §10).

import { promises as fs } from 'node:fs';
import { ULTIMATE_KEY, decodeScript, loadDefines } from '@flyffweb/formats';
import type { WebUltimate } from '@flyffweb/formats';
import type { Stage, StageContext } from '../run';
import { matchesOnly } from '../util';

const STAGE = 'ultimate';
const KIND = 'data';
const GEM_FILE = 'Ultimate_GemAbility.txt';
const DESCRIPTION_DIR = 'Client';
const DESCRIPTIONS = { jewel: 'SmeltJewel.inc', extraction: 'SmeltExtraction.inc', summonAngel: 'summonAngelQuest.inc' } as const;

/** The words of a script as CScanner gives them here: words and braces; `//` and `/* *\/` comments out. */
function words(text: string): string[] {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ').split(/(\{|\}|\s+)/).filter((w) => w.trim() !== '');
}

/**
 * Ultimate_GemAbility.txt: each ABILITY block's DST and jewels, and LEVEL_GEM's rows. A name `defines` lacks is an error,
 * as Load_GemAbility's `GetDefineNum` gives -1 and LEVEL_GEM refuses it (:83-87).
 */
export function readGemAbility(text: string, defines: ReadonlyMap<string, number>): Pick<WebUltimate, 'abilities' | 'levelGems'> {
  const tokens = words(text);
  const define = (name: string): number => {
    const value = defines.get(name);
    if (value === undefined) throw new Error(`${GEM_FILE}: ${name} is not defined`);
    return value;
  };
  const num = (word: string | undefined): number => {
    const value = Number(word);
    if (!Number.isFinite(value)) throw new Error(`${GEM_FILE}: ${String(word)} is not a number`);
    return value;
  };
  const abilities: WebUltimate['abilities'] = [];
  const levelGems: WebUltimate['levelGems'] = [];
  let i = 0;
  const block = (row: () => void): void => {
    if (tokens[i] !== '{') throw new Error(`${GEM_FILE}: a { is missing`);
    i++;
    while (i < tokens.length && tokens[i] !== '}') row();
    i++;
  };
  while (i < tokens.length) {
    const word = tokens[i++]!;
    if (word === 'ABILITY') {
      const dst = define(tokens[i++]!);
      const jewels: WebUltimate['abilities'][number]['jewels'] = [];
      block(() => {
        const jewel = define(tokens[i++]!), ability = define(tokens[i++]!);
        const values = [0, 1, 2, 3, 4].map(() => num(tokens[i++]));
        jewels.push({ jewel, ability, values });
      });
      abilities.push({ dst, jewels });
    } else if (word === 'LEVEL_GEM') {
      block(() => {
        const jewel = define(tokens[i++]!), min = num(tokens[i++]), max = num(tokens[i++]);
        levelGems.push({ jewel, min, max });
      });
    }
  }
  return { abilities, levelGems };
}

export const ultimateStage: Stage = {
  name: STAGE,
  async run(ctx: StageContext) {
    if (!matchesOnly(STAGE, ctx.only)) return;
    if (!ctx.client.packs.has(GEM_FILE)) {
      ctx.report.warn(KIND, GEM_FILE, `${GEM_FILE} is not in the packs: the tooltip shows no set jewels' stats`);
      return;
    }
    try {
      const gem = ctx.client.packs.read(GEM_FILE);
      const catalog: WebUltimate = { ...readGemAbility(decodeScript(gem), loadDefines(ctx.client.packs)), descriptions: {} };
      for (const [key, file] of Object.entries(DESCRIPTIONS) as Array<[keyof typeof DESCRIPTIONS, string]>) {
        const found = ctx.client.find(DESCRIPTION_DIR, file);
        if (found === null) ctx.report.warn(KIND, `${DESCRIPTION_DIR}/${file}`, `${file} is missing: its window has no description`);
        else catalog.descriptions[key] = decodeScript(new Uint8Array(await fs.readFile(found)));
      }
      const json = new TextEncoder().encode(JSON.stringify(catalog));
      await ctx.writer.write(ULTIMATE_KEY, json, GEM_FILE);
      ctx.report.ok(KIND, GEM_FILE, gem.length, json.length);
    } catch (error) {
      ctx.report.fail(KIND, ULTIMATE_KEY, error);
    }
  },
};
