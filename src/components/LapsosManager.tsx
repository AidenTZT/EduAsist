import React, { useState, useEffect, useMemo } from 'react';
import {
  CalendarRange,
  CheckCircle2,
  AlertCircle,
  Plus,
  Edit2,
  Trash2,
  Sparkles,
  Calendar,
  Clock,
  ShieldAlert,
  X,
  RefreshCw,
  Check,
} from 'lucide-react';
import type { LapsoEscolar, Usuario } from '../types.ts';
import {
  fetchLapsos,
  fetchConfiguracion,
  createLapso,
  updateLapso,
  activateLapso,
  deleteLapso,
} from '../lib/api.ts';
import { formatDateEs, getLocalTodayDateString } from '../lib/utils.ts';

interface LapsosManagerProps {
  currentUser?: Usuario | null;
  onRefreshData?: () => Promise<void> | void;
  onLapsosChanged?: (lapsos: LapsoEscolar[]) => void;
}

const DEFAULT_NAMES: Record<1 | 2 | 3, string> = {
  1: 'Primer Lapso',
  2: 'Segundo Lapso',
  3: 'Tercer Lapso',
};

function getDateDiffDays(startYmd: string, endYmd: string): number {
  const s = new Date(`${startYmd}T00:00:00`).getTime();
  const e = new Date(`${endYmd}T00:00:00`).getTime();
  if (Number.isNaN(s) || Number.isNaN(e)) return 0;
  return Math.max(0, Math.round((e - s) / 86400000));
}

function getLapsoProgress(lapso: LapsoEscolar, todayYmd: string): {
  percent: number;
  statusLabel: string;
  daysLeft: number;
} {
  if (todayYmd < lapso.fechaInicio) {
    const daysUntil = getDateDiffDays(todayYmd, lapso.fechaInicio);
    return {
      percent: 0,
      statusLabel: `Inicia en ${daysUntil} día${daysUntil === 1 ? '' : 's'}`,
      daysLeft: getDateDiffDays(lapso.fechaInicio, lapso.fechaFin) + 1,
    };
  }
  if (todayYmd > lapso.fechaFin) {
    return {
      percent: 100,
      statusLabel: 'Período culminado',
      daysLeft: 0,
    };
  }
  const totalDays = Math.max(1, getDateDiffDays(lapso.fechaInicio, lapso.fechaFin) + 1);
  const elapsed = Math.max(1, getDateDiffDays(lapso.fechaInicio, todayYmd) + 1);
  const daysLeft = getDateDiffDays(todayYmd, lapso.fechaFin);
  const percent = Math.min(100, Math.max(1, Math.round((elapsed / totalDays) * 100)));
  return {
    percent,
    statusLabel: `${percent}% transcurrido (${daysLeft} día${daysLeft === 1 ? '' : 's'} restantes)`,
    daysLeft,
  };
}

