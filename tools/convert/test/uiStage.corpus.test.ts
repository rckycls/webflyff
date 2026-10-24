// The UI stage on the real client folder. A corpus test (`npm run test:corpus -- ui`): it needs the client. The rules
// are unit-tested on a hand-made client in uiStage.test.ts.

import { readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { decodeScript, readTexturePack } from '@flyffweb/formats';
import type { WebUiSheets } from '@flyffweb/formats';
import { clientRoot, describeClient } from '../../../packages/formats/test/helpers/client';
import { ClientFs } from '../src/ClientFs';
import { AssetWriter } from '../src/output/AssetWriter';
import { iconKeyOf } from '../src/output/keys';
import { Report } from '../src/output/Report';
import { THEME_FILES, uiStage } from '../src/ui/uiStage';
import { makeTempDir } from './helpers/fakeClient';
import type { ReportJson } from './helpers/worldRun';

describeClient('the UI stage on the real client', () => {
  let out: string;
  let client: ClientFs;
  let writer: AssetWriter;
  let reportJson: ReportJson;

  const readPng = async (key: string): Promise<PNG> => {
    const hashed = writer.pathOf(key);
    expect(hashed, key).toBeDefined();
    return PNG.sync.read(await fs.readFile(path.join(out, ...hashed!.split('/'))));
  };

  beforeAll(async () => {
    out = await makeTempDir('flyffweb-ui-real-');
    client = await ClientFs.open(clientRoot()!);
    writer = new AssetWriter(out);
    const report = new Report();
    await uiStage.run({ client, writer, report, jobs: 8, outDir: out });
    await report.write(out);
    reportJson = JSON.parse(await fs.readFile(path.join(out, 'report.json'), 'utf8')) as ReportJson;
  }, 600_000);

  afterAll(async () => {
    await fs.rm(out, { recursive: true, force: true });
  });

  it('writes every picture without a failure; only the .jpg icons are left out, with one warning', () => {
    expect(reportJson.failures).toEqual([]);
    const pictures = client.list('Icon', /\.(dds|tga|bmp)$/i).length;
    const jpegs = client.list('Icon', /\.jpe?g$/i).length;
    expect(pictures).toBeGreaterThan(450);
    expect(jpegs).toBeGreaterThan(0);
    // every picture of Client/Icon, every piece of the theme list, and DmgEffect.dds
    expect(reportJson.kinds.ui!.ok).toBe(pictures + THEME_FILES.length + 1 + 1); // + DmgEffect.dds + the sheets catalog
    expect(reportJson.warnings.filter((w) => w.kind === 'ui')).toHaveLength(1);
    expect(reportJson.warnings[0]!.message).toContain('.jpg');
  });

  it('has every piece of the theme list in the client and writes it', () => {
    expect(reportJson.warnings.filter((w) => /not in/.test(w.message))).toEqual([]);
    for (const file of THEME_FILES) {
      expect(client.find('Theme/Default', file), file).not.toBeNull();
      expect(writer.pathOf(iconKeyOf(file)), file).toBeDefined();
    }
  });

  it('lists the pieces the Piece 4 windows draw', () => {
    const listed = new Set(THEME_FILES.map((f) => f.toLowerCase()));
    for (const file of [
      'GauEmptyNormal.bmp', 'LvUp.bmp', 'LvUp2.bmp', 'LvDn.bmp', 'LvDn2.bmp', 'WndNewCharacter01.tga',
      'ButtCharPlus.bmp', 'ButtCharMinus.bmp', 'ButtCharApply.tga', 'ButtCharReset.tga', 'WndTile00.tga', 'WndTile11.tga',
      'ButtWndExit.tga',
    ]) {
      expect(listed.has(file.toLowerCase()), file).toBe(true);
    }
  });

  it('writes the skill icons of the Vagrant with their magenta transparent (234, 252 and 270 pixels of 1024)', async () => {
    const counts: number[] = [];
    for (const name of ['Skill_VagOneCleanh.dds', 'Skill_VagOneBrandi.dds', 'Skill_VagOneOvercu.dds']) {
      const png = await readPng(iconKeyOf(name));
      expect([png.width, png.height]).toEqual([32, 32]);
      let clear = 0;
      for (let i = 3; i < png.data.length; i += 4) if (png.data[i] === 0) clear++;
      counts.push(clear);
    }
    expect(counts.sort((a, b) => a - b)).toEqual([234, 252, 270]);
  });

  it('writes the damage digits and the target corners with the frames of their scripts', async () => {
    const hashed = writer.pathOf('data/uiSheets.json');
    expect(hashed).toBeDefined();
    const sheets = JSON.parse(await fs.readFile(path.join(out, ...hashed!.split('/')), 'utf8')) as WebUiSheets;

    expect(sheets.damageDigits.image).toBe('ui/dmgeffect.png');
    expect(sheets.damageDigits.frames).toHaveLength(28);
    expect(sheets.damageDigits.frames[0]).toEqual({ x: 0, y: 0, w: 50, h: 50 });
    expect(sheets.damageDigits.frames[9]).toEqual({ x: 450, y: 0, w: 50, h: 50 });
    expect(sheets.damageDigits.frames[10]).toEqual({ x: 0, y: 50, w: 200, h: 50 });
    expect(sheets.damageDigits.frames[14]).toEqual({ x: 0, y: 128, w: 50, h: 50 });
    const dmg = await readPng(sheets.damageDigits.image);
    expect([dmg.width, dmg.height]).toEqual([1024, 256]);

    expect(sheets.targetCorners.image).toBe('ui/icon_target.png');
    expect(sheets.targetCorners.frames).toHaveLength(16);
    expect(sheets.targetCorners.frames[1]).toEqual({ x: 0, y: 0, w: 32, h: 32, flip: 'h' });
    const corners = await readPng(sheets.targetCorners.image);
    expect([corners.width, corners.height]).toEqual([64, 64]);

    // the same frames as the reader gives for the script
    const incText = decodeScript(new Uint8Array(readFileSync(client.find('SFX', 'DmgEffect.inc')!)));
    expect(sheets.damageDigits.frames).toEqual(readTexturePack(incText, 'DmgEffect.inc', { width: 1024, height: 256 }).frames);
  });
});
