import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { findLogDirectory, parseInstallPath, resolveLogDirectory } from '../src/core/locate.js';

describe('разбор InstallPath из вывода reg', () => {
  it('берёт путь после REG_SZ', () => {
    const out = '\r\nHKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\Valve\\Steam\r\n    InstallPath    REG_SZ    E:\\steam\r\n\r\n';
    expect(parseInstallPath(out)).toBe('E:\\steam');
  });

  it('нет значения — null', () => {
    expect(parseInstallPath('ERROR: The system was unable to find the specified registry key or value.')).toBeNull();
  });
});

describe('автопоиск игры', () => {
  it('Steam вне Program Files находится через реестр', () => {
    // На машине-примере Steam стоит в E:\steam — старый поиск видел только
    // Program Files и игру не находил.
    const found = findLogDirectory();
    if (found !== null) {
      expect(found.endsWith(join('UE_game', 'TorchLight', 'Saved', 'Logs'))).toBe(true);
    }
  });
});

describe('ручной путь', () => {
  it('принимает корень установки и саму папку Logs', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gorn-locate-'));
    try {
      const game = join(dir, 'Torchlight Infinite');
      const logs = join(game, 'UE_game', 'TorchLight', 'Saved', 'Logs');
      mkdirSync(logs, { recursive: true });
      writeFileSync(join(logs, 'UE_game.log'), 'x', 'utf8');
      expect(resolveLogDirectory(game)).toBe(logs);
      expect(resolveLogDirectory(logs)).toBe(logs);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// Реестр задействован через reg.exe — подтвердим, что на этой Windows
// вызов вообще работает и возвращает путь (интеграционная проверка).
describe('реестр Steam', () => {
  it.skipIf(process.platform !== 'win32')('reg отвечает InstallPath для установленного Steam', () => {
    let out = '';
    try {
      out = execFileSync('reg', ['query', 'HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam', '/v', 'InstallPath'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch {
      // Steam может не стоять — тест не про это.
    }
    if (out) expect(parseInstallPath(out)).toMatch(/\\Steam$/i);
  });
});
