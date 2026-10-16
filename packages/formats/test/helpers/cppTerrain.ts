import { tokenize } from '../../src/index';

/**
 * A token-for-token port of CTerrainMng::LoadScript (Source/_Common/TerrainMng.cpp:75-201), kept only as an
 * independent reading of Terrain.inc for the corpus test: same variables, same SetMark / GoMark look-ahead, and
 * CScanner::GetNumber's atoi, so a name or a brace reads as 0. `readTerrainIndex` reads the layout by its shape
 * instead; the test checks that the two agree on the real file.
 *
 * Keeps what the C++ keeps in m_aTerrain (id, file, block flag, sound file) and the water bookkeeping
 * (m_nWaterFrame, and the ids of each water list).
 */
export function cppLoadTerrainScript(text: string): {
  terrain: Map<number, { file: string; block: number; sound: string }>;
  waterFrame: number;
  waterLists: number[][];
} {
  const tokens = tokenize(text);
  let pos = 0;
  let markPos = 0;
  let token = ''; // scanner.token
  let finished = false; // scanner.tok == FINISHED

  const getToken = (): string => {
    const t = tokens[pos];
    finished = t === undefined;
    token = t === undefined ? '' : t.text;
    if (t !== undefined) pos++;
    return token;
  };
  const atoi = (s: string): number => {
    const m = /^[+-]?\d+/.exec(s);
    return m === null ? 0 : parseInt(m[0], 10);
  };
  const getNumber = (): number => atoi(getToken());
  const setMark = (): void => {
    markPos = pos;
  };
  const goMark = (): void => {
    pos = markPos;
  };

  const terrain = new Map<number, { file: string; block: number; sound: string }>();
  const waterLists: number[][] = [];
  let waterFrame = 0;
  let nBrace = 1;
  let imageCnt = 0;
  let idCnt = 0;

  setMark();
  let i = getNumber(); // folder or id
  let frameCnt = getNumber();
  if (nBrace === 1 && frameCnt !== 0) waterFrame = frameCnt;

  while (nBrace > 0) {
    if (token.startsWith('}') || finished) {
      nBrace--;
      if (nBrace > 0) {
        setMark();
        i = getNumber(); // folder or id
        frameCnt = getNumber();
        idCnt = 0;
        if (nBrace === 1 && frameCnt !== 0) {
          waterFrame = frameCnt;
          imageCnt = 0;
        } else if (nBrace === 2 && frameCnt !== 0) {
          waterLists[imageCnt++] = [];
        }
        continue;
      }
      if (nBrace === 0) continue;
    }

    getToken(); // { or filename
    if (token.startsWith('{')) {
      nBrace++;
      setMark();
      i = getNumber(); // id
      frameCnt = getNumber(); // count
      if (i === 0 && nBrace === 2 && frameCnt !== 0) waterLists[imageCnt++] = [];
      continue;
    }

    goMark();
    i = getNumber(); // id
    frameCnt = getNumber(); // count
    if (nBrace === 3) waterLists[imageCnt - 1][idCnt++] = i;

    const id = i;
    const file = getToken(); // texture file name
    const block = getNumber();
    const sound = getToken();
    terrain.set(id, { file, block, sound });
    setMark();
    i = getNumber();
  }

  return { terrain, waterFrame, waterLists };
}
