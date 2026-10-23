import { Mesh, Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { MoveMark } from '../src/world/render/moveMark';

const marks = (scene: Scene): Mesh[] => scene.children.filter((o): o is Mesh => o instanceof Mesh);

describe('MoveMark', () => {
  it('shows a ring 0.05 over the tapped point, in web coordinates, and nothing before a tap', () => {
    const scene = new Scene();
    const mark = new MoveMark(scene);
    expect(marks(scene)).toEqual([]);
    mark.show([6968, 100, 3328]);
    const [ring] = marks(scene);
    expect(ring).toBeDefined();
    expect(ring!.position.toArray()).toEqual([6968, 100.05, -3328]);
  });

  it('stays while the destination is its point, and goes when it is not: arrived, ended or another', () => {
    const scene = new Scene();
    const mark = new MoveMark(scene);
    mark.show([10, 1, 20]);
    mark.follow([10, 1, 20]);
    expect(marks(scene)).toHaveLength(1);
    mark.follow(null);
    expect(marks(scene)).toEqual([]);

    mark.show([10, 1, 20]);
    mark.follow([10, 1, 21]);
    expect(marks(scene)).toEqual([]);
    // gone stays gone
    mark.follow([10, 1, 20]);
    expect(marks(scene)).toEqual([]);
  });

  it('a new tap moves the one mark; dispose takes it away', () => {
    const scene = new Scene();
    const mark = new MoveMark(scene);
    mark.show([10, 1, 20]);
    mark.show([30, 2, 40]);
    expect(marks(scene)).toHaveLength(1);
    expect(marks(scene)[0]!.position.toArray()).toEqual([30, 2.05, -40]);
    mark.dispose();
    expect(marks(scene)).toEqual([]);
    mark.follow([30, 2, 40]);
    expect(marks(scene)).toEqual([]);
  });
});
