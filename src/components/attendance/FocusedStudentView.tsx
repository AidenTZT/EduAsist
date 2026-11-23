import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  Clock,
  XCircle,
  HelpCircle,
  Lock,
  ChevronLeft,
  ChevronRight,
  User,
} from 'lucide-react';
import type { Estudiante, EstadoAsistencia } from '../../types.ts';
import { formatCedula } from '../../lib/utils.ts';
import type { AttendanceRecordState } from './QuickCardsView.tsx';

interface FocusedStudentViewProps {
  students: Estudiante[];
  attendanceMap: Record<number, AttendanceRecordState>;
  isDocente: boolean;
  currentIndex: number;
  onIndexChange: (nextIndex: number) => void;
  onSelectStatus: (idEstudiante: number, estado: EstadoAsistencia) => void;
}

function getStatusSummaryBadge(estado: EstadoAsistencia) {
  switch (estado) {
    case 'Presente':
      return {
        label: 'Presente',
        textClass: 'text-emerald-700 dark:text-emerald-300',
        dotClass: 'bg-emerald-500',
      };
    case 'Tarde':
      return {
        label: 'Tarde',
        textClass: 'text-amber-700 dark:text-amber-300',
        dotClass: 'bg-amber-500',
      };
    case 'Ausente':
      return {
        label: 'Ausente',
        textClass: 'text-rose-700 dark:text-rose-300',
        dotClass: 'bg-rose-500',
      };
    case 'Justificado':
    case 'Reposo Médico':
      return {
        label: estado,
        textClass: 'text-sky-700 dark:text-sky-300',
        dotClass: 'bg-sky-500',
      };
  }
}

