/**
 * Ряд карточек под доской: двери («Пойти в №N», «Пойти в допросную») и
 * решения (Пожирание / Заменить / Завершить, в допросной — Подстрекнуть /
 * Наградить). Карточки ищутся по подписям: подпись каждой карточки стоит
 * по её центру, между подписями — широкий промежуток.
 */
import type { Box } from './sample.js';
import { dot, normalize, sample } from './sample.js';
import type { DigitSet, Glyph } from './text.js';
import { glyphs, readDigit } from './text.js';
import type { Frame, Geometry } from './types.js';

/** Полоса подписей карточек (опорные px). */
export const CARD_TITLE: Box = [440, 862, 1480, 904];
/** Высота карточки: от верхней кромки до нижней. */
export const CARD_Y0 = 748;
export const CARD_Y1 = 926;
export const CARD_HALF_W = 166;
/**
 * Центры карточек при 4, 3, 2 и 1 карточке. Четыре — ряд решений с
 * «Выслеживанием» (Окровавленный капкан): шаг тот же, 345 опорных px.
 */
export const SLOTS: Record<number, number[]> = { 4: [442, 787, 1133, 1478], 3: [614, 959, 1304], 2: [787, 1132], 1: [959] };

export function cardBox(cx: number): Box {
  return [cx - CARD_HALF_W, CARD_Y0, cx + CARD_HALF_W, CARD_Y1];
}

/** Подписи карточек: группы знаков, разделённые промежутком шире 40 опорных px. */
export function titleGroups(frame: Frame, geo: Geometry): Glyph[][] {
  const gs = glyphs(frame, geo, CARD_TITLE, { contrast: 70, maxSat: 0.6, faint: true }).filter(
    (g) => g.y1 - g.y0 >= 8 * geo.s && g.x1 - g.x0 >= 2 * geo.s,
  );
  const groups: Glyph[][] = [];
  for (const g of gs) {
    const last = groups[groups.length - 1];
    if (last && g.x0 - last[last.length - 1]!.x1 < 40 * geo.s) last.push(g);
    else groups.push([g]);
  }
  // Подпись — хотя бы 5 знаков (короче — блики свечей, курсор).
  return groups.filter((gr) => gr.length >= 5);
}

/** Центры карточек (опорные px) по подписям; пусто — карточек нет. */
export function cardCenters(frame: Frame, geo: Geometry): number[] {
  const groups = titleGroups(frame, geo);
  if (groups.length === 0 || groups.length > 4) return [];
  const centers = groups.map((gr) => ((gr[0]!.x0 + gr[gr.length - 1]!.x1) / 2 - geo.tx) / geo.s);
  const slots = SLOTS[groups.length]!;
  // Подписи должны стоять у центров своей раскладки.
  for (let i = 0; i < slots.length; i++) if (Math.abs(centers[i]! - slots[i]!) > 60) return [];
  return slots;
}

/**
 * Номер камеры на карточке двери: 1–16, 0 — допросная. null — подпись не
 * читается. Цифры — знаки в конце подписи выше строчных букв, стоящие на
 * строке; «№» перед ними стоит выше строки и цифрой не читается.
 */
