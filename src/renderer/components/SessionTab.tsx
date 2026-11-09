import { useMemo, useState } from 'react';

import { tr } from '../../core/i18n.js';
import { RUN, pluralize } from '../../core/plural.js';
import type { RunView, Snapshot } from '../../main/engine.js';
import { clock, duration, num } from '../format.js';
import { useNow } from '../useNow.js';
import { DropList } from './DropList.js';
import { Fe } from './Fe.js';

/**
 * Вкладка «Сессия»: всё, что добыто с момента нажатия «Запустить».
 *
 * Внизу — список локаций со средним временем; выбор локации раскрывает
 * её забеги. Учёт лута тот же, что везде: DropList сворачивает мелочь
 * и исключённое, неизвестные предметы движок не присылает вовсе.
 */

/** Лут сессии одним списком: предметы сложены по всем забегам. */
function lootOf(runs: RunView[]): RunView['drops'] {
  const byId = new Map<number, RunView['drops'][number]>();
  for (const run of runs) {
    for (const d of run.drops) {
      const acc = byId.get(d.configBaseId);
      if (!acc) {
        byId.set(d.configBaseId, { ...d });
        continue;
      }
      acc.qty += d.qty;
      acc.totalFe = acc.totalFe === null || d.totalFe === null ? acc.totalFe : acc.totalFe + d.totalFe;
    }
  }
  return [...byId.values()].sort((a, b) => (b.totalFe ?? -1) - (a.totalFe ?? -1));
}

/** Локации сессии: среднее активное время, забеги, итог. */
function locationsOf(runs: RunView[]): Array<{ name: string; runs: number; avgActiveMs: number; netFe: number }> {
  const byName = new Map<string, { runs: number; activeMs: number; netFe: number }>();
  for (const r of runs) {
    const acc = byName.get(r.name) ?? { runs: 0, activeMs: 0, netFe: 0 };
    acc.runs++;
    acc.activeMs += r.activeMs;
    acc.netFe += r.netFe;
    byName.set(r.name, acc);
  }
  return [...byName.entries()]
    .map(([name, a]) => ({ name, runs: a.runs, avgActiveMs: a.activeMs / a.runs, netFe: a.netFe }))
    .sort((a, b) => b.runs - a.runs || b.netFe - a.netFe);
}

export function SessionTab({ snapshot }: { snapshot: Snapshot }) {
  const now = useNow(1000);
  const [location, setLocation] = useState<string | null>(null);

  const runs = snapshot.sessionRuns;
  const loot = useMemo(() => lootOf(runs), [runs]);
  const locations = useMemo(() => locationsOf(runs), [runs]);
  const selected = location !== null ? runs.filter((r) => r.name === location) : [];

  const started = snapshot.session.startedAt;
  const elapsed = started > 0 ? Math.max(0, now - started) : 0;
  const valueFe = runs.reduce((a, r) => a + r.valueFe, 0);
  const startedFresh = runs.length > 0;

  return (
    <section className="card session-tab">
      <div className="session-head">
        {/* Таймер: тикает от нажатия «Запустить». */}
        <span className="timer">{started > 0 ? clock(elapsed) : '--:--'}</span>
        <button
          className="session-start"
          disabled={!window.gorn}
          onClick={() => {
            setLocation(null);
            void window.gorn?.session.reset();
          }}
          title={tr(
            'Отсчёт и добыча начнутся с нуля; прошлые локации останутся в истории.',
            'The timer and loot restart from zero; past locations stay in history.',
          )}
        >
          {tr('Запустить', 'Start')}
        </button>
        {/* Общая ценность добытого за сессию — оценка, как и везде. */}
        <span className="session-total">
          {tr('Лут сессии', 'Session loot')} <Fe value={valueFe} />
        </span>
      </div>

      {!startedFresh && (
        <p className="muted">
          {tr(
            'Сессия запущена. Лут появится после первых локаций — всё, что добыто с момента нажатия, соберётся здесь.',
            'Session started. Loot appears after the first locations — everything farmed since the button press gathers here.',
          )}
        </p>
      )}

      {startedFresh && (
        <div className="columns">
          <div>
            <h2>{tr('Добыча за сессию', 'Session loot')}</h2>
            <DropList
              drops={loot}
              empty={tr('Ничего не выпало.', 'Nothing dropped.')}
              minFe={snapshot.minDropFe}
            />
          </div>
          <div>
            <h2>{tr('Локации', 'Locations')}</h2>
            <ul className="session-locations">
              {locations.map((l) => (
                <li key={l.name}>
                  <button
                    className={`link-button session-loc${location === l.name ? ' on' : ''}`}
                    onClick={() => setLocation(location === l.name ? null : l.name)}
                  >
                    {l.name}
                  </button>
                  <span className="muted small">
                    {pluralize(l.runs, RUN)} · {tr('среднее', 'avg')} {duration(l.avgActiveMs)}
                  </span>
                  <Fe value={l.netFe} />
                </li>
              ))}
            </ul>
            {location !== null && (
              <>
                <h3>{location}</h3>
                <ul className="session-loc-runs">
                  {selected.map((r) => (
                    <li key={r.key}>
                      <span className="muted small">{clock(r.durationMs ?? r.activeMs)}</span>
                      <span className="muted small">
                        {tr('активных', 'active')} {duration(r.activeMs)}
                      </span>
                      <Fe value={r.netFe} />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
