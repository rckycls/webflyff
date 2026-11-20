import { expect, it } from 'vitest';
import { shotLabel } from '../src/site/shotLabel';

it('makes a caption from the file name, without its number and extension', () => {
  expect(shotLabel('/client/site/02-boss-fight.webp', 1)).toBe('Boss fight');
  expect(shotLabel('/site/screenshots/03-auto_play.png', 2)).toBe('Auto play');
  expect(shotLabel('/site/screenshots/guild%20siege.jpg', 0)).toBe('Guild siege');
});

it('falls back to "Screenshot N" for a name with no words, and keeps a name it cannot decode', () => {
  expect(shotLabel('/client/site/07.webp', 6)).toBe('Screenshot 7');
  expect(shotLabel('/client/site/%E0%A4%A.webp', 0)).toBe('%E0%A4%A');
});
