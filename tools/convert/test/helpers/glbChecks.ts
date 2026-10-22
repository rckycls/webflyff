// What the model tests use to look inside the glb files the converter writes, and to find real client models. Shared
// by the unit tests (models.test.ts) and the corpus tests on real client files (modelFiles.corpus.test.ts).

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import type { Document, Node } from '@gltf-transform/core';
import { expect } from 'vitest';
import { clientRoot } from '../../../../packages/formats/test/helpers/client';

const io = new NodeIO();
export const readGlb = (bytes: Uint8Array): Promise<Document> => io.readBinary(bytes);

/** The texture callback of a model with no textures converted. */
export const noTextures = (): null => null;

/** World matrix of `node` (column-major), composed from its TRS and its parents'. */
export function worldOf(node: Node): number[] {
  return node.getWorldMatrix() as unknown as number[];
}

/** a * b for two D3DXMATRIX values in file order (row vectors: a applies first). */
export function rowMultiply(a: number[], b: number[]): number[] {
  const out = new Array<number>(16).fill(0);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) out[r * 4 + c]! += a[r * 4 + k]! * b[k * 4 + c]!;
  }
  return out;
}

export const closeTo = (actual: number[], expected: number[], digits = 5): void => {
  expect(actual.length).toBe(expected.length);
  actual.forEach((v, i) => expect(v).toBeCloseTo(expected[i]!, digits));
};

export function skinsOf(doc: Document) {
  return doc.getRoot().listSkins();
}

/** Sets every channel's node to its value at `frame` (a constant channel's value holds at every frame). */
export function poseAt(doc: Document, frame: number): void {
  for (const channel of doc.getRoot().listAnimations()[0]!.listChannels()) {
    const output = channel.getSampler()!.getOutput()!;
    const size = output.getElementSize();
    const at = Math.min(frame, output.getCount() - 1);
    const value = Array.from(output.getArray()!.slice(at * size, (at + 1) * size));
    const node = channel.getTargetNode()!;
    if (channel.getTargetPath() === 'rotation') node.setRotation(value as [number, number, number, number]);
    else if (channel.getTargetPath() === 'translation') node.setTranslation(value as [number, number, number]);
    else node.setScale(value as [number, number, number]);
  }
}

/** `Client/Model/<name>` (any case): its real path. */
export function modelPath(name: string): string {
  const dir = path.join(clientRoot()!, 'Model');
  const found = readdirSync(dir).find((f) => f.toLowerCase() === name.toLowerCase());
  if (found === undefined) throw new Error(`Client/Model/${name} not found`);
  return path.join(dir, found);
}

export const fileBytes = (file: string): Uint8Array => new Uint8Array(readFileSync(file));
