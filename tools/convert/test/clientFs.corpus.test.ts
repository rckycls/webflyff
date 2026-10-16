import path from 'node:path';
import { beforeAll, expect, it } from 'vitest';
import { ClientFs } from '../src/ClientFs';
import { clientRoot, describeClient } from '../../../packages/formats/test/helpers/client';

describeClient('ClientFs on the real client folder', () => {
  let client: ClientFs;

  beforeAll(async () => {
    client = await ClientFs.open(clientRoot()!);
  });

  it('indexes the three packs', () => {
    expect(client.packs.list().length).toBeGreaterThan(0);
  });

  it('finds every .wld by a differently-cased name, and lists the worlds the client ships', () => {
    const worlds = client.list('World', /\.wld$/i, true);
    expect(worlds.length).toBeGreaterThan(10);
    for (const file of worlds) {
      const dir = path.dirname(file);
      const rel = path.relative(client.root, dir).split(path.sep).join('/').toUpperCase();
      expect(client.find(rel, path.basename(file).toLowerCase()), file).toBe(file);
    }
    expect(client.find('world', 'WDMADRIGAL')).toBe(path.join(client.root, 'World', 'WdMadrigal'));
  });

  it('lists the models of the Model folder', () => {
    expect(client.list('Model', /\.o3d$/i).length).toBeGreaterThan(1000);
  });
});
