// Диагностика кадра доски: что распознаватель увидел (двери, ряд решений,
// цепочка, геометрия) — без памяти забега и солвера.
//   node --import tsx scripts/prison-board-diag.mjs <кадр.png>
import { readFileSync } from 'node:fs';

import { decodePng } from '../src/core/prison/recognize/png.ts';
import { read } from '../src/core/prison/recognize/index.ts';

const file = process.argv[2];
if (!file) {
  console.error('путь к PNG: node --import tsx scripts/prison-board-diag.mjs <кадр.png>');
  process.exit(1);
}
const frame = decodePng(new Uint8Array(readFileSync(file)));
const { view, geo } = read(frame, null);
console.log(`кадр ${frame.width}×${frame.height}, экран: ${view.screen}`);
if (geo) console.log('геометрия найдена:', geo.width + '×' + geo.height);
if (view.screen !== 'board') process.exit(0);
const b = view.board;
const short = (c) => ({ kind: c.kind, beast: c.beast ?? null, tier: c.tier ?? null, event: !!c.event, nest: !!c.nest, jaws: !!c.jaws, prey: !!c.prey, shownTier: c.shownTier ?? null, tierUnknown: !!c.tierUnknown });
console.log('warden:', b.warden, 'daysLeft:', b.daysLeft, 'chromatic:', b.chromatic, 'objective:', b.objective);
console.log('doors:', JSON.stringify(b.doors));
console.log('decision:', JSON.stringify(b.decision));
console.log('chain:', JSON.stringify(b.chain));
console.log('tools:', JSON.stringify(b.tools));
console.log('at.doorCards:', JSON.stringify(b.at.doorCards));
console.log('at.decisionCards:', JSON.stringify(b.at.decisionCards));
console.log('at.decisionKinds:', JSON.stringify(b.at.decisionKinds ?? null));
console.log('at.cancel:', JSON.stringify(b.at.cancel));
console.log('cells:');
b.cells.forEach((c, i) => console.log(`  ${String(i).padStart(2)}: ${JSON.stringify(short(c))}`));
