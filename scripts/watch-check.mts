// Разовая проверка: сгенерировать скрипт наблюдателя, запустить его
// и убедиться, что DLL-кэш работает и события приходят.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { observerScript } from '../src/main/gameFocus.js';

const dir = join(process.env.TEMP ?? '.', 'opencode', 'watch-check');
mkdirSync(dir, { recursive: true });
const dll = join(dir, 'focus-watcher.dll');

const script = observerScript(dll);
const ps1 = join(dir, 'watch.ps1');
writeFileSync(ps1, script.replace(/\r?\n/g, '\r\n'), 'utf8');

function run(tag: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const p = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ps1],
      { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true },
    );
    const lines: string[] = [];
    let buf = '';
    const t = setTimeout(() => {
      p.kill();
      reject(new Error(`${tag}: нет ответа за 20с`));
    }, 20_000);
    p.stdout.setEncoding('utf8');
    p.stdout.on('data', (c: string) => {
      buf += c;
      for (;;) {
        const nl = buf.indexOf('\n');
        if (nl < 0) break;
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (line) {
          lines.push(line);
          if (lines.length >= 2) {
            clearTimeout(t);
            p.kill();
            resolve(lines);
          }
        }
      }
    });
    p.on('exit', (code) => {
      clearTimeout(t);
      reject(new Error(`${tag}: процесс умер (code=${code}), строк: ${lines.length}`));
    });
  });
}

const t0 = Date.now();
const first = await run('первый запуск (компиляция DLL)');
const t1 = Date.now();
const second = await run('второй запуск (кэш DLL)');
const t2 = Date.now();
console.log('первый:', first.join(','), `${t1 - t0}мс`);
console.log('второй:', second.join(','), `${t2 - t1}мс`);
if (!first.includes('game-open') && !first.includes('game-closed')) throw new Error('нет события присутствия игры');
if (!second.includes('game-open') && !second.includes('game-closed')) throw new Error('нет события на кэше');
console.log('OK');
