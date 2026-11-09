import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';

/**
 * Слежение за окном игры: у кого сейчас фокус.
 *
 * Оверлей — always-on-top поверх всего; без этой привязки он висел и над
 * браузером, и над дискордом, пока игра просто запущена. Нужно показывать
 * его поверх игры — и прятать, когда игрок ушёл в другое окно.
 *
 * Electron не видит чужие окна, а нативные модули в проект не добавляются
 * (сборка останется чистой, тюрьма тоже обходится без них). Поэтому
 * резидентный PowerShell-процесс с крошечным C#-наблюдателем:
 * GetForegroundWindow → pid → имя процесса. Он пишет события в stdout,
 * main их читает. Процесс умер — перезапускается; при любой ошибке
 * наблюдение отключается и оверлей живёт как раньше (fail-open).
 */

/**
 * C#-наблюдатель. Пишает в stdout строки:
 *   focus / blur   — фокус у игры (или своих окон) / у чужих
 *   game-open / game-closed — игра появилась/исчезла в процессах
 * Только при смене состояния, не потоком. Имена процессов игры и Горна
 * захардкожены в C# ниже.
 */
const OBSERVER_CS = String.raw`
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
public class FocusWatcher {
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  static bool IsGame(string n) { return n == "torchlight_infinite"; }
  // Установленный Горн называется кириллицей (\u0433\u043e\u0440\u043d = «горн»).
  static bool IsSelf(string n) { return n == "\u0433\u043e\u0440\u043d" || n == "gorn" || n.StartsWith("electron"); }
  static bool GameRuns() {
    return Process.GetProcessesByName("torchlight_infinite").Length > 0;
  }
  // Add-Type не экспортирует метод Main (считает точкой входа), поэтому Run.
  public static void Run() {
    bool game = GameRuns();
    Console.Out.WriteLine(game ? "game-open" : "game-closed");
    Console.Out.Flush();
    string last = "";
    while (true) {
      IntPtr h = GetForegroundWindow();
      uint pid; GetWindowThreadProcessId(h, out pid);
      string name = "";
      try { name = Process.GetProcessById((int)pid).ProcessName.ToLowerInvariant(); } catch {}
      bool fg = IsGame(name) || IsSelf(name);
      string state = game && !fg ? "blur" : "focus";
      if (state != last) {
        Console.Out.WriteLine(state);
        Console.Out.Flush();
        last = state;
      }
      bool g = GameRuns();
      if (g != game) {
        game = g;
        Console.Out.WriteLine(game ? "game-open" : "game-closed");
        Console.Out.Flush();
      }
      System.Threading.Thread.Sleep(400);
    }
  }
}
`;

/**
 * Скрипт наблюдателя. C# компилируется в DLL в userData и переиспользуется:
 * Add-Type при каждом старте поднимал csc.exe — на старте приложения это
 * всплеск CPU и внимания антивируса, из-за которого перезапуск Горна
 * подтормаживал систему. Компиляция теперь редкость: один раз на установку,
 * DLL переживает обновления приложения.
 */
export function observerScript(dllPath: string): string {
  const dll = dllPath.replace(/'/g, "''");
  return `
$dll = '${dll}'
$src = @'
${OBSERVER_CS}
'@
if (-not (Test-Path -LiteralPath $dll)) {
  Add-Type -TypeDefinition $src -OutputAssembly $dll -Language CSharp | Out-Null
}
try { [Reflection.Assembly]::LoadFrom($dll) | Out-Null }
catch {
  # Битая DLL (например, запись оборвалась) — перекомпилировать и забыть.
  Remove-Item -LiteralPath $dll -Force -ErrorAction SilentlyContinue
  Add-Type -TypeDefinition $src -OutputAssembly $dll -Language CSharp | Out-Null
  [Reflection.Assembly]::LoadFrom($dll) | Out-Null
}
[FocusWatcher]::Run()
`;
}

function encodedCommand(script: string): string {
  return Buffer.from(script, 'utf16le').toString('base64');
}

export class GameFocusWatcher {
  /** Куда складывается кэш наблюдателя (компилированная DLL). */
  constructor(private readonly userData: string) {}
  private proc: ChildProcess | null = null;
  private stopped = false;
  private buffer = '';
  /** Разворачивание после падения процесса — с паузой, чтобы не крутилось колесо ошибок. */
  private restartTimer: NodeJS.Timeout | null = null;

  /** Смена фокуса: true — игра (или окно Горна) активна, false — чужое окно. */
  onFocus: ((gameFocused: boolean) => void) | null = null;
  /** Игра запустилась/закрылась. */
  onGamePresence: ((running: boolean) => void) | null = null;

  start(): void {
    if (process.platform !== 'win32' || this.stopped) return;
    this.spawnWatcher();
  }

  stop(): void {
    this.stopped = true;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = null;
    this.proc?.kill();
    this.proc = null;
  }

  private spawnWatcher(): void {
    if (this.stopped) return;
    this.buffer = '';
    try {
      this.proc = spawn(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-EncodedCommand',
          encodedCommand(observerScript(join(this.userData, 'focus-watcher.dll'))),
        ],
        { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true },
      );
    } catch {
      this.proc = null;
      // PowerShell недоступен — оверлей живёт как раньше, без привязки.
      return;
    }
    const proc = this.proc;
    proc.stdout?.setEncoding('ascii');
    proc.stdout?.on('data', (chunk: string) => this.consume(chunk));
    proc.on('exit', () => {
      if (this.stopped || proc !== this.proc) return;
      // Падение — не повод лишать оверлей привязки навсегда: вернёмся.
      this.restartTimer = setTimeout(() => {
        if (!this.stopped) this.spawnWatcher();
      }, 3000);
      this.restartTimer.unref?.();
    });
  }

  private consume(chunk: string): void {
    this.buffer += chunk;
    for (;;) {
      const nl = this.buffer.indexOf('\n');
      if (nl < 0) break;
      const line = this.buffer.slice(0, nl).trim();
      this.buffer = this.buffer.slice(nl + 1);
      if (line === 'focus') this.onFocus?.(true);
      else if (line === 'blur') this.onFocus?.(false);
      else if (line === 'game-open') this.onGamePresence?.(true);
      else if (line === 'game-closed') this.onGamePresence?.(false);
    }
  }
}
