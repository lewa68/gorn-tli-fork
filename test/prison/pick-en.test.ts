/**
 * Выбор орудий на английском клиенте: картинки орудия языконезависимы, а
 * эталоны названий собраны с русского клиента — полоски текста не совпадают
 * ни с одним эталоном. Кадр — реальный снимок 10.11 16:40 (1920×1080):
 * до фикса все три карты браковались, совет «Не узнал карты выбора».
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { decodePng } from '../../src/core/prison/recognize/png.js';
import { defaultGeometry } from '../../src/core/prison/recognize/geometry.js';
import { screensTemplate } from '../../src/core/prison/recognize/templates.js';
import { pickHeader, readPick } from '../../src/core/prison/recognize/pick.js';

const frame = decodePng(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'pick-en-1920.png')));
const geo = defaultGeometry(frame);
const t = screensTemplate();

describe('выбор орудий на английском клиенте', () => {
  it('заголовок «start» узнаётся', () => {
    expect(pickHeader(frame, geo, t)).toBe('start');
  });

  it('карты узнаются по картинке без совпавшего названия', () => {
    expect(readPick(frame, geo, t, 'start').cards).toEqual(['whip', 'shackles', 'revenge']);
  });
});
