// Вырезать три карты выбора орудий из кадра в отдельные PNG.
//   node --import tsx scripts/prison-pick-crop.mjs <кадр.png> <папка-выхода>
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { decodePng, encodePng } from '../src/core/prison/recognize/png.ts';

const file = process.argv[2];
const outDir = process.argv[3] ?? '.';
const frame = decodePng(new Uint8Array(readFileSync(file)));
// Из readPick на этом кадре: boxes карт в пикселях кадра.
const BOXES = [
  [249, 182, 705, 869],
  [729, 182, 1185, 869],
  [1209, 182, 1665, 869],
];

mkdirSync(outDir, { recursive: true });
BOXES.forEach((b, i) => {
  const [x0, y0, x1, y1] = b;
  const w = x1 - x0;
  const h = y1 - y0;
  const crop = { width: w, height: h, data: new Uint8Array(w * h * 4) };
  const src = frame.data;
  const dst = crop.data;
  for (let y = 0; y < h; y++) {
    const s = ((y0 + y) * frame.width + x0) * 4;
    dst.set(src.subarray(s, s + w * 4), y * w * 4);
  }
  const png = encodePng(crop);
  const p = `${outDir}/card-${i}.png`;
  writeFileSync(p, png);
  console.log(p, `${w}×${h}`);
});
