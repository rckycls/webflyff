import { describe, expect, it } from 'vitest';
import { parseDialogText, sayText, type TextRun } from '../src/world/hud/dialogue/dialogText';

const plain = { color: 0xff000000, bold: false, underline: false, strike: false };
const run = (text: string, style: Partial<TextRun> = {}): TextRun => ({ text, ...plain, ...style });

describe('sayText (CWndDialog::Say, WndDialog.cpp:423-453)', () => {
  it('Say starts a page with two spaces and turns each \\n into a new line and two spaces', () => {
    expect(sayText('Hello\\nWorld')).toBe('  Hello\n  World');
  });

  it('a quest page starts with its title in bold, in the quest colour', () => {
    expect(sayText('Go', 'Title')).toBe('#b#cff5050f0Title#nb#nc\n  Go');
  });
});

describe('parseDialogText (CEditString::ParsingString, CWndDialog::ParsingString)', () => {
  it('reads the colour, bold, underline and strike codes', () => {
    expect(parseDialogText('#cff00ff00Hi#nc #bthere#nb #ux#nu #sy#ns')).toEqual([
      run('Hi', { color: 0xff00ff00 }), run(' '), run('there', { bold: true }), run(' '), run('x', { underline: true }),
      run(' '), run('y', { strike: true }),
    ]);
  });

  it('drops the codepage codes and keeps any other # code as it is', () => {
    expect(parseDialogText('#l0949a#nl#zb')).toEqual([run('a#zb')]);
  });

  it('a link shows its word in bold and sends its key', () => {
    expect(parseDialogText('[Yes][Yes_Enter] / [No][No_Enter]')).toEqual([
      run('Yes', { bold: true, link: 'Yes_Enter' }), run(' / '), run('No', { bold: true, link: 'No_Enter' }),
    ]);
  });

  it('an empty key sends the word', () => {
    expect(parseDialogText('[For Honor][]')).toEqual([run('For Honor', { bold: true, link: 'For Honor' })]);
  });

  it('an unclosed bracket stays text', () => {
    expect(parseDialogText('a [b')).toEqual([run('a [b')]);
  });

  it('markup characters stay text', () => {
    expect(parseDialogText('<b>x</b> &amp;')).toEqual([run('<b>x</b> &amp;')]);
  });

  it('a literal \\n is a new line, and a link keeps the colour around it', () => {
    expect(parseDialogText('#cff0000ffa\\n[b][k]')).toEqual([
      run('a\n', { color: 0xff0000ff }), run('b', { color: 0xff0000ff, bold: true, link: 'k' }),
    ]);
  });
});
