import React, { useEffect, useState } from 'react';
import { Coffee, BookOpen, LogOut, Clock } from 'lucide-react';
import type { RecesoInstitucional } from '../types.ts';
import { computeSchoolScheduleStatus } from '../lib/scheduleStatus.ts';

interface SchoolScheduleStatusBannerProps {
  horaRecesoInicio?: string;
  horaRecesoFin?: string;
  horaSalida?: string;
  recesos?: RecesoInstitucional[];
  dayName?: string;
  timeHHMM?: string;
  variant?: 'pill' | 'card';
  onGradient?: boolean;
  className?: string;
}

export const SchoolScheduleStatusBanner: React.FC<SchoolScheduleStatusBannerProps> = ({
  horaRecesoInicio,
  horaRecesoFin,
  horaSalida,
  recesos,
  dayName,
  timeHHMM,
  variant = 'pill',
  onGradient = false,
  className = '',
}) => {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (dayName && timeHHMM) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, [dayName, timeHHMM]);

  const status = computeSchoolScheduleStatus({
    horaRecesoInicio,
    horaRecesoFin,
    horaSalida,
    recesos,
    dayName,
    timeHHMM,
  });

  const Icon =
    status.code === 'en_receso'
      ? Coffee
      : status.code === 'clases_en_curso'
      ? BookOpen
      : status.code === 'salida_autorizada'
      ? LogOut
      : Clock;

  if (variant === 'pill') {
    const toneClasses = onGradient
      ? status.code === 'en_receso'
        ? 'bg-amber-400/25 text-amber-50 border-amber-200/40'
        : status.code === 'clases_en_curso'
        ? 'bg-emerald-400/25 text-emerald-50 border-emerald-200/40'
        : status.code === 'salida_autorizada'
        ? 'bg-indigo-300/25 text-white border-indigo-200/40'
        : 'bg-white/20 text-white border-white/30'
      : status.code === 'en_receso'
      ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800'
      : status.code === 'clases_en_curso'
      ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
      : status.code === 'salida_autorizada'
      ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-800 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
      : 'bg-slate-100 dark:bg-[#181818] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-[#27272A]';

    const dotClass =
      status.code === 'en_receso'
        ? 'bg-amber-500'
        : status.code === 'clases_en_curso'
        ? 'bg-emerald-500'
        : status.code === 'salida_autorizada'
        ? 'bg-indigo-500'
        : 'bg-slate-400';

    return (
      <span
        title={status.detail}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${toneClasses} ${className}`}
      >
        <span className={`w-2 h-2 rounded-full ${dotClass} shrink-0`} />
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <span>{status.label}</span>
        <span className="hidden sm:inline opacity-80 font-medium">
          • {status.code === 'en_receso' && status.remainingMinutes !== undefined
            ? `${status.remainingMinutes} min rest.`
            : status.detail}
        </span>
      </span>
    );
  }

  const cardTone =
    status.code === 'en_receso'
      ? 'bg-amber-50/90 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/70 text-amber-950 dark:text-amber-100'
      : status.code === 'clases_en_curso'
      ? 'bg-emerald-50/90 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/70 text-emerald-950 dark:text-emerald-100'
      : status.code === 'salida_autorizada'
      ? 'bg-indigo-50/90 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800/70 text-indigo-950 dark:text-indigo-100'
      : 'bg-slate-50 dark:bg-[#181818] border-slate-200 dark:border-[#27272A] text-slate-800 dark:text-slate-200';

  return (
    <div
      className={`rounded-2xl border px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${cardTone} ${className}`}
    >
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-white/80 dark:bg-[#121212] flex items-center justify-center border border-black/5 dark:border-white/10 shrink-0">
          <Icon className="w-4 h-4" />
        </div>
        <div>
          <p className="text-xs font-extrabold tracking-tight">{status.label}</p>
          <p className="text-[11px] opacity-80">{status.detail}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono font-bold">
        <span className="px-2 py-0.5 rounded-lg bg-white/70 dark:bg-[#121212]/80 border border-black/5 dark:border-white/10">
          Receso: {status.horaRecesoInicio} - {status.horaRecesoFin}
        </span>
        <span className="px-2 py-0.5 rounded-lg bg-white/70 dark:bg-[#121212]/80 border border-black/5 dark:border-white/10">
          Salida: {status.horaSalida}
        </span>
      </div>
    </div>
  );
};