export const LapsosManager: React.FC<LapsosManagerProps> = ({
  currentUser,
  onRefreshData,
  onLapsosChanged,
}) => {
  const canManage =
    currentUser?.rol === 'director' || currentUser?.rol === 'coordinador';

  const [lapsos, setLapsos] = useState<LapsoEscolar[]>([]);
  const [defaultAnioEscolar, setDefaultAnioEscolar] = useState<string>('2025 - 2026');
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [activatingId, setActivatingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Modal state
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [editingLapso, setEditingLapso] = useState<LapsoEscolar | null>(null);
  const [modalError, setModalError] = useState<string>('');
  const [formState, setFormState] = useState<{
    nombre: string;
    numeroLapso: 1 | 2 | 3;
    fechaInicio: string;
    fechaFin: string;
    anioEscolar: string;
    activo: boolean;
  }>({
    nombre: 'Primer Lapso',
    numeroLapso: 1,
    fechaInicio: '',
    fechaFin: '',
    anioEscolar: '2025 - 2026',
    activo: false,
  });

  const todayYmd = getLocalTodayDateString();

  const loadData = async () => {
    if (!canManage) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [lapsosList, cfg] = await Promise.all([
        fetchLapsos(),
        fetchConfiguracion().catch(() => ({
          anoLectivo: '2025 - 2026',
          nombreInstitucion: '',
          raw: [],
        })),
      ]);
      setLapsos(lapsosList);
      if (cfg.anoLectivo) {
        setDefaultAnioEscolar(cfg.anoLectivo);
      }
      onLapsosChanged?.(lapsosList);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err?.message || 'No se pudieron cargar los lapsos escolares.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [canManage]);

  const activeLapso = useMemo(
    () => lapsos.find((l) => l.activo) || null,
    [lapsos]
  );

  const lapsosByYear = useMemo(() => {
    const groups = new Map<string, LapsoEscolar[]>();
    for (const l of lapsos) {
      const list = groups.get(l.anioEscolar) || [];
      list.push(l);
      groups.set(l.anioEscolar, list);
    }
    return Array.from(groups.entries()).map(([anio, list]) => ({
      anio,
      lapsos: list.sort((a, b) => a.numeroLapso - b.numeroLapso),
    }));
  }, [lapsos]);

  const openCreateModal = (suggestedNum?: 1 | 2 | 3) => {
    const existingNums = new Set(
      lapsos
        .filter((l) => l.anioEscolar === defaultAnioEscolar)
        .map((l) => l.numeroLapso)
    );
    const nextNum: 1 | 2 | 3 =
      suggestedNum ||
      ([1, 2, 3].find((n) => !existingNums.has(n as 1 | 2 | 3)) as 1 | 2 | 3) ||
      1;

    setEditingLapso(null);
    setModalError('');
    setFormState({
      nombre: DEFAULT_NAMES[nextNum],
      numeroLapso: nextNum,
      fechaInicio: todayYmd,
      fechaFin: todayYmd,
      anioEscolar: activeLapso?.anioEscolar || defaultAnioEscolar,
      activo: lapsos.length === 0,
    });
    setModalOpen(true);
  };

  const openEditModal = (lapso: LapsoEscolar) => {
    setEditingLapso(lapso);
    setModalError('');
    setFormState({
      nombre: lapso.nombre,
      numeroLapso: lapso.numeroLapso,
      fechaInicio: lapso.fechaInicio,
      fechaFin: lapso.fechaFin,
      anioEscolar: lapso.anioEscolar,
      activo: lapso.activo,
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError('');

    if (formState.nombre.trim().length < 3) {
      setModalError('El nombre del lapso debe tener al menos 3 caracteres.');
      return;
    }
    if (!formState.fechaInicio || !formState.fechaFin) {
      setModalError('Debe especificar la fecha de inicio y cierre del lapso.');
      return;
    }
    if (formState.fechaInicio > formState.fechaFin) {
      setModalError('La fecha de inicio no puede ser posterior a la fecha de cierre.');
      return;
    }
    if (formState.anioEscolar.trim().length < 4) {
      setModalError('Debe indicar el año escolar vigente (ej. 2025 - 2026).');
      return;
    }

    setSaving(true);
    try {
      if (editingLapso) {
        const updated = await updateLapso(editingLapso.id, {
          nombre: formState.nombre.trim(),
          numeroLapso: formState.numeroLapso,
          fechaInicio: formState.fechaInicio,
          fechaFin: formState.fechaFin,
          anioEscolar: formState.anioEscolar.trim(),
          activo: formState.activo,
        });
        setFeedback({
          type: 'success',
          text: `"${updated.nombre}" actualizado correctamente (${formatDateEs(updated.fechaInicio)} al ${formatDateEs(updated.fechaFin)}).`,
        });
      } else {
        const created = await createLapso({
          nombre: formState.nombre.trim(),
          numeroLapso: formState.numeroLapso,
          fechaInicio: formState.fechaInicio,
          fechaFin: formState.fechaFin,
          anioEscolar: formState.anioEscolar.trim(),
          activo: formState.activo,
        });
        setFeedback({
          type: 'success',
          text: `"${created.nombre}" creado y vinculado al ciclo ${created.anioEscolar}.`,
        });
      }
      setModalOpen(false);
      await loadData();
      await onRefreshData?.();
    } catch (err: any) {
      setModalError(err?.message || 'Error al guardar la configuración del lapso.');
    } finally {
      setSaving(false);
    }
  };

  const handleActivate = async (lapso: LapsoEscolar) => {
    if (lapso.activo) return;
    setActivatingId(lapso.id);
    setFeedback(null);
    try {
      const updated = await activateLapso(lapso.id, true);
      setFeedback({
        type: 'success',
        text: `"${updated.nombre}" establecido ahora como el Lapso Actual en curso.`,
      });
      await loadData();
      await onRefreshData?.();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err?.message || 'No se pudo activar el lapso seleccionado.',
      });
    } finally {
      setActivatingId(null);
    }
  };

  const handleDelete = async (lapso: LapsoEscolar) => {
    setDeletingId(lapso.id);
    setFeedback(null);
    try {
      await deleteLapso(lapso.id);
      setConfirmDeleteId(null);
      setFeedback({
        type: 'success',
        text: `"${lapso.nombre}" eliminado correctamente.`,
      });
      await loadData();
      await onRefreshData?.();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err?.message || 'No se pudo eliminar el lapso escolar.',
      });
    } finally {
      setDeletingId(null);
    }
  };

  if (!canManage) {
    return (
      <div className="bg-white dark:bg-[#121212] rounded-2xl border border-rose-200 dark:border-rose-900/60 p-6 text-center space-y-2">
        <ShieldAlert className="w-8 h-8 text-rose-500 mx-auto" />
        <h3 className="text-sm font-bold text-slate-900 dark:text-[#F4F4F5]">
          Acceso Restringido
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          La configuración de Lapsos Escolares está reservada exclusivamente para Director y Coordinador.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Banner del Lapso Actual en Curso */}
      <div className="bg-white dark:bg-[#121212] rounded-2xl border border-slate-200 dark:border-[#27272A] p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="p-3 rounded-2xl bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 border border-purple-200/80 dark:border-purple-800/60 shrink-0">
              <CalendarRange className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-[#F4F4F5]">
                  Configuración de Lapsos Escolares
                </h3>
                {activeLapso ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                    <Sparkles className="w-3 h-3" />
                    <span>Lapso Actual: {activeLapso.nombre}</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                    Sin lapso activo seleccionado
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Divide el año escolar en los 3 lapsos oficiales para clasificar automáticamente asistencias, historial y reportes PDF. No se permiten rangos de fechas solapados.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
            <button
              type="button"
              onClick={loadData}
              disabled={loading}
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-[#181818] text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#27272A] border border-slate-200 dark:border-[#27272A] flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Actualizar</span>
            </button>
            <button
              type="button"
              onClick={() => openCreateModal()}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white shadow-sm shadow-purple-100 dark:shadow-none flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nuevo Lapso Escolar</span>
            </button>
          </div>
        </div>

        {/* Detalle rápido del Lapso Actual */}
        {activeLapso && (() => {
          const progress = getLapsoProgress(activeLapso, todayYmd);
          return (
            <div className="mt-5 p-4 rounded-2xl bg-gradient-to-r from-emerald-50/90 via-teal-50/70 to-indigo-50/80 dark:from-emerald-950/40 dark:via-teal-950/30 dark:to-indigo-950/30 border border-emerald-200/80 dark:border-emerald-800/60">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-emerald-600 text-white">
                      EN CURSO • LAPSO {activeLapso.numeroLapso}
                    </span>
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                      Año Escolar {activeLapso.anioEscolar}
                    </span>
                  </div>
                  <h4 className="text-base font-black text-slate-900 dark:text-[#F4F4F5]">
                    {activeLapso.nombre}
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-slate-300 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="inline-flex items-center gap-1 font-medium">
                      <Calendar className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      Desde <strong>{formatDateEs(activeLapso.fechaInicio)}</strong> hasta{' '}
                      <strong>{formatDateEs(activeLapso.fechaFin)}</strong>
                    </span>
                    <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-300">
                      <Clock className="w-3.5 h-3.5" />
                      {progress.statusLabel}
                    </span>
                  </p>
                </div>

                <div className="w-full md:w-56 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 dark:text-slate-300">
                    <span>Avance del período</span>
                    <span>{progress.percent}%</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-white/80 dark:bg-[#121212] overflow-hidden border border-emerald-200/70 dark:border-emerald-800/60">
                    <div
                      className="h-full bg-emerald-600 dark:bg-emerald-500 rounded-full transition-all duration-300"
                      style={{ width: `${progress.percent}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Feedback message */}
      {feedback && (
        <div
          className={`p-3.5 rounded-2xl text-xs font-semibold flex items-center justify-between gap-2 border ${
            feedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
              : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Listado por Año Escolar */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="h-44 rounded-2xl bg-white dark:bg-[#121212] border border-slate-200 dark:border-[#27272A] p-5 animate-pulse space-y-3"
            >
              <div className="h-4 w-28 bg-slate-200 dark:bg-[#27272A] rounded" />
              <div className="h-6 w-40 bg-slate-200 dark:bg-[#27272A] rounded" />
              <div className="h-3 w-full bg-slate-200 dark:bg-[#27272A] rounded" />
            </div>
          ))}
        </div>
      ) : lapsosByYear.length === 0 ? (
        <div className="bg-white dark:bg-[#121212] rounded-2xl border border-slate-200 dark:border-[#27272A] p-10 text-center space-y-3">
          <CalendarRange className="w-10 h-10 text-slate-400 mx-auto" />
          <h4 className="text-sm font-bold text-slate-900 dark:text-[#F4F4F5]">
            No hay lapsos escolares configurados
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Configure los 3 lapsos oficiales del año escolar para habilitar el filtrado por período en asistencias y reportes PDF.
          </p>
          <button
            type="button"
            onClick={() => openCreateModal(1)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Crear Primer Lapso</span>
          </button>
        </div>
      ) : (
        lapsosByYear.map((group) => (
          <div key={group.anio} className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Año Escolar {group.anio}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 dark:bg-[#181818] text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-[#27272A]">
                  {group.lapsos.length} / 3 lapsos
                </span>
              </div>
              {group.lapsos.length < 3 && (
                <button
                  type="button"
                  onClick={() => openCreateModal()}
                  className="text-xs font-bold text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Completar lapsos</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {group.lapsos.map((lapso) => {
                const progress = getLapsoProgress(lapso, todayYmd);
                const isConfirmingDelete = confirmDeleteId === lapso.id;

                return (
                  <div
                    key={lapso.id}
                    className={`rounded-2xl border p-5 transition-all flex flex-col justify-between gap-4 ${
                      lapso.activo
                        ? 'bg-white dark:bg-[#121212] border-emerald-400 dark:border-emerald-700 ring-2 ring-emerald-100 dark:ring-emerald-950/60 shadow-sm'
                        : 'bg-white dark:bg-[#121212] border-slate-200 dark:border-[#27272A] shadow-2xs'
                    }`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-8 h-8 rounded-xl font-black text-xs flex items-center justify-center border ${
                              lapso.activo
                                ? 'bg-emerald-600 text-white border-emerald-600'
                                : 'bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800'
                            }`}
                          >
                            {lapso.numeroLapso}°
                          </span>
                          <div>
                            <h4 className="font-bold text-sm text-slate-900 dark:text-[#F4F4F5]">
                              {lapso.nombre}
                            </h4>
                            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                              Ciclo {lapso.anioEscolar}
                            </p>
                          </div>
                        </div>

                        {lapso.activo ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 shrink-0">
                            Lapso Actual
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-100 dark:bg-[#181818] text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-[#27272A] shrink-0">
                            Inactivo
                          </span>
                        )}
                      </div>

                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#181818] border border-slate-200/80 dark:border-[#27272A] space-y-1.5 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500 dark:text-slate-400 font-medium">
                            Fecha Inicio:
                          </span>
                          <span className="font-mono font-bold text-slate-800 dark:text-[#F4F4F5]">
                            {formatDateEs(lapso.fechaInicio)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500 dark:text-slate-400 font-medium">
                            Fecha Cierre:
                          </span>
                          <span className="font-mono font-bold text-slate-800 dark:text-[#F4F4F5]">
                            {formatDateEs(lapso.fechaFin)}
                          </span>
                        </div>
                        <div className="pt-1 border-t border-slate-200/70 dark:border-[#27272A] flex items-center justify-between text-[11px]">
                          <span className="text-slate-500 dark:text-slate-400">Estado calendario:</span>
                          <span className="font-semibold text-slate-700 dark:text-slate-300">
                            {progress.statusLabel}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100 dark:border-[#27272A] flex flex-wrap items-center justify-between gap-2">
                      {!lapso.activo ? (
                        <button
                          type="button"
                          onClick={() => handleActivate(lapso)}
                          disabled={activatingId === lapso.id}
                          className="px-3 py-1.5 rounded-xl text-[11px] font-bold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-600 hover:text-white dark:hover:bg-emerald-600 dark:hover:text-white border border-emerald-200 dark:border-emerald-800 transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>
                            {activatingId === lapso.id ? 'Activando...' : 'Activar Lapso'}
                          </span>
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>En curso actualmente</span>
                        </span>
                      )}

                      <div className="flex items-center gap-1.5 ml-auto">
                        <button
                          type="button"
                          onClick={() => openEditModal(lapso)}
                          className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition-colors cursor-pointer"
                          title="Editar fechas o nombre del lapso"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>

                        {isConfirmingDelete ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleDelete(lapso)}
                              disabled={deletingId === lapso.id}
                              className="px-2 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold cursor-pointer disabled:opacity-50"
                            >
                              {deletingId === lapso.id ? '...' : 'Confirmar'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-[#181818] text-slate-600 dark:text-slate-300 text-[10px] font-bold cursor-pointer"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(lapso.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors cursor-pointer"
                            title="Eliminar lapso"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      {/* Modal Crear / Editar Lapso Escolar */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
          onClick={() => !saving && setModalOpen(false)}
        >
          <div
            className="bg-white dark:bg-[#121212] rounded-3xl max-w-lg w-full border border-slate-200 dark:border-[#27272A] p-6 shadow-2xl space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-[#27272A]">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-800">
                  <CalendarRange className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900 dark:text-[#F4F4F5]">
                    {editingLapso ? `Editar ${editingLapso.nombre}` : 'Nuevo Lapso Escolar'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Defina el período oficial sin solapar fechas con otros lapsos
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !saving && setModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {modalError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300 text-xs font-semibold flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Número de Lapso:
                  </label>
                  <select
                    value={formState.numeroLapso}
                    onChange={(e) => {
                      const num = Number(e.target.value) as 1 | 2 | 3;
                      const prevDefault = DEFAULT_NAMES[formState.numeroLapso];
                      setFormState((prev) => ({
                        ...prev,
                        numeroLapso: num,
                        nombre:
                          !editingLapso && prev.nombre === prevDefault
                            ? DEFAULT_NAMES[num]
                            : prev.nombre,
                      }));
                    }}
                    className="w-full bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-[#F4F4F5] focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer"
                  >
                    <option value={1}>1° — Primer Lapso</option>
                    <option value={2}>2° — Segundo Lapso</option>
                    <option value={3}>3° — Tercer Lapso</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Año Escolar:
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: 2025 - 2026"
                    value={formState.anioEscolar}
                    onChange={(e) =>
                      setFormState((prev) => ({ ...prev, anioEscolar: e.target.value }))
                    }
                    className="w-full bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 dark:text-[#F4F4F5] focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Nombre Oficial del Lapso:
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Primer Lapso"
                  value={formState.nombre}
                  onChange={(e) =>
                    setFormState((prev) => ({ ...prev, nombre: e.target.value }))
                  }
                  className="w-full bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 dark:text-[#F4F4F5] focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Fecha de Inicio:
                  </label>
                  <input
                    type="date"
                    required
                    value={formState.fechaInicio}
                    onChange={(e) =>
                      setFormState((prev) => ({ ...prev, fechaInicio: e.target.value }))
                    }
                    className="w-full bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 dark:text-[#F4F4F5] focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Fecha de Cierre:
                  </label>
                  <input
                    type="date"
                    required
                    value={formState.fechaFin}
                    onChange={(e) =>
                      setFormState((prev) => ({ ...prev, fechaFin: e.target.value }))
                    }
                    className="w-full bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 dark:text-[#F4F4F5] focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] cursor-pointer">
                <input
                  type="checkbox"
                  checked={formState.activo}
                  onChange={(e) =>
                    setFormState((prev) => ({ ...prev, activo: e.target.checked }))
                  }
                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                />
                <div className="text-xs">
                  <span className="font-bold text-slate-800 dark:text-[#F4F4F5]">
                    Establecer como Lapso Actual en curso
                  </span>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Desactivará automáticamente cualquier otro lapso marcado como activo.
                  </p>
                </div>
              </label>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-[#27272A]">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  disabled={saving}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#181818] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {saving ? 'Guardando...' : editingLapso ? 'Actualizar Lapso' : 'Crear Lapso'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
