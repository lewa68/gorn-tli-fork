// Диагностика экрана выбора орудий на сохранённом кадре:
// по каждой карте — лучшие совпадения картинки и названия с оценками.
//
//   node --import tsx scripts/prison-pick-diag.mjs <кадр.png>
import { readFileSync } from 'node:fs';

import { decodePng } from '../src/core/prison/recognize/png.ts';
import { defaultGeometry } from '../src/core/prison/recognize/geometry.ts';
import { scoresByLabel, screensTemplate } from '../src/core/prison/recognize/templates.ts';
import { PICK_CARDS, pickArt, pickTitle } from '../src/core/prison/recognize/layout.ts';
import { normalize, sample } from '../src/core/prison/recognize/sample.ts';
import { pickHeader, readPick } from '../src/core/prison/recognize/pick.ts';

const CARD_DY = [0, -6, -3, -9, 3];
const shift = (b, dx, dy) => [b[0] + dx, b[1] + dy, b[2] + dx, b[3] + dy];

const file = process.argv[2];
if (!file) {
  console.error('путь к PNG: node --import tsx scripts/prison-pick-diag.mjs <кадр.png>');
  process.exit(1);
}
const frame = decodePng(new Uint8Array(readFileSync(file)));
const geo = defaultGeometry(frame);
const t = screensTemplate();
console.log(`кадр ${frame.width}×${frame.height}`);
console.log('заголовок:', pickHeader(frame, geo, t));
console.log('readPick:', JSON.stringify(readPick(frame, geo, t, 'start')));

const artBuf = new Float32Array(16 * 16 * 3);
const titleBuf = new Float32Array(86 * 11);
const top = (m, n = 3) =>
  [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([l, s]) => `${l}:${s.toFixed(3)}`).join(', ');

PICK_CARDS.forEach((cx, i) => {
  let artScores = new Map();
  let bestArt = -2;
  let hit = { dx: 0, dy: 0 };
  let titleScores = new Map();
  let bestTitle = -2;
  for (const dy of CARD_DY) {
    for (let dx = -12; dx <= 12; dx += 6) {
      sample(frame, geo, shift(pickArt(cx), dx, dy), 16, 16, 3, artBuf);
      normalize(artBuf);
      const s = scoresByLabel(artBuf, t.pickArt);
      const m = Math.max(...s.values());
      if (m > bestArt) {
        bestArt = m;
        artScores = s;
        hit = { dx, dy };
      }
    }
    sample(frame, geo, shift(pickTitle(cx), 0, dy), 86, 11, 1, titleBuf);
    normalize(titleBuf);
    const s = scoresByLabel(titleBuf, t.pickTitles);
    const m = Math.max(...s.values());
    if (m > bestTitle) {
      bestTitle = m;
      titleScores = s;
    }
  }
  console.log(`карта ${i}: art ${bestArt.toFixed(3)} (сдвиг dx=${hit.dx}, dy=${hit.dy}) → ${top(artScores)}`);
  console.log(`        title ${bestTitle.toFixed(3)} → ${top(titleScores)}`);
});
