// The particles of `g_ParticleMng` on screen (pets R1; `CParticles::Render`, `_Common/ParticleMng.cpp:355-475`): one
// point cloud a kind, its picture times each particle's colour (white faded to black by its fade, `D3DXColorLerp`),
// added onto what is drawn (`D3DRS_SRCBLEND` and `DESTBLEND` `D3DBLEND_ONE`), depth-tested but not written. D3D scales a
// point sprite by the distance (`POINTSCALE_A` 0, `_B` 0, `_C` 1: the viewport's height times `m_fSize` over the
// distance, at least 1 pixel); three.js's size attenuation gives the size times half the height over the distance, so
// the clouds take twice `m_fSize`.

import { toWebPosition } from '@flyffweb/formats';
import type { TextureCache } from '@flyffweb/scene';
import type { Scene, Texture } from 'three';
import { AddEquation, BufferAttribute, BufferGeometry, Color, CustomBlending, OneFactor, Points, PointsMaterial, SRGBColorSpace } from 'three';
import { PARTICLES_PER_KIND, PET_PARTICLE_KINDS } from '../pets/petParticles';
import type { PetParticles } from '../pets/petParticles';

interface Cloud {
  points: Points<BufferGeometry, PointsMaterial>;
  positions: Float32Array;
  colors: Float32Array;
  texture: string;
  /** Its picture has come: until then nothing of the kind is drawn (`m_pParticleTexture == NULL`). */
  ready: boolean;
}

const shade = new Color();

export class ParticleLayer {
  private readonly clouds = new Map<number, Cloud>();
  private disposed = false;

  constructor(private readonly scene: Scene, private readonly textures: Pick<TextureCache, 'acquire' | 'release'>) {}

  /** The live particles of every kind, as they are after the last rules step. */
  draw(particles: PetParticles): void {
    for (const kind of particles.liveKinds()) if (!this.clouds.has(kind)) this.add(kind);
    for (const [kind, cloud] of this.clouds) {
      const live = particles.particles(kind);
      const n = Math.min(live.length, PARTICLES_PER_KIND);
      for (let i = 0; i < n; i++) {
        const p = live[i]!;
        const [x, y, z] = toWebPosition(p.pos);
        cloud.positions[i * 3] = x;
        cloud.positions[i * 3 + 1] = y;
        cloud.positions[i * 3 + 2] = z;
        shade.setRGB(p.fade, p.fade, p.fade, SRGBColorSpace);
        cloud.colors[i * 3] = shade.r;
        cloud.colors[i * 3 + 1] = shade.g;
        cloud.colors[i * 3 + 2] = shade.b;
      }
      const geometry = cloud.points.geometry;
      geometry.setDrawRange(0, n);
      geometry.getAttribute('position').needsUpdate = true;
      geometry.getAttribute('color').needsUpdate = true;
      cloud.points.visible = cloud.ready && n > 0;
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const cloud of this.clouds.values()) {
      cloud.points.removeFromParent();
      cloud.points.geometry.dispose();
      cloud.points.material.dispose();
      this.textures.release(cloud.texture);
    }
    this.clouds.clear();
  }

  /** A kind's cloud, made the first time it has particles (`CParticleMng::CreateParticle`'s first one loads its picture). */
  private add(kind: number): void {
    const entry = PET_PARTICLE_KINDS.get(kind);
    if (entry === undefined) return;
    const positions = new Float32Array(PARTICLES_PER_KIND * 3);
    const colors = new Float32Array(PARTICLES_PER_KIND * 3);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('color', new BufferAttribute(colors, 3));
    const material = new PointsMaterial({
      size: entry.size * 2, sizeAttenuation: true, vertexColors: true, transparent: true, depthWrite: false,
      blending: CustomBlending, blendEquation: AddEquation, blendSrc: OneFactor, blendDst: OneFactor,
    });
    const points = new Points(geometry, material);
    points.name = `particles ${kind}`;
    points.frustumCulled = false; // the cloud moves every frame: its bounds are not kept
    points.visible = false;
    this.scene.add(points);
    const cloud: Cloud = { points, positions, colors, texture: entry.texture, ready: false };
    this.clouds.set(kind, cloud);
    void this.textures.acquire(entry.texture).then((texture: Texture) => {
      if (this.disposed || this.clouds.get(kind) !== cloud) return;
      material.map = texture;
      material.needsUpdate = true;
      cloud.ready = true;
    });
  }
}
