'use client';

import { useState } from 'react';
import {
  capitalLinePath,
  capitalPeriods,
  filterCapitalHistory,
  type CapitalPoint,
  type CapitalPeriod,
} from '@/features/capital/history';

function rubles(amount: number) {
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(amount)} ₽`;
}

function displayDate(date: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
    .format(new Date(`${date}T12:00:00Z`))
    .replace('.', '');
}

export function CapitalSparkline({ points }: { points: CapitalPoint[] }) {
  if (!points.length) {
    return (
      <span className="max-w-40 text-right text-xs text-blue-100">
        История появится после импорта остатков
      </span>
    );
  }
  const path = capitalLinePath(points, 190, 56, 4);
  return (
    <svg
      className="h-14 w-32 shrink-0 overflow-visible sm:w-48"
      viewBox="0 0 190 56"
      aria-label={`Капитал по снимкам: ${rubles(points[0].total)} на ${displayDate(points[0].date)}, ${rubles(points.at(-1)!.total)} на ${displayDate(points.at(-1)!.date)}`}
    >
      <path
        d={path}
        fill="none"
        stroke="white"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3"
      />
      {points.length === 1 && <circle cx="95" cy="28" r="4" fill="white" />}
    </svg>
  );
}

export function CapitalHistoryChart({
  points,
  today,
}: {
  points: CapitalPoint[];
  today: string;
}) {
  const [period, setPeriod] = useState<CapitalPeriod>('12m');
  const visible = filterCapitalHistory(points, period, today);
  const first = visible[0];
  const last = visible.at(-1);
  const path = capitalLinePath(visible, 640, 220, 18);
  const values = visible.map((point) => point.total);
  const minimum = values.length ? Math.min(...values) : 0;
  const maximum = values.length ? Math.max(...values) : 0;

  return (
    <section
      aria-labelledby="capital-history-title"
      className="surface-card rounded-3xl border p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            id="capital-history-title"
            className="text-lg font-semibold tracking-tight"
          >
            История капитала
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            По сохранённым остаткам на счетах
          </p>
        </div>
        {last && (
          <p className="text-sm text-muted-foreground">
            Последний снимок · {displayDate(last.date)}
          </p>
        )}
      </div>
      <fieldset className="mt-5 flex flex-wrap gap-2">
        <legend className="sr-only">Период истории капитала</legend>
        {capitalPeriods.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setPeriod(item.value)}
            aria-pressed={period === item.value}
            className={`focus-ring min-h-11 cursor-pointer rounded-xl px-3 text-sm font-medium transition-colors ${period === item.value ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
          >
            {item.label}
          </button>
        ))}
      </fieldset>
      {visible.length ? (
        <div className="mt-6">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <strong className="text-2xl font-semibold tabular-nums sm:text-3xl">
              {rubles(last!.total)}
            </strong>
            {first && last && first.date !== last.date && (
              <span className="text-sm text-muted-foreground">
                {last.total >= first.total ? '+' : '−'}
                {rubles(Math.abs(last.total - first.total))} за период
              </span>
            )}
          </div>
          <div className="mt-5 rounded-2xl bg-muted/50 p-3 sm:p-4">
            <div className="flex justify-between text-xs tabular-nums text-muted-foreground">
              <span>{rubles(maximum)}</span>
              <span>Максимум</span>
            </div>
            <svg
              className="mt-1 h-auto w-full text-primary"
              viewBox="0 0 640 220"
              aria-label={`График капитала: ${visible.length} снимков, от ${rubles(first!.total)} ${displayDate(first!.date)} до ${rubles(last!.total)} ${displayDate(last!.date)}`}
            >
              <path
                d="M18 110 H622"
                className="text-border"
                stroke="currentColor"
                strokeDasharray="5 6"
                fill="none"
              />
              <path
                d={path}
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {visible.length === 1 && (
                <circle cx="320" cy="110" r="6" fill="currentColor" />
              )}
            </svg>
            <div className="flex justify-between text-xs tabular-nums text-muted-foreground">
              <span>{rubles(minimum)}</span>
              <span>Минимум</span>
            </div>
          </div>
          <div className="mt-3 flex justify-between gap-3 text-sm text-muted-foreground">
            <span>{displayDate(first!.date)}</span>
            <span>{displayDate(last!.date)}</span>
          </div>
          {visible.length === 1 && (
            <p className="mt-3 text-sm text-muted-foreground">
              За выбранный период есть один снимок. Динамика появится после
              следующего сохранения остатка.
            </p>
          )}
        </div>
      ) : (
        <div className="mt-6 rounded-2xl border border-dashed p-6 text-sm leading-relaxed text-muted-foreground">
          За этот период нет полной истории остатков. Укажите остатки при
          импорте выписок по всем счетам или выберите более длинный период.
        </div>
      )}
    </section>
  );
}
