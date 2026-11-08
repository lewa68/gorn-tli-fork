import { BrowserWindow, screen } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import type { Snapshot } from './engine.js';
import type { SettingsStore } from './settings.js';
import { ToastFeed } from './toastFeed.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const WIDTH = 560;
const INITIAL_HEIGHT = 40;
const MAX_HEIGHT = 260;

/**
 * Слой всплывающего дохода: отдельное прозрачное окно у центра экрана.
 *
 * Отличия от оверлея-панели:
 *  - клики пропускает ВСЕГДА, интерактива нет вовсе — это чистый
 *    floating combat text;
 *  - позиция фиксированная: по горизонтали центр, по вертикали чуть выше
 *    середины — над персонажем, но не поверх прицела и не поверх босс-бара;
 *    стек растёт ВВЕРХ от закреплённой нижней кромки: вниз расти нельзя,
 *    три плашки доставали бы до персонажа в бою;
 *  - окно скрыто, пока показывать нечего: прозрачная площадь стоит
 *    композитору дорого, а слой большую часть времени пуст.
 *
 * Монитор берётся тот же, где стоит оверлей-панель (обычно это монитор
 * с игрой), иначе — основной.
 */
export class ToastLayer {
  private window: BrowserWindow | null = null;
  private hideTimer: NodeJS.Timeout | null = null;
  /** Экранная координата нижней кромки — от неё стек растёт вверх. */
  private anchorBottom = 0;
  /** Урезанный срез и отсев неизменившихся. */
  private readonly feed = new ToastFeed();
  /**
   * Перестановка плашек (Ctrl+Alt+D): окно принимает мышь, рисует
   * полоску-ручку и запоминает положение. Обычно клики идут сквозь,
   * поэтому двигать можно только в этом режиме.
   */
  private adjusting = false;

  constructor(private readonly settings: SettingsStore) {}

  get isOpen(): boolean {
    return this.window !== null && !this.window.isDestroyed();
  }

  /** Нужен ли слой вообще: и плашки, и звук живут в этом окне. */
  private get wanted(): boolean {
    const prefs = this.settings.overlay;
    return prefs.popups || prefs.sound;
  }

  /** Приводит существование окна в соответствие с настройками. */
  sync(): void {
    if (this.wanted) this.open();
    else this.close();
  }

