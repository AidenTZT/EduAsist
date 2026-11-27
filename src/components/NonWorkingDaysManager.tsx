import React, { useState, useEffect } from 'react';
import {
  CalendarOff,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  CalendarRange,
  ShieldAlert,
  Loader2,
  BellOff,
} from 'lucide-react';
import type { DiaNoLaborable, LapsoEscolar, Usuario } from '../types.ts';
import {
  fetchDiasNoLaborables,
  createDiaNoLaborable,
  deleteDiaNoLaborable,
  fetchLapsos,
} from '../lib/api.ts';
import { formatDateEs, getLocalTodayDateString } from '../lib/utils.ts';

interface NonWorkingDaysManagerProps {
  currentUser?: Usuario | null;
  onRefreshData?: () => Promise<void> | void;
}

const MOTIVO_PRESETS = [
  'Feriado Nacional',
  'Vacaciones Escolares',
  'Suspensión de Actividades',
  'Consejo Docente / Jornada Pedagógica',
  'Día de Júbilo / Asueto Regional',
];

export const NonWorkingDaysManager: React.FC<NonWorkingDaysManagerProps> = ({
  currentUser,
  onRefreshData,
}) => {
  const isAuthorized = currentUser?.rol === 'director' || currentUser?.rol === 'coordinador';

  const [dias, setDias] = useState<DiaNoLaborable[]>([]);
  const [lapsos, setLapsos] = useState<LapsoEscolar[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const [fechaInicio, setFechaInicio] = useState<string>(() => getLocalTodayDateString());
  const [fechaFin, setFechaFin] = useState<string>(() => getLocalTodayDateString());
  const [motivo, setMotivo] = useState<string>('');
  const [lapsoId, setLapsoId] = useState<number>(0);

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [diasList, lapsosList] = await Promise.all([
        fetchDiasNoLaborables(),
        fetchLapsos().catch(() => [] as LapsoEscolar[]),
      ]);
      setDias(diasList);
      setLapsos(lapsosList);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err?.message || 'No se pudo cargar el calendario de días no laborables.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthorized) return;
    if (fechaInicio > fechaFin) {
      setFeedback({
        type: 'error',
        text: 'La fecha de inicio no puede ser posterior a la fecha final.',
      });
      return;
    }
    if (motivo.trim().length < 3) {
      setFeedback({
        type: 'error',
        text: 'Ingrese un motivo descriptivo (mínimo 3 caracteres).',
      });
      return;
    }

    setSaving(true);
    setFeedback(null);
    try {
      const created = await createDiaNoLaborable({
        fechaInicio,
        fechaFin,
        motivo: motivo.trim(),
        lapsoId: lapsoId > 0 ? lapsoId : null,
      });
      setDias((prev) =>
        [...prev, created].sort((a, b) => a.fechaInicio.localeCompare(b.fechaInicio) || a.id - b.id)
      );
      setMotivo('');
      setLapsoId(0);
      setFeedback({
        type: 'success',
        text: `Día(s) no laborable(s) registrado(s): "${created.motivo}" (${formatDateEs(
          created.fechaInicio
        )}${created.fechaFin !== created.fechaInicio ? ` al ${formatDateEs(created.fechaFin)}` : ''}).`,
      });
      await onRefreshData?.();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err?.message || 'Error al guardar el día no laborable.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    setFeedback(null);
    try {
      await deleteDiaNoLaborable(id);
      setDias((prev) => prev.filter((d) => d.id !== id));
      setConfirmDeleteId(null);
      setFeedback({
        type: 'success',
        text: 'Registro de día no laborable eliminado correctamente.',
      });
      await onRefreshData?.();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err?.message || 'No se pudo eliminar el registro.',
      });
    } finally {
      setDeletingId(null);
    }
  };

  if (!isAuthorized) {
    return (
      <div className="bg-white dark:bg-[#121212] rounded-2xl p-6 border border-rose-200 dark:border-rose-900/60 text-center">
        <ShieldAlert className="w-8 h-8 text-rose-500 mx-auto mb-2" />
        <p className="text-sm font-bold text-slate-900 dark:text-[#F4F4F5]">
          Acceso exclusivo para Dirección y Coordinación
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Cabecera informativa */}
      <div className="bg-white dark:bg-[#121212] p-5 rounded-2xl border border-slate-200 dark:border-[#27272A] shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 rounded-xl">
              <CalendarOff className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-[#F4F4F5]">
                Calendario de Días No Laborables y Feriados
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Bloquea automáticamente el pase de asistencia, suspende alertas push de receso/salida y excluye fechas no hábiles de las estadísticas.
              </p>
            </div>
          </div>

          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-[#181818] text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-[#27272A] text-xs font-semibold shrink-0">
            <BellOff className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span>Fines de semana bloqueados automáticamente</span>
          </span>
        </div>

        {/* Formulario de Registro */}
        <form
          onSubmit={handleCreate}
          className="pt-4 border-t border-slate-100 dark:border-[#27272A] space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">
                Fecha de Inicio
              </label>
              <input
                type="date"
                required
                value={fechaInicio}
                onChange={(e) => {
                  const val = e.target.value;
                  setFechaInicio(val);
                  if (val > fechaFin) setFechaFin(val);
                }}
                className="w-full min-h-[42px] bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 dark:text-[#F4F4F5] focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">
                Fecha Fin (Igual si es 1 día)
              </label>
              <input
                type="date"
                required
                value={fechaFin}
                min={fechaInicio}
                onChange={(e) => setFechaFin(e.target.value)}
                className="w-full min-h-[42px] bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 dark:text-[#F4F4F5] focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">
                Motivo / Descripción
              </label>
              <input
                type="text"
                required
                placeholder="Ej: Feriado Nacional - Carnaval"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                className="w-full min-h-[42px] bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 dark:text-[#F4F4F5] focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">
                Lapso Asociado (Opcional)
              </label>
              <select
                value={lapsoId}
                onChange={(e) => setLapsoId(Number(e.target.value))}
                className="w-full min-h-[42px] bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 dark:text-[#F4F4F5] focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer"
              >
                <option value={0}>Detectar automáticamente según fecha</option>
                {lapsos.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nombre} ({l.anioEscolar})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400 mr-1">
                Sugerencias:
              </span>
              {MOTIVO_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setMotivo(preset)}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 dark:bg-[#181818] text-slate-700 dark:text-zinc-300 hover:bg-amber-50 dark:hover:bg-amber-950/40 hover:text-amber-700 dark:hover:text-amber-300 border border-slate-200 dark:border-[#27272A] transition-colors cursor-pointer"
                >
                  {preset}
                </button>
              ))}
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full sm:w-auto min-h-[42px] px-5 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-sm flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              <span>{saving ? 'Guardando...' : 'Agregar Día No Laborable'}</span>
            </button>
          </div>
        </form>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-xl text-xs font-semibold flex items-center gap-2.5 border ${
            feedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
              : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Listado de Días No Laborables */}
      <div className="bg-white dark:bg-[#121212] rounded-2xl border border-slate-200 dark:border-[#27272A] shadow-xs overflow-hidden">
        <div className="p-4 bg-slate-50/70 dark:bg-[#181818] border-b border-slate-200 dark:border-[#27272A] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarRange className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <span className="font-bold text-sm text-slate-900 dark:text-[#F4F4F5]">
              Fechas Sin Actividad Escolar ({dias.length})
            </span>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500 dark:text-zinc-400">
            Cargando calendario institucional...
          </div>
        ) : dias.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <CalendarOff className="w-8 h-8 text-slate-300 dark:text-zinc-600 mx-auto" />
            <p className="text-xs font-semibold text-slate-600 dark:text-zinc-300">
              No hay feriados ni suspensiones registradas aún.
            </p>
            <p className="text-[11px] text-slate-400 dark:text-zinc-500">
              Registre feriados nacionales, vacaciones o jornadas docentes en el formulario superior.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-[#27272A]">
            {dias.map((item) => {
              const isRange = item.fechaInicio !== item.fechaFin;
              return (
                <div
                  key={item.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 dark:hover:bg-[#181818]/60 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-sm text-slate-900 dark:text-[#F4F4F5]">
                        {item.motivo}
                      </span>
                      {item.lapsoNombre && (
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-900/60">
                          {item.lapsoNombre}
                        </span>
                      )}
                    </div>
                    <p className="font-mono tabular-nums text-xs text-slate-600 dark:text-zinc-400">
                      {isRange
                        ? `Del ${formatDateEs(item.fechaInicio)} al ${formatDateEs(item.fechaFin)}`
                        : `Fecha: ${formatDateEs(item.fechaInicio)}`}
                    </p>
                  </div>

                  {confirmDeleteId === item.id ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleDelete(item.id)}
                        disabled={deletingId === item.id}
                        className="px-3 py-2 min-h-[38px] rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white cursor-pointer disabled:opacity-50"
                      >
                        {deletingId === item.id ? 'Eliminando...' : 'Confirmar'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-3 py-2 min-h-[38px] rounded-lg text-xs font-bold bg-slate-100 dark:bg-[#27272A] text-slate-700 dark:text-zinc-300 cursor-pointer"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(item.id)}
                      className="self-start sm:self-center px-3 py-2 min-h-[38px] rounded-lg text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-slate-200 dark:border-[#27272A] flex items-center gap-1.5 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Eliminar</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
