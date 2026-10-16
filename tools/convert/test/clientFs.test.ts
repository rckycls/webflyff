import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ClientFs } from '../src/ClientFs';
import { makeTempDir, writeFakeClient } from './helpers/fakeClient';

let root: string;

beforeEach(async () => {
  root = await makeTempDir('flyffweb-client-');
  await writeFakeClient(root, {
    packed: [{ name: 'Texture.TXT', data: [104, 105] }],
    loose: {
      'World/WdMadrigal/WdMadrigal.wld': 'w',
      'World/WdMadrigal/Madrigal 01.lnd': 'l',
      'World/WdFlaris/WdFlaris.WLD': 'w',
      'Model/Part_mVag01Upper.o3d': 'o',
      'Model/Sub/Obj_Tree.O3D': 'o',
      'Model/Sub/readme.txt': 't',
    },
  });
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe('ClientFs.open', () => {
  it('indexes the three .res packs', async () => {
    const client = await ClientFs.open(root);
    expect(client.packs.has('texture.txt')).toBe(true);
    expect(Array.from(client.packs.read('TEXTURE.txt'))).toEqual([104, 105]);
  });

  it('rejects a client folder that does not exist, naming it', async () => {
    const missing = path.join(root, 'nope');
    await expect(ClientFs.open(missing)).rejects.toThrow(missing);
  });

  it.each(['data.res', 'dataSub1.res', 'dataSub2.res'])('rejects a client folder without %s, naming it', async (pack) => {
    await fs.rm(path.join(root, pack));
    await expect(ClientFs.open(root)).rejects.toThrow(pack);
  });

  it('finds a pack whatever the case of its file name', async () => {
    await fs.rename(path.join(root, 'dataSub1.res'), path.join(root, 'DATASUB1.RES'));
    const client = await ClientFs.open(root);
    expect(client.packs.has('texture.txt')).toBe(true);
  });
});

describe('ClientFs.find', () => {
  it('returns the real path of a file, whatever case and separators the caller used', async () => {
    const client = await ClientFs.open(root);
    const real = path.join(root, 'Model', 'Part_mVag01Upper.o3d');
    expect(client.find('Model', 'Part_mVag01Upper.o3d')).toBe(real);
    expect(client.find('model', 'PART_MVAG01UPPER.O3D')).toBe(real);
    expect(client.find('MODEL/', 'part_mvag01upper.o3d')).toBe(real);
    expect(client.find('World\\WdMadrigal', 'madrigal 01.LND')).toBe(
      path.join(root, 'World', 'WdMadrigal', 'Madrigal 01.lnd'),
    );
    expect(client.find('world/wdflaris', 'wdflaris.wld')).toBe(path.join(root, 'World', 'WdFlaris', 'WdFlaris.WLD'));
  });

  it('finds a nested directory given as part of relDir, and the root as ""', async () => {
    const client = await ClientFs.open(root);
    expect(client.find('model/SUB', 'obj_tree.o3d')).toBe(path.join(root, 'Model', 'Sub', 'Obj_Tree.O3D'));
    expect(client.find('', 'DATA.RES')).toBe(path.join(root, 'data.res'));
    expect(client.find('.', 'data.res')).toBe(path.join(root, 'data.res'));
  });

  it('finds a folder by name too', async () => {
    const client = await ClientFs.open(root);
    expect(client.find('World', 'wdmadrigal')).toBe(path.join(root, 'World', 'WdMadrigal'));
  });

  it('returns null for a name or a folder that is not there, and never leaves the client folder', async () => {
    const client = await ClientFs.open(root);
    expect(client.find('Model', 'missing.o3d')).toBeNull();
    expect(client.find('Nope', 'part_mvag01upper.o3d')).toBeNull();
    expect(client.find('Model', '../data.res')).toBeNull();
    expect(client.find('Model/..', 'data.res')).toBeNull();
  });
});

describe('ClientFs.list', () => {
  it('lists the matching files of one folder, sorted, as real paths', async () => {
    const client = await ClientFs.open(root);
    expect(client.list('model', /\.o3d$/i)).toEqual([path.join(root, 'Model', 'Part_mVag01Upper.o3d')]);
    expect(client.list('World/WdMadrigal', /\.(wld|lnd)$/i)).toEqual([
      path.join(root, 'World', 'WdMadrigal', 'Madrigal 01.lnd'),
      path.join(root, 'World', 'WdMadrigal', 'WdMadrigal.wld'),
    ]);
  });

  it('descends into folders only when asked', async () => {
    const client = await ClientFs.open(root);
    expect(client.list('Model', /\.o3d$/i, true)).toEqual([
      path.join(root, 'Model', 'Part_mVag01Upper.o3d'),
      path.join(root, 'Model', 'Sub', 'Obj_Tree.O3D'),
    ]);
    expect(client.list('World', /\.wld$/i)).toEqual([]);
    expect(client.list('World', /\.wld$/i, true)).toEqual([
      path.join(root, 'World', 'WdFlaris', 'WdFlaris.WLD'),
      path.join(root, 'World', 'WdMadrigal', 'WdMadrigal.wld'),
    ]);
  });

  it('matches the pattern against the file name only, even with a g flag', async () => {
    const client = await ClientFs.open(root);
    expect(client.list('World', /^wd.*\.wld$/gi, true)).toHaveLength(2);
    expect(client.list('World', /world/i, true)).toEqual([]);
  });

  it('returns nothing for a folder that is not there', async () => {
    const client = await ClientFs.open(root);
    expect(client.list('Nope', /./)).toEqual([]);
    expect(client.list('Model/..', /./)).toEqual([]);
  });
});
