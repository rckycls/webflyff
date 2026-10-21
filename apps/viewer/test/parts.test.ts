import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MALE,
  DEFAULT_MOTION,
  PART_SLOTS,
  defaultParts,
  motionKey,
  partGender,
  partKey,
  partSlot,
  partsBySlot,
  readCharacterParams,
  skeletonKey,
} from '../src/character/parts';

describe('partGender', () => {
  it('reads the gender from the start of the stem', () => {
    expect(partGender('part_mvag01upper')).toBe('male');
    expect(partGender('part_malehair02')).toBe('male');
    expect(partGender('part_femalehead01')).toBe('female');
    expect(partGender('mvr_maflmarche')).toBeNull();
  });

  it('takes a logical key as well as a stem', () => {
    expect(partGender('models/part_mvag01upper.glb')).toBe('male');
    expect(partGender('models/part_facr01foot.glb')).toBe('female');
  });
});

describe('partSlot', () => {
  it('reads the slot from the end of the stem', () => {
    expect(partSlot('part_malehead01')).toBe('head');
    expect(partSlot('part_mvag01cap')).toBe('cap');
    expect(partSlot('part_mvag01upper')).toBe('upper');
    expect(partSlot('part_malecloakgaia')).toBe('other');
  });

  it('knows hair, hands and feet, and takes a logical key', () => {
    expect(partSlot('part_femalehair03')).toBe('hair');
    expect(partSlot('models/part_mvag01hand.glb')).toBe('hand');
    expect(partSlot('models/part_mvag01foot.glb')).toBe('foot');
  });
});

describe('defaults', () => {
  it('names the default male parts and motions', () => {
    expect(DEFAULT_MALE).toEqual({
      head: 'part_malehead01',
      hair: 'part_malehair01',
      upper: 'part_mvag01upper',
      hand: 'part_mvag01hand',
      foot: 'part_mvag01foot',
    });
    expect(DEFAULT_MOTION).toEqual({ male: 'mvr_male_genstand', female: 'mvr_female_genstand' });
  });

  const keys = [
    'models/part_femalehead02.glb',
    'models/part_femalehead01.glb',
    'models/part_femalehair01.glb',
    'models/part_fvag01upper.glb',
    'models/part_facr01upper.glb',
    'models/part_facr01hand.glb',
    'models/part_facr01foot.glb',
    'models/part_facr01cap.glb',
    'models/part_fcloakcow.glb',
    'models/part_malehead01.glb',
    'models/obj_tree01.glb',
    'textures/part_facr01upper.dds.ktx2',
  ];

  it('sorts the parts of one gender into slots, by stem, alphabetically', () => {
    const female = partsBySlot(keys, 'female');

    expect(female.head).toEqual(['part_femalehead01', 'part_femalehead02']);
    expect(female.upper).toEqual(['part_facr01upper', 'part_fvag01upper']);
    expect(female.cap).toEqual(['part_facr01cap']);
    expect(female.other).toEqual(['part_fcloakcow']);
    expect(partsBySlot(keys, 'male').head).toEqual(['part_malehead01']);
    expect(Object.keys(female).sort()).toEqual([...PART_SLOTS].sort());
  });

  it('dresses a female in the first part of each slot the male default fills', () => {
    expect(defaultParts('female', partsBySlot(keys, 'female'))).toEqual({
      head: 'part_femalehead01',
      hair: 'part_femalehair01',
      upper: 'part_facr01upper',
      hand: 'part_facr01hand',
      foot: 'part_facr01foot',
    });
  });

  it('dresses a male in DEFAULT_MALE', () => {
    expect(defaultParts('male', partsBySlot(keys, 'male'))).toEqual(DEFAULT_MALE);
  });
});

describe('logical keys', () => {
  it('names parts, skeletons and motions as the converter does', () => {
    expect(partKey('part_malehead01')).toBe('models/part_malehead01.glb');
    expect(skeletonKey('female')).toBe('skeletons/mvr_female.glb');
    expect(motionKey('male', 'mvr_male_genwalk')).toBe('motions/mvr_male/mvr_male_genwalk.glb');
  });
});

describe('readCharacterParams', () => {
  const keys = ['models/part_femalehead01.glb', 'models/part_facr01upper.glb', 'models/part_mvag01cap.glb'];
  const read = (query: string) => readCharacterParams(new URLSearchParams(query), keys);

  it('is the default male, playing from frame 0, without parameters', () => {
    expect(read('')).toEqual({
      gender: 'male',
      parts: DEFAULT_MALE,
      motion: 'mvr_male_genstand',
      paused: false,
      frame: 0,
    });
  });

  it('lets parameters override the defaults; none or empty takes a part off', () => {
    const p = read('gender=male&head=part_malehead02&cap=part_mvag01cap&hair=none&foot=&motion=mvr_male_genwalk');

    expect(p.parts).toEqual({
      head: 'part_malehead02',
      cap: 'part_mvag01cap',
      upper: 'part_mvag01upper',
      hand: 'part_mvag01hand',
    });
    expect(p.motion).toBe('mvr_male_genwalk');
  });

  it('reads the female defaults from the keys it is given', () => {
    const p = read('gender=female');

    expect(p.gender).toBe('female');
    expect(p.parts).toEqual({ head: 'part_femalehead01', upper: 'part_facr01upper' });
    expect(p.motion).toBe('mvr_female_genstand');
  });

  it('reads paused and frame; a frame that is not a whole number >= 0 is 0', () => {
    expect(read('paused=1&frame=7')).toMatchObject({ paused: true, frame: 7 });
    expect(read('paused=0&frame=3')).toMatchObject({ paused: false, frame: 3 });
    expect(read('frame=-2').frame).toBe(0);
    expect(read('frame=1.5').frame).toBe(0);
    expect(read('frame=abc').frame).toBe(0);
  });

  it('treats an unknown gender as male', () => {
    expect(read('gender=robot').gender).toBe('male');
  });
});