export function readDoorNumber(frame: Frame, geo: Geometry, cx: number, digits: DigitSet): number | null {
  const all = glyphs(frame, geo, [cx - 160, CARD_TITLE[1], cx + 160, CARD_TITLE[3]], { contrast: 70, maxSat: 0.3, faint: true }).filter(
    (g) => g.y1 - g.y0 >= 8 * geo.s && g.x1 - g.x0 >= 2 * geo.s,
  );
  // Подпись — самая длинная цепочка знаков без широких промежутков; курсор
  // и блики свечей стоят отдельно.
  let gs: Glyph[] = [];
  let run: Glyph[] = [];
  for (const g of all) {
    const last = run[run.length - 1];
    if (last && g.x0 - last.x1 > 14 * geo.s) run = [];
    run.push(g);
    if (run.length > gs.length) gs = run;
  }
  if (gs.length < 5) return null;
  const bottoms = gs.map((g) => g.y1).sort((a, b) => a - b);
  const base = bottoms[bottoms.length >> 1]!;
  // Высота строчных букв — нижняя четверть знаков на строке; цифры заметно выше.
  // Английские строчные выше русских (15 против ~12 опорных px при цифрах 18),
  // поэтому множитель 1,25 отбраковывал и цифры: «Go to Cell 5» не читался,
  // двери оставались пустыми (кадры 10.11, англ. клиент). 1,15 отсекает
  // строчные (15 < 17,25) и пропускает цифры (18 ≥ 17,25); «а»-как-«0»
  // (0,46 при пороге 0,4) по-прежнему не проходит по высоте.
  const heights = gs
    .filter((g) => Math.abs(g.y1 - base) <= 2 * geo.s)
    .map((g) => g.y1 - g.y0)
    .sort((a, b) => a - b);
  const xh = heights[heights.length >> 2] ?? 0;
  let n = '';
  for (let i = gs.length - 1; i >= 0; i--) {
    const g = gs[i]!;
    if (Math.abs(g.y1 - base) > 2 * geo.s || g.y1 - g.y0 < 1.15 * xh) break;
    // Порог ниже, чем у дней: цифры номера мельче, а высокий знак на
    // строке в конце подписи — уже почти наверняка цифра.
    const r = readDigit(frame, g, digits, 0.4);
    if (r.d < 0) break;
    n = String(r.d) + n;
  }
  // «Пойти в допросную» — длинная подпись без цифр; короткая без цифр не прочитана.
  if (n === '') return gs.length >= 13 ? 0 : null;
  const v = Number(n);
  return v >= 2 && v <= 16 ? v : null;
}

const iconBuf = new Float32Array(12 * 12 * 3);

/**
 * Ряд карточек решений по иконкам, без подписей: раскладка (2, 3, 4 или 1
 * карточка), в которой КАЖДЫЙ слот уверенно узнаётся как карточка решения.
 * Подписи зависят от языка клиента (эталоны русские, «End Day» на
 * английском не собирается в группу) — иконки же одинаковы у всех (кадры
 * 10.11: Replace и End по 0,999). null — ряда решений нет.
 */
export function iconRow(
  frame: Frame,
  geo: Geometry,
  protos: { label: string; v: Float32Array }[],
  min = CARD_ROW_MIN,
): { slots: number[]; kinds: string[] } | null {
  for (const n of [4, 3, 2, 1]) {
    const slots = SLOTS[n]!;
    const kinds: string[] = [];
    let ok = true;
    for (const cx of slots) {
      const r = classifyCard(frame, geo, cx, protos);
      if (r.score < min) {
        ok = false;
        break;
      }
      kinds.push(r.label);
    }
    if (ok) return { slots, kinds };
  }
  return null;
}

/** Порог узнавания иконки карточки в ряду решений (0,999 у верных, ≤0,58 у прочего). */
export const CARD_ROW_MIN = 0.6;

/** Значок карточки решения → класс по прототипам. */
export function classifyCard(
  frame: Frame,
  geo: Geometry,
  cx: number,
  protos: { label: string; v: Float32Array }[],
): { label: string; score: number } {
  sample(frame, geo, [cx - 48, 770, cx + 48, 866], 12, 12, 3, iconBuf);
  normalize(iconBuf);
  let label = '';
  let score = -2;
  for (const p of protos) {
    const s = dot(iconBuf, p.v);
    if (s > score) {
      score = s;
      label = p.label;
    }
  }
  return { label, score };
}

export function cardIconVec(frame: Frame, geo: Geometry, cx: number): Float32Array {
  const v = sample(frame, geo, [cx - 48, 770, cx + 48, 866], 12, 12, 3);
  normalize(v);
  return v;
}
