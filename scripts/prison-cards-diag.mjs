// Диагностика ряда карточек на кадре: центры, номер двери, иконка-класс.
//   node --import tsx scripts/prison-cards-diag.mjs <кадр.png>
import { readFileSync } from 'node:fs';

import { decodePng } from '../src/core/prison/recognize/png.ts';
import { calibrate } from '../src/core/prison/recognize/geometry.ts';
import { screensTemplate } from '../src/core/prison/recognize/templates.ts';
import { digitsTemplate } from '../src/core/prison/recognize/templates.ts';
import { cardCenters, classifyCard, readDoorNumber } from '../src/core/prison/recognize/cards.ts';
import { readHeader, readWarden, isChain } from '../src/core/prison/recognize/board.ts';
import { glyphs } from '../src/core/prison/recognize/text.ts';

const file = process.argv[2];
const frame = decodePng(new Uint8Array(readFileSync(file)));
const geo = calibrate(frame);
if (!geo) {
  console.log('геометрия не найдена');
  process.exit(0);
}
const t = { screens: screensTemplate(), digits: digitsTemplate() };
console.log(`кадр ${frame.width}×${frame.height}, цепочка: ${isChain(frame, geo)}`);
const h = readHeader(frame, geo, t.screens);
console.log('header:', h);
console.log('warden:', readWarden(frame, geo));
const centers = cardCenters(frame, geo);
console.log('cardCenters:', JSON.stringify(centers));
for (const cx of centers) {
  const cls = classifyCard(frame, geo, cx, t.screens.cards);
  const door = readDoorNumber(frame, geo, cx, t.digits);
  console.log(`  cx=${cx}: icon=${cls.label}:${cls.score.toFixed(3)} doorNumber=${door}`);
  // проба чтения цифр на хвостовых знаках подписи
  const { readDigit } = await import('../src/core/prison/recognize/text.ts');
  const all = glyphs(frame, geo, [cx - 160, 862, cx + 160, 904], { contrast: 70, maxSat: 0.3, faint: true }).filter(
    (g) => g.y1 - g.y0 >= 8 * geo.s && g.x1 - g.x0 >= 2 * geo.s,
  );
  for (const g of all.slice(-4)) {
    const r = readDigit(frame, g, t.digits, 0);
    console.log(`    хвост x${Math.round(g.x0 / geo.s)} h${Math.round((g.y1 - g.y0) / geo.s)}: цифра ${r.d} score ${r.score.toFixed(3)}`);
  }
  // глифы подписи: x0..x1, ширина, зазор от предыдущего, y1 (низ)
  let prev = null;
  const parts = [];
  for (const g of all) {
    const gap = prev === null ? 0 : Math.round((g.x0 - prev) / geo.s);
    parts.push(`${Math.round(g.x0 / geo.s)}..${Math.round(g.x1 / geo.s)}(h${Math.round((g.y1 - g.y0) / geo.s)},gap${gap})`);
    prev = g.x1;
  }
  console.log(`    глифы (${all.length}): ${parts.join(' ')}`);
}
if (!centers.length) {
  // полная полоса подписей: группы и их длины
  const { titleGroups } = await import('../src/core/prison/recognize/cards.ts');
  const gs = glyphs(frame, geo, [440, 862, 1480, 904], { contrast: 70, maxSat: 0.6, faint: true }).filter(
    (g) => g.y1 - g.y0 >= 8 * geo.s && g.x1 - g.x0 >= 2 * geo.s,
  );
  const groups = titleGroups(frame, geo);
  console.log(`  полоса: знаков ${gs.length}, групп ${groups.length}`);
  for (const gr of groups) {
    console.log(`    группа: ${gr.length} знаков, x ${Math.round(gr[0].x0 / geo.s)}..${Math.round(gr[gr.length - 1].x1 / geo.s)}, высоты ${gr.map((g) => Math.round((g.y1 - g.y0) / geo.s)).join(',')}`);
  }
  if (!groups.length) {
    for (const g of gs) {
      console.log(`    знак x${Math.round(g.x0 / geo.s)}..${Math.round(g.x1 / geo.s)} h${Math.round((g.y1 - g.y0) / geo.s)} y1${Math.round(g.y1 / geo.s)}`);
    }
  }
  // возможно подписи не сгруппировались — попробовать каждую раскладку слотов
  for (const n of [1, 2, 3, 4]) {
    const slots = { 1: [959], 2: [787, 1132], 3: [614, 959, 1304], 4: [442, 787, 1133, 1478] }[n];
    console.log(`  слоты-${n}:`);
    for (const cx of slots) {
      const cls = classifyCard(frame, geo, cx, t.screens.cards);
      const door = readDoorNumber(frame, geo, cx, t.digits);
      console.log(`    cx=${cx}: icon=${cls.label}:${cls.score.toFixed(3)} doorNumber=${door}`);
    }
  }
}
