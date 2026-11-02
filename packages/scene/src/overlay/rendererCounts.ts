// What three.js itself holds (`renderer.info`), for the viewer's and the client's test hooks: the soak tests compare these
// counts at the start and the end of their loops, so they catch a GPU leak the overlay's own byte count would not see.

import type { WebGLRenderer } from 'three';

/** Geometries and textures uploaded and not yet disposed, and shader programs. */
export interface RendererCounts {
  geometries: number;
  textures: number;
  programs: number;
}

export function rendererCounts(renderer: Pick<WebGLRenderer, 'info'>): RendererCounts {
  const { memory, programs } = renderer.info;
  return { geometries: memory.geometries, textures: memory.textures, programs: programs?.length ?? 0 };
}
