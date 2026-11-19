import { expect, it } from 'vitest';
import { discordCountsText } from '../src/site/discordBox';

it.each([
  [{ online: 42, members: 310 }, '42 online · 310 members'],
  [{ online: 1, members: 1 }, '1 online · 1 member'],
  [{ online: 0, members: 5 }, '0 online · 5 members'],
  [{ online: null, members: 310 }, '310 members'],
  [{ online: 42, members: null }, '42 online'],
  [{ online: null, members: null }, null],
])('says %j as %s', (answer, text) => expect(discordCountsText(answer)).toBe(text));