  open(): void {
    if (this.isOpen) return;
    this.feed.reset();

    this.window = new BrowserWindow({
      width: WIDTH,
      height: INITIAL_HEIGHT,
      ...this.position(),
      frame: false,
      transparent: true,
      resizable: false,
      // movable нужен для перетаскивания в режиме перестановки.
      movable: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      focusable: false,
      hasShadow: false,
      alwaysOnTop: true,
      show: false,
      webPreferences: {
        preload: join(__dirname, '../preload/index.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        // Слой должен рисовать и звучать, когда фокус у игры.
        backgroundThrottling: false,
      },
    });

    this.window.setAlwaysOnTop(true, 'screen-saver');
    this.window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    this.window.setIgnoreMouseEvents(true);

    this.window.on('closed', () => {
      this.window = null;
    });
    // Перетаскивание в режиме перестановки: нижняя кромка (якорь стека)
    // важнее верхней, поэтому запоминаем именно её. moved срабатывает и на
    // программный setBounds (рост стека) — его писать в настройки не нужно.
    this.window.on('moved', () => {
      if (this.adjusting) this.rememberAnchor();
    });

    const devServer = process.env['VITE_DEV_SERVER_URL'];
    if (devServer) {
      void this.window.loadURL(new URL('toasts.html', devServer).href);
    } else {
      void this.window.loadFile(join(__dirname, '../renderer/toasts.html'));
    }
    // Окно НЕ показывается после загрузки: оно ждёт первой плашки.
  }

  close(): void {
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = null;
    // Окно пересоздаётся с чистым renderer'ом — режим перестановки не переживает.
    this.adjusting = false;
    this.window?.close();
    this.window = null;
  }

  /** Есть плашки — показать; кончились — спрятать с паузой на дожитие анимации. */
  setActive(active: boolean): void {
    if (!this.isOpen) return;
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = null;
    // В режиме перестановки окно должно оставаться на виду — его тащат мышью.
    if (this.adjusting) {
      if (!this.window!.isVisible()) this.window!.showInactive();
      return;
    }

    if (active) {
      if (!this.window!.isVisible()) this.window!.showInactive();
      return;
    }
    this.hideTimer = setTimeout(() => {
      if (this.isOpen && this.window!.isVisible()) this.window!.hide();
    }, 600);
  }

  /**
   * Режим перестановки: окно принимает мышь и показывает рамку-держатель.
   * Включается кнопкой в настройках (или хоткеем), выключается кнопкой
   * «Готово» на самой рамке. Позиция пишется в настройки на лету.
   */
  setAdjusting(on: boolean): boolean {
    if (!this.isOpen) return false;
    if (this.adjusting === on) return on;
    this.adjusting = on;
    if (on) {
      this.window!.setIgnoreMouseEvents(false);
      if (!this.window!.isVisible()) this.window!.showInactive();
    } else {
      this.rememberAnchor();
      this.window!.setIgnoreMouseEvents(true);
    }
    this.send('toasts:adjusting', this.adjusting);
    return this.adjusting;
  }

  toggleAdjusting(): boolean {
    if (!this.isOpen) return false;
    return this.setAdjusting(!this.adjusting);
  }

  setContentHeight(height: number): void {
    if (!this.isOpen) return;
    const target = Math.max(INITIAL_HEIGHT, Math.min(MAX_HEIGHT, Math.ceil(height)));
    const bounds = this.window!.getBounds();
    if (Math.abs(bounds.height - target) < 2) return;
    // Нижняя кромка зафиксирована: окно растёт вверх, от персонажа.
    this.window!.setBounds({ ...bounds, y: this.anchorBottom - target, height: target });
  }

  /** Срез движка — урезанным и только если для плашек что-то изменилось. */
  sendSnapshot(snapshot: Snapshot): void {
    if (!this.isOpen) return;
    const slim = this.feed.next(snapshot);
    if (slim) this.window?.webContents.send('snapshot', slim);
  }

  send(channel: string, payload: unknown): void {
    if (this.isOpen) this.window?.webContents.send(channel, payload);
  }

  /**
   * Положение слоя. Если игрок переставлял плашки — стоит, где оставил
   * (якорь — нижняя кромка, от неё растёт стек). Иначе — автоматика:
   * монитор оверлея-панели, по горизонтали центр, чуть выше середины.
   */
  private position(): { x: number; y: number } {
    const saved = this.settings.overlay.toastPlacement;
    if (saved) {
      const display =
        screen.getAllDisplays().find((d) => d.id === saved.displayId) ?? screen.getPrimaryDisplay();
      const area = display.workArea;
      // Подрезка по рабочей области: монитор мог отключить — окно не должно
      // уезжать за пределы видимого.
      this.anchorBottom = Math.min(
        Math.max(saved.y, area.y + MAX_HEIGHT),
        area.y + area.height,
      );
      return {
        x: Math.min(Math.max(saved.x, area.x), area.x + area.width - WIDTH),
        y: this.anchorBottom - INITIAL_HEIGHT,
      };
    }
    const savedOverlay = this.settings.overlay.placement;
    // Панель оверлея стоит на мониторе с игрой — всплывашки должны быть
    // там же. Поиск по сохранённой координате надёжнее поиска по id
    // монитора: Windows меняет id при апдейте драйвера и перетаскивке
    // кабеля, и тогда id молча подменялся основным монитором — плашки
    // уезжали на соседний экран. Координата переживает смену id.
    const display = savedOverlay
      ? screen.getDisplayMatching({ x: savedOverlay.x, y: savedOverlay.y, width: WIDTH, height: INITIAL_HEIGHT })
      : screen.getPrimaryDisplay();
    const area = display.workArea;
    // Кромка чуть выше середины: одиночная плашка стоит над персонажем,
    // а полный стек уходит вверх, не доставая до полосы босса.
    this.anchorBottom = Math.round(area.y + area.height * 0.36);
    return {
      x: Math.round(area.x + (area.width - WIDTH) / 2),
      y: this.anchorBottom - INITIAL_HEIGHT,
    };
  }

  /** Запоминает нижнюю кромку окна как якорь плашек. */
  private rememberAnchor(): void {
    if (!this.window) return;
    const bounds = this.window.getBounds();
    this.anchorBottom = bounds.y + bounds.height;
    const display = screen.getDisplayMatching(bounds);
    this.settings.patchOverlay({
      toastPlacement: { x: bounds.x, y: this.anchorBottom, displayId: display.id },
    });
  }
}