export const FocusedStudentView: React.FC<FocusedStudentViewProps> = ({
  students,
  attendanceMap,
  isDocente,
  currentIndex,
  onIndexChange,
  onSelectStatus,
}) => {
  const safeIndex = Math.min(Math.max(0, currentIndex), Math.max(0, students.length - 1));
  const student = students[safeIndex];
  const [transitionFlash, setTransitionFlash] = useState<EstadoAsistencia | null>(null);
  const advanceTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (advanceTimerRef.current !== null) {
        window.clearTimeout(advanceTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setTransitionFlash(null);
  }, [safeIndex]);

  if (!student) return null;

  const state = attendanceMap[student.idEstudiante] || {
    estado: 'Presente' as EstadoAsistencia,
    horaEntrada: '--:--:--',
    isModified: false,
  };

  const total = students.length;
  const progressPct = total > 0 ? Math.round(((safeIndex + 1) / total) * 100) : 0;
  const statusInfo = getStatusSummaryBadge(state.estado);
  const canGoPrev = safeIndex > 0;
  const canGoNext = safeIndex < total - 1;

  const handleActionSelect = (estado: EstadoAsistencia) => {
    if (state.lockedByCoordination) return;
    if (isDocente && (estado === 'Justificado' || estado === 'Reposo Médico')) return;

    onSelectStatus(student.idEstudiante, estado);
    setTransitionFlash(estado);

    if (advanceTimerRef.current !== null) {
      window.clearTimeout(advanceTimerRef.current);
    }

    if (canGoNext) {
      const prefersReduced =
        typeof window !== 'undefined' &&
        window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const delay = prefersReduced ? 60 : 240;

      advanceTimerRef.current = window.setTimeout(() => {
        setTransitionFlash(null);
        onIndexChange(safeIndex + 1);
      }, delay);
    } else {
      advanceTimerRef.current = window.setTimeout(() => {
        setTransitionFlash(null);
      }, 280);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-3">
      {/* Tarjeta Central Enfocada */}
      <div
        className={`bg-white dark:bg-[#000000] rounded-3xl border p-5 sm:p-6 transition-all duration-150 ${
          transitionFlash
            ? 'border-indigo-500 dark:border-indigo-400 scale-[0.99] opacity-95'
            : 'border-slate-200 dark:border-[#27272A]'
        }`}
      >
        {/* Cabecera de Progreso */}
        <div className="space-y-2 pb-4 border-b border-slate-100 dark:border-[#27272A]">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-extrabold text-slate-800 dark:text-zinc-100 tabular-nums">
              Estudiante {safeIndex + 1} de {total}
            </span>
            <span className="font-mono tabular-nums font-bold text-slate-500 dark:text-zinc-400">
              {progressPct}%
            </span>
          </div>

          <div
            className="w-full h-2 rounded-full bg-slate-100 dark:bg-[#181818] overflow-hidden"
            role="progressbar"
            aria-valuenow={safeIndex + 1}
            aria-valuemin={1}
            aria-valuemax={total}
          >
            <div
              className="h-full bg-indigo-600 dark:bg-indigo-500 rounded-full transition-all duration-200"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Datos Centrales del Alumno */}
        <div className="py-6 text-center space-y-2.5">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-indigo-50 dark:bg-[#121212] border border-indigo-100 dark:border-[#27272A] flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-extrabold text-lg">
            {student.nombres?.[0] || <User className="w-6 h-6" />}
          </div>

          <div>
            <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-[#F4F4F5] tracking-tight leading-tight">
              {student.apellidos}, {student.nombres}
            </h3>
            <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-slate-500 dark:text-zinc-400 mt-1.5">
              <span className="font-mono tabular-nums font-bold text-slate-700 dark:text-zinc-300">
                {formatCedula(student.cedula)}
              </span>
              <span aria-hidden="true">·</span>
              <span>{student.nombreSeccion ? `Sección ${student.nombreSeccion}` : 'Sin Sección'}</span>
              <span aria-hidden="true">·</span>
              <span className={`font-bold ${statusInfo.textClass}`}>
                Estado actual: {statusInfo.label}
              </span>
            </div>
          </div>
        </div>

        {/* Botones Táctiles Amplios en la Parte Inferior */}
        {state.lockedByCoordination ? (
          <div className="p-4 rounded-2xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 text-center space-y-1.5">
            <div className="inline-flex items-center gap-1.5 text-sm font-extrabold text-sky-800 dark:text-sky-200">
              <Lock className="w-4 h-4 shrink-0" />
              <span>Validado por Coordinación: {state.estado}</span>
            </div>
            {state.numeroJustificante && (
              <p className="font-mono text-xs font-bold text-sky-700 dark:text-sky-300">
                Soporte #{state.numeroJustificante}
              </p>
            )}
            {state.motivoJustificacion && (
              <p className="text-xs text-slate-600 dark:text-zinc-300">
                {state.motivoJustificacion}
              </p>
            )}
          </div>
        ) : (
          <div className={`grid ${isDocente ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-4'} gap-2.5`}>
            <button
              type="button"
              onClick={() => handleActionSelect('Presente')}
              className={`min-h-[64px] py-3 px-2 rounded-2xl font-extrabold text-xs sm:text-sm flex flex-col items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer border ${
                state.estado === 'Presente'
                  ? 'bg-emerald-600 text-white border-emerald-500 shadow-md ring-2 ring-emerald-300 dark:ring-emerald-800'
                  : 'bg-slate-50 dark:bg-[#121212] text-slate-700 dark:text-zinc-200 border-slate-200 dark:border-[#27272A] hover:bg-emerald-50 dark:hover:bg-emerald-950/30 hover:text-emerald-700 dark:hover:text-emerald-300'
              }`}
            >
              <Check className="w-5 h-5" />
              <span>Presente</span>
            </button>

            <button
              type="button"
              onClick={() => handleActionSelect('Tarde')}
              className={`min-h-[64px] py-3 px-2 rounded-2xl font-extrabold text-xs sm:text-sm flex flex-col items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer border ${
                state.estado === 'Tarde'
                  ? 'bg-amber-500 text-white dark:text-slate-950 border-amber-400 shadow-md ring-2 ring-amber-300 dark:ring-amber-700'
                  : 'bg-slate-50 dark:bg-[#121212] text-slate-700 dark:text-zinc-200 border-slate-200 dark:border-[#27272A] hover:bg-amber-50 dark:hover:bg-amber-950/30 hover:text-amber-700 dark:hover:text-amber-300'
              }`}
            >
              <Clock className="w-5 h-5" />
              <span>Tarde</span>
            </button>

            <button
              type="button"
              onClick={() => handleActionSelect('Ausente')}
              className={`min-h-[64px] py-3 px-2 rounded-2xl font-extrabold text-xs sm:text-sm flex flex-col items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer border ${
                state.estado === 'Ausente'
                  ? 'bg-rose-600 text-white border-rose-500 shadow-md ring-2 ring-rose-300 dark:ring-rose-800'
                  : 'bg-slate-50 dark:bg-[#121212] text-slate-700 dark:text-zinc-200 border-slate-200 dark:border-[#27272A] hover:bg-rose-50 dark:hover:bg-rose-950/30 hover:text-rose-700 dark:hover:text-rose-300'
              }`}
            >
              <XCircle className="w-5 h-5" />
              <span>Ausente</span>
            </button>

            {!isDocente && (
              <button
                type="button"
                onClick={() => handleActionSelect('Justificado')}
                className={`min-h-[64px] py-3 px-2 rounded-2xl font-extrabold text-xs sm:text-sm flex flex-col items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer border ${
                  state.estado === 'Justificado' || state.estado === 'Reposo Médico'
                    ? 'bg-sky-600 text-white border-sky-500 shadow-md ring-2 ring-sky-300 dark:ring-sky-800'
                    : 'bg-slate-50 dark:bg-[#121212] text-slate-700 dark:text-zinc-200 border-slate-200 dark:border-[#27272A] hover:bg-sky-50 dark:hover:bg-sky-950/30 hover:text-sky-700 dark:hover:text-sky-300'
                }`}
              >
                <HelpCircle className="w-5 h-5" />
                <span>{state.estado === 'Reposo Médico' ? 'Reposo' : 'Justificado'}</span>
              </button>
            )}
          </div>
        )}

        {/* Controles de Navegación Anterior / Siguiente */}
        <div className="flex items-center justify-between gap-3 pt-5 mt-5 border-t border-slate-100 dark:border-[#27272A]">
          <button
            type="button"
            disabled={!canGoPrev}
            onClick={() => {
              if (advanceTimerRef.current !== null) {
                window.clearTimeout(advanceTimerRef.current);
              }
              onIndexChange(safeIndex - 1);
            }}
            className="flex-1 min-h-[46px] px-4 py-2.5 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#121212] text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-[#1C1C1F] font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            <ChevronLeft className="w-4 h-4 shrink-0" />
            <span>Anterior</span>
          </button>

          <button
            type="button"
            disabled={!canGoNext}
            onClick={() => {
              if (advanceTimerRef.current !== null) {
                window.clearTimeout(advanceTimerRef.current);
              }
              onIndexChange(safeIndex + 1);
            }}
            className="flex-1 min-h-[46px] px-4 py-2.5 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#121212] text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-[#1C1C1F] font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            <span>Siguiente</span>
            <ChevronRight className="w-4 h-4 shrink-0" />
          </button>
        </div>
      </div>

      <p className="text-[11px] text-center text-slate-500 dark:text-zinc-400">
        {canGoNext
          ? 'Al marcar un estado se avanzará automáticamente al siguiente estudiante.'
          : 'Último estudiante de la nómina. Presione Guardar Asistencia al finalizar.'}
      </p>
    </div>
  );
};
