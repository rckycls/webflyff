import { ArReader } from '../ar/ArReader';
import { decodeText } from '../text';
import { clientPacket } from './packet';

export type ChatChannel = 'nearby' | 'whisper' | 'shout' | 'party' | 'guild';
export type ChatMessage =
  | { type: 'chat'; text: string }
  | { type: 'shout'; objectId: number; sender: string; text: string; color: number }
  | { type: 'whisper'; sender: string; recipient: string; text: string; fromId: number; toId: number; search: number }
  | { type: 'party' | 'guild' | 'system' | 'announcement'; sender: string; text: string; speakerId?: number }
  | { type: 'gmChat'; texts: string[] }
  | { type: 'chatReturn'; flag: number; text: string };

/** CDPClient::OnChat, OnShout, OnWhisper, OnReturnSay (DPClient.cpp). */
export const readChat = (r: ArReader): ChatMessage => ({ type: 'chat', text: r.string(1024) });
export const readShout = (r: ArReader): ChatMessage => ({ type: 'shout', objectId: r.u32(), sender: r.string(32), text: r.string(260), color: r.u32() });
export const readWhisper = (r: ArReader): Extract<ChatMessage, { type: 'whisper' }> => ({
  type: 'whisper', sender: r.string(32), recipient: r.string(32), text: r.string(260), fromId: r.u32(), toId: r.u32(), search: r.i32(),
});
export const readReturnSay = (r: ArReader): ChatMessage => ({ type: 'chatReturn', flag: r.i32(), text: r.string(260) });

const characters = new Map(Array.from({ length: 256 }, (_, byte) => [decodeText(Uint8Array.of(byte)), byte]));
/** Chat uses the server's code page. Do not alter the credential writer's stricter ASCII contract. */
export function chatBytes(text: string, max = 259): Uint8Array {
  if (!text.trim() || text.length > max || /[\x00-\x1f\x7f-\x9f]/.test(text)) throw new RangeError(`Enter 1–${max} printable characters.`);
  return Uint8Array.from(Array.from(text, (character) => {
    const byte = characters.get(character);
    if (byte === undefined) throw new RangeError('This character cannot be sent in the game text encoding.');
    return byte;
  }));
}
/** SendChat and TextCmd_whisper/shout: the world server routes the commands, never a private client protocol. */
export function encodeChat(channel: ChatChannel, text: string, target = ''): Uint8Array {
  chatBytes(text);
  if (channel === 'whisper' && !/^[^\s/"\\]{1,32}$/.test(target)) throw new RangeError('Enter a whisper recipient.');
  const command = channel === 'whisper' ? `/whisper ${target} ${text}` : channel === 'shout' ? `/shout ${text}` : channel === 'party' ? `/partychat ${text}` : channel === 'guild' ? `/GuildChat ${text}` : text;
  const bytes = chatBytes(command, 1023);
  return clientPacket(0xff0000).i32(bytes.length).bytes(bytes).toBytes();
}

/**
 * Native OnPartyChat, OnGuildChat and OnGMChat field order. Piece 7 M4: `OnPartyChat` reads the name into a
 * `MAX_PLAYER` (42) buffer and keeps the speaker's object id for its bubble (`DPClient.cpp:5846-5876`).
 */
export function readSocial(r: ArReader, type: 'party' | 'guild'): ChatMessage {
  const speakerId = r.u32();
  if (type === 'party') return { type, sender: r.string(42), text: r.string(260), speakerId };
  return { type, sender: r.string(32), text: r.string(1024) };
}
export function readGmSay(r: ArReader): ChatMessage {
  const sender = r.string(32); r.string(32);
  return { type: 'system', sender, text: r.string(260) };
}
export function readGmChat(r: ArReader): ChatMessage {
  const count = r.i32();
  if (count < 0 || count > 1024) throw new RangeError('Invalid GM message count.');
  return { type: 'gmChat', texts: Array.from({ length: count }, () => r.string(256)) };
}

export const readAnnouncement = (r: ArReader): ChatMessage => ({ type: 'announcement', sender: '', text: r.string(260) });
