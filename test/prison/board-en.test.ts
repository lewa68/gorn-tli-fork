/**
 * Доска на английском клиенте: двери и ряд решений.
 *
 * Заголовок над карточками и подписи карточек — текстовые эталоны с
 * русского клиента. На английском заголовок ложно читался как «ratway»,
 * номера дверей отбраковывались фильтром высоты букв, а подпись «End Day»
 * не собиралась в группу. Кадры — реальные снимки 10.11 (1920×1080).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { decodePng } from '../../src/core/prison/recognize/png.js';
import { read } from '../../src/core/prison/recognize/index.js';

function frame(name: string) {
  return decodePng(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', name)));
}

describe('доска на английском клиенте', () => {
  it('экран дверей: номера читаются, карточки-двери найдены, не «ratway»', () => {
    const { view } = read(frame('doors-en-1920.png'), null);
    expect(view.screen).toBe('board');
    if (view.screen !== 'board') return;
    expect(view.board.decision).toBeNull();
    expect(view.board.doors).toEqual([7, 9, 10]);
    expect(view.board.at.doorCards).toHaveLength(3);
  });

  it('ряд решений (Заменить / Завершить) узнаётся по иконкам, рамки на карточках', () => {
    const { view } = read(frame('manage-en-1920.png'), null);
    expect(view.screen).toBe('board');
    if (view.screen !== 'board') return;
    expect(view.board.decision).toEqual({ kind: 'manage', consume: false, replace: true, end: true });
    expect(view.board.at.decisionKinds).toEqual(['replace', 'end']);
    expect(view.board.at.decisionCards).toHaveLength(2);
  });
});
