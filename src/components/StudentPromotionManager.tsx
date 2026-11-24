import React, { useState, useEffect, useMemo } from 'react';
import {
  GraduationCap,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Search,
  Users,
  ShieldAlert,
  Loader2,
  CheckSquare,
  Square,
} from 'lucide-react';
import type { AnoEscolar, Seccion, Estudiante, Usuario } from '../types.ts';
import { promoverEstudiantes } from '../lib/api.ts';
import { formatCedula, sortStudentsByCedula } from '../lib/utils.ts';

interface StudentPromotionManagerProps {
  anos: AnoEscolar[];
  secciones: Seccion[];
  estudiantes: Estudiante[];
  currentUser?: Usuario | null;
  onRefreshData: () => void;
}

export const StudentPromotionManager: React.FC<StudentPromotionManagerProps> = ({
  anos,
  secciones,
  estudiantes,
  currentUser,
  onRefreshData,
}) => {
  const isAuthorized = currentUser?.rol === 'director' || currentUser?.rol === 'coordinador';

  const sortedAnos = useMemo(() => [...anos].sort((a, b) => a.idAno - b.idAno), [anos]);

  const [anioOrigenId, setAnioOrigenId] = useState<number>(sortedAnos[0]?.idAno || 1);
  const [seccionOrigenId, setSeccionOrigenId] = useState<number>(0);

  const [anioDestinoId, setAnioDestinoId] = useState<number | 'EGRESADO'>(() => {
    const first = sortedAnos[0]?.idAno;
    const next = sortedAnos.find((a) => a.idAno > (first || 0));
    return next ? next.idAno : 'EGRESADO';
  });
  const [seccionDestinoId, setSeccionDestinoId] = useState<number>(0);

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [confirmOpen, setConfirmOpen] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Sincronizar año origen inicial si cambia catálogo
  useEffect(() => {
    if (sortedAnos.length > 0 && !sortedAnos.some((a) => a.idAno === anioOrigenId)) {
      setAnioOrigenId(sortedAnos[0].idAno);
    }
  }, [sortedAnos, anioOrigenId]);

  const seccionesOrigen = useMemo(
    () => secciones.filter((s) => s.idAno === anioOrigenId),
    [secciones, anioOrigenId]
  );

  // Sincronizar sección origen cuando cambia año origen
  useEffect(() => {
    if (seccionesOrigen.length > 0) {
      const exists = seccionesOrigen.some((s) => s.idSeccion === seccionOrigenId);
      if (!exists && seccionOrigenId !== 0) {
        setSeccionOrigenId(seccionesOrigen[0].idSeccion);
      }
    } else {
      setSeccionOrigenId(0);
    }
  }, [seccionesOrigen, seccionOrigenId]);

  // Sugerir automáticamente siguiente año escolar al cambiar origen
  useEffect(() => {
    const idx = sortedAnos.findIndex((a) => a.idAno === anioOrigenId);
    if (idx !== -1 && idx + 1 < sortedAnos.length) {
      setAnioDestinoId(sortedAnos[idx + 1].idAno);
    } else if (sortedAnos.length > 0) {
      setAnioDestinoId('EGRESADO');
    }
  }, [anioOrigenId, sortedAnos]);

  const seccionesDestino = useMemo(
    () => (anioDestinoId === 'EGRESADO' ? [] : secciones.filter((s) => s.idAno === anioDestinoId)),
    [secciones, anioDestinoId]
  );

  // Seleccionar primera sección destino válida
  useEffect(() => {
    if (anioDestinoId === 'EGRESADO') {
      setSeccionDestinoId(0);
      return;
    }
    if (seccionesDestino.length > 0) {
      const exists = seccionesDestino.some((s) => s.idSeccion === seccionDestinoId);
      if (!exists) {
        // Intentar mantener el mismo nombre de sección (ej. "A" -> "A")
        const origenSecObj = secciones.find((s) => s.idSeccion === seccionOrigenId);
        const sameNameSec = origenSecObj
          ? seccionesDestino.find(
              (s) => s.nombreSeccion.toLowerCase() === origenSecObj.nombreSeccion.toLowerCase()
            )
          : null;
        setSeccionDestinoId(sameNameSec ? sameNameSec.idSeccion : seccionesDestino[0].idSeccion);
      }
    } else {
      setSeccionDestinoId(0);
    }
  }, [anioDestinoId, seccionesDestino, seccionDestinoId, seccionOrigenId, secciones]);

  // Alumnos activos en el Año/Sección origen
  const originStudents = useMemo(() => {
    const filtered = estudiantes.filter((e) => {
      if (e.estadoAcademico === 'EGRESADO') return false;
      if (e.idAnoActual !== anioOrigenId) return false;
      if (seccionOrigenId !== 0 && e.idSeccion !== seccionOrigenId) return false;
      return true;
    });
    return sortStudentsByCedula(filtered);
  }, [estudiantes, anioOrigenId, seccionOrigenId]);

  // Marcar todos por defecto cuando cambia la lista de origen
  useEffect(() => {
    setSelectedIds(originStudents.map((s) => s.idEstudiante));
    setConfirmOpen(false);
  }, [originStudents]);

  const visibleStudents = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return originStudents;
    return originStudents.filter(
      (s) =>
        `${s.nombres} ${s.apellidos}`.toLowerCase().includes(term) ||
        `${s.apellidos}, ${s.nombres}`.toLowerCase().includes(term) ||
        s.cedula.toLowerCase().includes(term)
    );
  }, [originStudents, searchTerm]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const egresadosCount = useMemo(
    () => estudiantes.filter((e) => e.estadoAcademico === 'EGRESADO').length,
    [estudiantes]
  );

  const toggleStudent = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const selectAllOrigin = () => setSelectedIds(originStudents.map((s) => s.idEstudiante));
  const deselectAllOrigin = () => setSelectedIds([]);

  const isSameOriginAndDest =
    anioDestinoId !== 'EGRESADO' &&
    anioOrigenId === anioDestinoId &&
    seccionOrigenId !== 0 &&
    seccionOrigenId === seccionDestinoId;

  const canSubmit =
    isAuthorized &&
    selectedIds.length > 0 &&
    !isSameOriginAndDest &&
    (anioDestinoId === 'EGRESADO' || seccionDestinoId > 0);

  const origenAnoLabel =
    sortedAnos.find((a) => a.idAno === anioOrigenId)?.nombreNivel || 'Año Origen';
  const origenSecLabel =
    seccionOrigenId === 0
      ? 'Todas las secciones'
      : `Sección ${seccionesOrigen.find((s) => s.idSeccion === seccionOrigenId)?.nombreSeccion || ''}`;

  const destinoLabel =
    anioDestinoId === 'EGRESADO'
      ? 'EGRESADO (Culminación de Estudios)'
      : `${sortedAnos.find((a) => a.idAno === anioDestinoId)?.nombreNivel || ''} — Sección "${
          seccionesDestino.find((s) => s.idSeccion === seccionDestinoId)?.nombreSeccion || ''
        }"`;

  const handleExecutePromotion = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await promoverEstudiantes({
        anioOrigenId,
        seccionOrigenId: seccionOrigenId || null,
        anioDestinoId,
        seccionDestinoId: anioDestinoId === 'EGRESADO' ? null : seccionDestinoId,
        estudiantesIds: selectedIds,
      });
      setFeedback({ type: 'success', text: res.message });
      setConfirmOpen(false);
      onRefreshData();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err?.message || 'Error ejecutando la promoción masiva de estudiantes.',
      });
      setConfirmOpen(false);
    } finally {
      setSubmitting(false);
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
      {/* Encabezado y Configuración Origen -> Destino */}
      <div className="bg-white dark:bg-[#121212] p-5 rounded-2xl border border-slate-200 dark:border-[#27272A] shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 rounded-xl">
              <GraduationCap className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-[#F4F4F5]">
                Promoción Masiva de Año Escolar
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Transfiere secciones completas al siguiente grado o egresa promociones en una transacción atómica preservando el historial de asistencia.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono tabular-nums">
            <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-[#181818] text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-[#27272A] font-semibold">
              Egresados históricos: {egresadosCount}
            </span>
          </div>
        </div>

        {/* Selectores Origen -> Destino */}
        <div className="grid grid-cols-1 lg:grid-cols-11 gap-4 items-stretch pt-4 border-t border-slate-100 dark:border-[#27272A]">
          {/* Bloque Origen */}
          <div className="lg:col-span-5 p-4 rounded-xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] space-y-3">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
              1. Grupo de Origen (Actual)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                  Año Escolar Origen
                </label>
                <select
                  value={anioOrigenId}
                  onChange={(e) => {
                    setAnioOrigenId(Number(e.target.value));
                    setSeccionOrigenId(0);
                    setFeedback(null);
                  }}
                  className="w-full min-h-[42px] bg-white dark:bg-[#121212] border border-slate-200 dark:border-[#27272A] rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 dark:text-[#F4F4F5] focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  {sortedAnos.map((ano) => (
                    <option key={ano.idAno} value={ano.idAno}>
                      {ano.nombreNivel}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                  Sección Origen
                </label>
                <select
                  value={seccionOrigenId}
                  onChange={(e) => {
                    setSeccionOrigenId(Number(e.target.value));
                    setFeedback(null);
                  }}
                  className="w-full min-h-[42px] bg-white dark:bg-[#121212] border border-slate-200 dark:border-[#27272A] rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 dark:text-[#F4F4F5] focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value={0}>Todas las secciones</option>
                  {seccionesOrigen.map((sec) => (
                    <option key={sec.idSeccion} value={sec.idSeccion}>
                      Sección {sec.nombreSeccion}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Separador Visual */}
          <div className="lg:col-span-1 flex items-center justify-center">
            <div className="w-9 h-9 rounded-full bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 flex items-center justify-center rotate-90 lg:rotate-0">
              <ArrowRight className="w-4 h-4" />
            </div>
          </div>

          {/* Bloque Destino */}
          <div className="lg:col-span-5 p-4 rounded-xl bg-indigo-50/40 dark:bg-indigo-950/20 border border-indigo-200/80 dark:border-indigo-900/50 space-y-3">
            <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
              2. Destino de Promoción
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                  Año Destino / Egreso
                </label>
                <select
                  value={anioDestinoId}
                  onChange={(e) => {
                    const val = e.target.value;
                    setAnioDestinoId(val === 'EGRESADO' ? 'EGRESADO' : Number(val));
                    setFeedback(null);
                  }}
                  className="w-full min-h-[42px] bg-white dark:bg-[#121212] border border-slate-200 dark:border-[#27272A] rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 dark:text-[#F4F4F5] focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  {sortedAnos.map((ano) => (
                    <option key={ano.idAno} value={ano.idAno}>
                      {ano.nombreNivel}
                    </option>
                  ))}
                  <option value="EGRESADO">EGRESADO (Culminación de Estudios)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                  Sección Destino
                </label>
                {anioDestinoId === 'EGRESADO' ? (
                  <div className="min-h-[42px] px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs font-bold text-emerald-700 dark:text-emerald-300 flex items-center">
                    Sin sección (Egresado)
                  </div>
                ) : (
                  <select
                    value={seccionDestinoId}
                    onChange={(e) => {
                      setSeccionDestinoId(Number(e.target.value));
                      setFeedback(null);
                    }}
                    className="w-full min-h-[42px] bg-white dark:bg-[#121212] border border-slate-200 dark:border-[#27272A] rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 dark:text-[#F4F4F5] focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                  >
                    {seccionesDestino.length === 0 ? (
                      <option value={0}>Cree una sección en el año destino</option>
                    ) : (
                      seccionesDestino.map((sec) => (
                        <option key={sec.idSeccion} value={sec.idSeccion}>
                          Sección {sec.nombreSeccion}
                        </option>
                      ))
                    )}
                  </select>
                )}
              </div>
            </div>
          </div>
        </div>

        {isSameOriginAndDest && (
          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>El año y la sección de destino coinciden exactamente con el grupo de origen. Seleccione un nivel o sección diferente.</span>
          </div>
        )}
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

      {/* Checklist de Estudiantes */}
      <div className="bg-white dark:bg-[#121212] rounded-2xl border border-slate-200 dark:border-[#27272A] shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 dark:border-[#27272A] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span className="font-bold text-sm text-slate-900 dark:text-[#F4F4F5]">
                Nómina a Promover ({selectedIds.length} de {originStudents.length} seleccionados)
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
              Todos los alumnos vienen marcados por defecto. Desmarque únicamente a los repitientes o retirados.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Filtrar alumno o cédula..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-800 dark:text-[#F4F4F5] focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <button
              type="button"
              onClick={selectAllOrigin}
              disabled={originStudents.length === 0}
              className="px-3 py-1.5 min-h-[36px] rounded-lg text-xs font-bold bg-slate-100 dark:bg-[#181818] text-slate-700 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-[#27272A] flex items-center gap-1 cursor-pointer disabled:opacity-50"
            >
              <CheckSquare className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>Marcar todos</span>
            </button>
            <button
              type="button"
              onClick={deselectAllOrigin}
              disabled={originStudents.length === 0}
              className="px-3 py-1.5 min-h-[36px] rounded-lg text-xs font-bold bg-slate-100 dark:bg-[#181818] text-slate-600 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-[#27272A] flex items-center gap-1 cursor-pointer disabled:opacity-50"
            >
              <Square className="w-3.5 h-3.5" />
              <span>Desmarcar</span>
            </button>
          </div>
        </div>

        {originStudents.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-500 dark:text-zinc-400">
            No hay estudiantes activos registrados en <strong>{origenAnoLabel}</strong> ({origenSecLabel}).
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-[#27272A] max-h-[420px] overflow-y-auto">
            {visibleStudents.map((st, idx) => {
              const checked = selectedSet.has(st.idEstudiante);
              return (
                <label
                  key={st.idEstudiante}
                  className={`flex items-center justify-between gap-3 px-4 py-3 cursor-pointer transition-colors ${
                    checked
                      ? 'bg-indigo-50/30 dark:bg-indigo-950/15 hover:bg-indigo-50/60 dark:hover:bg-indigo-950/25'
                      : 'bg-white dark:bg-[#121212] opacity-75 hover:opacity-100 hover:bg-slate-50 dark:hover:bg-[#181818]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleStudent(st.idEstudiante)}
                      className="w-4 h-4 rounded text-indigo-600 border-slate-300 dark:border-zinc-600 focus:ring-indigo-500 cursor-pointer shrink-0"
                    />
                    <span className="font-mono tabular-nums text-xs font-bold text-slate-400 w-7 shrink-0">
                      #{idx + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 dark:text-[#F4F4F5] truncate">
                        {st.apellidos}, {st.nombres}
                      </p>
                      <p className="font-mono text-xs text-slate-500 dark:text-zinc-400">
                        {formatCedula(st.cedula)}
                        {st.nombreSeccion ? ` · Sección ${st.nombreSeccion}` : ''}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold shrink-0 border ${
                      checked
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                        : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                    }`}
                  >
                    {checked ? 'Se promueve' : 'Permanece (Repitiente/Retirado)'}
                  </span>
                </label>
              );
            })}
          </div>
        )}

        {/* Footer de Ejecución */}
        <div className="p-4 bg-slate-50/80 dark:bg-[#181818] border-t border-slate-200 dark:border-[#27272A] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs text-slate-600 dark:text-zinc-400 space-y-0.5">
            <div>
              <strong>Destino:</strong> {destinoLabel}
            </div>
            <div className="font-mono tabular-nums">
              {selectedIds.length} a promover · {originStudents.length - selectedIds.length} sin cambios
            </div>
          </div>

          {confirmOpen ? (
            <div className="flex flex-wrap items-center gap-2 p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800">
              <span className="text-xs font-bold text-indigo-900 dark:text-indigo-200 px-1">
                ¿Confirmar promoción de {selectedIds.length} alumno(s)?
              </span>
              <button
                type="button"
                onClick={handleExecutePromotion}
                disabled={submitting}
                className="px-4 py-2 min-h-[40px] rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{submitting ? 'Procesando...' : 'Sí, Confirmar Promoción'}</span>
              </button>
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={submitting}
                className="px-3 py-2 min-h-[40px] rounded-lg text-xs font-bold bg-white dark:bg-[#27272A] text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-[#3F3F46] cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              disabled={!canSubmit || submitting}
              className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              <GraduationCap className="w-4 h-4" />
              <span>Ejecutar Promoción de Sección</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
