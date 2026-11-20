// custom (owner 2026-11-20): a page for scripts/renderJobPortraits.ts only (`/e2e/jobPortraitHarness.html?job=&sex=` on
// the dev server; `vite build` does not ship it). It draws one character as the Select Character window draws its slot
// (lobby/lobbyPortraits.ts `selectPortraits`: the slot's camera, standing), dressed in the job's job-change reward set and
// weapon (the owner's custom rewards in Resource/propQuest.inc, docs/2026-11-17-job-change-rewards-deploy.md of the outer
// repo), with the first face and hair of character creation. After 30 frames it marks the page ready for the script.

import { newCharacterSummary, selectPortraits } from '../src/lobby/lobbyPortraits';

/** The set (helmet, suit, gauntlets, boots) by sex, then what the job holds, as item ids (`Resource/defineItem.h`). */
const GEAR: ReadonlyMap<number, { male: number[]; female: number[]; held: number[] }> = new Map([
  // first jobs: the Lv15 green sets (`*_SET_01`) and their weapons (QUEST_VOC*_TRN3)
  [1, { male: [18004, 18005, 18006, 18007], female: [18000, 18001, 18002, 18003], held: [22002, 7001] }], // Shining Sword, Battle Shield
  [2, { male: [18012, 18013, 18014, 18015], female: [18008, 18009, 18010, 18011], held: [22014] }], // Bow of Accuracy
  [3, { male: [18020, 18021, 18022, 18023], female: [18016, 18017, 18018, 18019], held: [22017, 7001] }], // Flarine Stick
  [4, { male: [18028, 18029, 18030, 18031], female: [18024, 18025, 18026, 18027], held: [22020, 7001] }], // Lightened Wand
  // second jobs: the Lv60 sets (`*_SET_04` to `_07`) and the Guardian weapons (QUEST_HERO*_TRN5)
  [6, { male: [22066, 22067, 22068, 22069], female: [22070, 22071, 22072, 22073], held: [22030] }], // Guardian Big Sword
  [7, { male: [22066, 22067, 22068, 22069], female: [22070, 22071, 22072, 22073], held: [22026, 22026] }], // Guardian Sword x2
  [8, { male: [22074, 22075, 22076, 22077], female: [22078, 22079, 22080, 22081], held: [22054] }], // Guardian Yo-Yo
  [9, { male: [22074, 22075, 22076, 22077], female: [22078, 22079, 22080, 22081], held: [22050] }], // Guardian Bow
  [10, { male: [22082, 22083, 22084, 22085], female: [22086, 22087, 22088, 22089], held: [22046] }], // Guardian Stick
  [11, { male: [22082, 22083, 22084, 22085], female: [22086, 22087, 22088, 22089], held: [22042, 7005] }], // Guardian Knuckle, Ancient Shield
  [12, { male: [22090, 22091, 22092, 22093], female: [22094, 22095, 22096, 22097], held: [22058, 7005] }], // Guardian Wand
  [13, { male: [22090, 22091, 22092, 22093], female: [22094, 22095, 22096, 22097], held: [22062] }], // Guardian Staff
]);

const params = new URLSearchParams(location.search);
const job = Number(params.get('job'));
const sex = Number(params.get('sex')) === 1 ? 1 : 0;
const gear = GEAR.get(job);
if (gear === undefined) throw new Error(`jobPortraitHarness: no gear for job ${job}`);

const summary = newCharacterSummary({ sex, hairMesh: 0, headMesh: 0 });
summary.job = job;
summary.level = 60;
summary.equipment = [...(sex === 1 ? gear.female : gear.male), ...gear.held];

const box = document.querySelector<HTMLElement>('#app')!;
void selectPortraits(box, [summary], () => 0);

let frames = 0;
const wait = (): void => {
  const canvas = box.querySelector('canvas');
  if (canvas !== null && canvas.width > 0) frames++;
  if (frames >= 30) document.body.dataset.ready = '1';
  else requestAnimationFrame(wait);
};
requestAnimationFrame(wait);
