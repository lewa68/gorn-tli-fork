// Разовая проверка наблюдателя фокуса v2: DLL-кэш, события focus/blur,
// и сколько CPU он ест в спокойном режиме.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { observerScript } from '../src/main/gameFocus.js';

const dir = join(process.env.TEMP ?? '.', 'opencode', 'watch-check2');
mkdirSync(dir, { recursive: true });
const dll = join(dir, 'focus-watcher-v2.dll');
const ps1 = join(dir, 'watch.ps1');

const script = observerScript(dll);
// eslint-disable-next-line node/no-unsupported-features/node-builtins
await import('node:fs').then(({ writeFileSync }) =>
  writeFileSync(ps1, script.replace(/\r?\n/g, '\r\n'), 'utf8'),
);

function run(): Promise<{ lines: string[]; cpuSec: number; ms: number }> {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const p = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ps1],
      { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true },
    );
    const lines: string[] = [];
    let buf = '';
    const fail = setTimeout(() => {
      p.kill();
      reject(new Error('нет ответа за 25с'));
    }, 25_000);
    p.stdout.setEncoding('utf8');
    p.stdout.on('data', (c: string) => {
      buf += c;
      for (;;) {
        const nl = buf.indexOf('\n');
        if (nl < 0) break;
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (line) lines.push(line);
      }
    });
    p.on('exit', (code) => {
      clearTimeout(fail);
      reject(new Error(`процесс умер code=${code}`));
    });
    // Даём поработать 12 секунд, смотрим события и CPU процесса.
    setTimeout(async () => {
      const { execFile } = await import('node:child_process');
      execFile(
        'powershell.exe',
        ['-NoProfile', '-Command', `(Get-Process -Id ${p.pid}).CPU`],
        (err: unknown, stdout: string) => {
          clearTimeout(fail);
          const cpuSec = err ? -1 : Number(String(stdout).trim() || -1);
          p.kill();
          resolve({ lines, cpuSec, ms: Date.now() - t0 });
        },
      );
    }, 12_000);
  });
}

const r = await run();
console.log(`события: ${r.lines.join(',') || '(нет)'}`);
console.log(`работал ${r.ms}мс, CPU процесса: ${r.cpuSec}с`);
if (r.lines.length === 0) throw new Error('наблюдатель молчит — нет ни focus, ни blur');
console.log('OK');
