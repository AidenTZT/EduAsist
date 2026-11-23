import React from 'react';
import { Check, Clock, XCircle, HelpCircle, Lock, RefreshCw } from 'lucide-react';
import type { Estudiante, EstadoAsistencia } from '../../types.ts';
import { formatCedula } from '../../lib/utils.ts';

export interface AttendanceRecordState {
  estado: EstadoAsistencia;
  horaEntrada: string;
  isModified: boolean;
  lockedByCoordination?: boolean;
  motivoJustificacion?: string | null;
  numeroJustificante?: string | null;
}

interface QuickCardsViewProps {
  students: Estudiante[];
  attendanceMap: Record<number, AttendanceRecordState>;
  isDocente: boolean;
  onCycleStatus: (idEstudiante: number) => void;
}

function getStatusPillStyle(estado: EstadoAsistencia) {
  switch (estado) {
    case 'Presente':
      return {
        classes:
          'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-500/80 shadow-xs shadow-emerald-600/20 dark:bg-emerald-600 dark:hover:bg-emerald-500 dark:border-emerald-500',
        Icon: Check,
        label: 'Presente',
      };
    case 'Ausente':
      return {
        classes:
          'bg-rose-600 hover:bg-rose-700 text-white border-rose-500/80 shadow-xs shadow-rose-600/20 dark:bg-rose-600 dark:hover:bg-rose-500 dark:border-rose-500',
        Icon: XCircle,
        label: 'Ausente',
      };
    case 'Tarde':
      return {
        classes:
          'bg-amber-500 hover:bg-amber-600 text-white border-amber-400/80 shadow-xs shadow-amber-500/20 dark:bg-amber-500 dark:hover:bg-amber-400 dark:text-slate-950 dark:border-amber-400',
        Icon: Clock,
        label: 'Tarde',
      };
    case 'Justificado':
    case 'Reposo Médico':
      return {
        classes:
          'bg-sky-600 hover:bg-sky-700 text-white border-sky-500/80 shadow-xs shadow-sky-600/20 dark:bg-sky-600 dark:hover:bg-sky-500 dark:border-sky-500',
        Icon: HelpCircle,
        label: estado === 'Reposo Médico' ? 'Reposo' : 'Justificado',
      };
  }
}

export const QuickCardsView: React.FC<QuickCardsViewProps> = ({
  students,
  attendanceMap,
  isDocente,
  onCycleStatus,
}) => {
  const cycleHint = isDocente
    ? 'Toca la píldora para alternar: Presente → Ausente → Tarde'
    : 'Toca la píldora para alternar: Presente → Ausente → Tarde → Justificado';

  return (
    <div className="space-y-2.5">
      <p className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 px-1 flex items-center gap-1.5">
        <RefreshCw className="w-3 h-3 text-indigo-500 shrink-0" />
        <span>{cycleHint}</span>
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
        {students.map((student, index) => {
          const state = attendanceMap[student.idEstudiante] || {
            estado: 'Presente' as EstadoAsistencia,
            horaEntrada: '--:--:--',
            isModified: false,
          };

          const pill = getStatusPillStyle(state.estado);
          const StatusIcon = pill.Icon;

          return (
            <div
              key={`quick-card-${student.idEstudiante}`}
              className={`flex items-center justify-between gap-3 px-3.5 py-3 rounded-2xl border transition-colors ${
                state.isModified
                  ? 'bg-indigo-50/40 dark:bg-[#0A0A0A] border-indigo-300 dark:border-indigo-500/70'
                  : 'bg-white dark:bg-[#000000] border-slate-200 dark:border-[#27272A]'
              }`}
            >
              {/* Izquierda: Número de lista + Nombre completo y Cédula */}
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <span className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-[#121212] border border-slate-200 dark:border-[#27272A] font-mono tabular-nums text-xs font-extrabold text-slate-700 dark:text-zinc-200 flex items-center justify-center shrink-0">
                  {index + 1}
                </span>

                <div className="min-w-0 flex-1">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-[#F4F4F5] truncate leading-snug">
                    {student.apellidos}, {student.nombres}
                  </h4>
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-zinc-400 mt-0.5 truncate">
                    <span className="font-mono tabular-nums font-semibold">
                      {formatCedula(student.cedula)}
                    </span>
                    {student.nombreSeccion && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>Sec. {student.nombreSeccion}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Derecha: Único botón interactivo tipo píldora (Tap-to-Cycle) o Badge bloqueado */}
              {state.lockedByCoordination ? (
                <div
                  title={
                    state.motivoJustificacion ||
                    `Registro validado por Coordinación (${state.estado})`
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 min-h-[42px] rounded-full bg-sky-50 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800 text-sky-800 dark:text-sky-200 text-xs font-bold shrink-0 select-none"
                >
                  <Lock className="w-3.5 h-3.5 shrink-0" />
                  <span className="whitespace-nowrap">
                    {state.estado === 'Reposo Médico' ? 'Reposo' : 'Justificado'}
                  </span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onCycleStatus(student.idEstudiante)}
                  aria-label={`Cambiar asistencia de ${student.apellidos} ${student.nombres}. Estado actual: ${state.estado}`}
                  className={`inline-flex items-center justify-center gap-1.5 px-4 min-h-[44px] min-w-[120px] rounded-full border text-xs font-extrabold tracking-tight transition-transform active:scale-95 cursor-pointer shrink-0 whitespace-nowrap ${pill.classes}`}
                >
                  <StatusIcon className="w-4 h-4 shrink-0" />
                  <span>{pill.label}</span>
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
