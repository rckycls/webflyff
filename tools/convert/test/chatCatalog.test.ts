// 2026-11-09: the chat's catalog, data/chat.json: Filter_ENG.inc as CProject::LoadFilter reads it (Project.cpp:1108-1146,
// __FILTER_0705) and Client/help.inc with help.txt.txt as CProject::LoadHelp reads it (Project.cpp:1072-1094).
import { describe, expect, it } from 'vitest';
import { readFilter, readHelp, readStringTable } from '../src/data/chatCatalog';

describe('readFilter', () => {
  it('keeps a word of letters in lower case, and any other entry as it is, with its replacement', () => {
    const filter = readFilter('// a comment\r\nasshole\t"*****"\r\nASSHOLE\t"*****"\r\n"putang ina"\t"*****"\r\nf.u\t"***"\r\n');
    expect(filter).toEqual({ alpha: { asshole: '*****' }, nonAlpha: { 'putang ina': '*****', 'f.u': '***' } });
  });
});

describe('readHelp', () => {
  it('maps each keyword to its paragraphs, three spaces in and a blank line after each', () => {
    const strings = readStringTable('IDS_H_0\tChatting window\r\nIDS_H_1\tIt is above the task bar.\r\nIDS_H_2\tDrag the balloon.\r\n');
    const help = readHelp('//x\r\n/* IDS_H_9 */\r\nIDS_H_0\r\n{\r\n\tIDS_H_1\r\n\r\n\tIDS_H_2\r\n}\r\n', strings);
    expect(help).toEqual({ 'Chatting window': '   It is above the task bar.\n\n   Drag the balloon.\n\n   ' });
  });
});
