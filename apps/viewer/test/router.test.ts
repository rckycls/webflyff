import { describe, expect, it } from 'vitest';
import { DEFAULT_ROUTE, parseRoute } from '../src/router';

describe('parseRoute', () => {
  it('defaults to the character view', () => {
    expect(DEFAULT_ROUTE).toBe('character');
    expect(parseRoute('').name).toBe('character');
    expect(parseRoute('#').name).toBe('character');
    expect(parseRoute('#/').name).toBe('character');
  });

  it('knows the three views', () => {
    expect(parseRoute('#/character').name).toBe('character');
    expect(parseRoute('#/world').name).toBe('world');
    expect(parseRoute('#/compare').name).toBe('compare');
  });

  it('falls back to the default for a route it does not have', () => {
    expect(parseRoute('#/nonsense').name).toBe('character');
    expect(parseRoute('#/world/extra').name).toBe('character');
  });

  it('reads parameters after the question mark, the world by its web name', () => {
    const route = parseRoute('#/world?world=wdmadrigal&x=1');

    expect(route.name).toBe('world');
    expect(route.params.get('world')).toBe('wdmadrigal');
    expect(route.params.get('x')).toBe('1');
  });

  it('has empty parameters when there is no question mark', () => {
    expect([...parseRoute('#/compare').params]).toEqual([]);
  });
});
