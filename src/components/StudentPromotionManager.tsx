import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  GraduationCap,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Search,
  Users,
  ShieldAlert,
  Loader2,
  CheckSquare,
  Square,
  History,
  ArrowDownWideNarrow,
} from 'lucide-react';
import type {
  AnoEscolar,
  Seccion,
  Estudiante,
  Usuario,
  EstadoPromocionesCicloResponse,
} from '../types.ts';
import { fetchEstadoPromocionesCiclo, promoverEstudiantes } from '../lib/api.ts';
import { formatCedula, sortStudentsByCedula } from '../lib/utils.ts';

interface StudentPromotionManagerProps {
  anos: AnoEscolar[];
  secciones: Seccion[];
  estudiantes: Estudiante[];
  currentUser?: Usuario | null;
  onRefreshData: () => Promise<void> | void;
}

export const StudentPromotionManager: React.FC<StudentPromotionManagerProps> = ({
  anos,
  secciones,
  estudiantes,
  currentUser,
  onRefreshData,
}) => {
  const isAuthorized = currentUser?.rol === 'director' || currentUser?.rol === 'coordinador';

  const sortedAnosAsc = useMemo(() => [...anos].sort((a, b) => a.idAno - b.idAno), [anos]);
  const sortedAnosDesc = useMemo(() => [...anos].sort((a, b) => b.idAno - a.idAno), [anos]);

  // Iniciar siempre por el último año escolar que aún tenga estudiantes activos (orden inverso)
  const recommendedStartAnoId = useMemo(() => {
    const highestWithActive = sortedAnosDesc.find((ano) =>
      estudiantes.some((e) => e.estadoAcademico === 'ACTIVO' && e.idAnoActual === ano.idAno)
    );
    return highestWithActive?.idAno || sortedAnosDesc[0]?.idAno || 1;
  }, [sortedAnosDesc, estudiantes]);

  const [anioOrigenId, setAnioOrigenId] = useState<number>(recommendedStartAnoId);
  const [seccionOrigenId, setSeccionOrigenId] = useState<number>(() => {
    const secs = secciones.filter((s) => s.idAno === recommendedStartAnoId);
    return secs[0]?.idSeccion || 0;
  });

  const [anioDestinoId, setAnioDestinoId] = useState<number | 'EGRESADO'>(() => {
    const idx = sortedAnosAsc.findIndex((a) => a.idAno === recommendedStartAnoId);
    if (idx !== -1 && idx + 1 < sortedAnosAsc.length) {
      return sortedAnosAsc[idx + 1].idAno;
    }
    return 'EGRESADO';
  });
  const [seccionDestinoId, setSeccionDestinoId] = useState<number>(0);

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [confirmOpen, setConfirmOpen] = useState<boolean>(false);
  const [doubleConfirmChecked, setDoubleConfirmChecked] = useState<boolean>(false);
  const [backendWarnings, setBackendWarnings] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [estadoCiclo, setEstadoCiclo] = useState<EstadoPromocionesCicloResponse | null>(null);
  const [loadingEstado, setLoadingEstado] = useState<boolean>(false);

  const loadEstadoCiclo = useCallback(async () => {
    if (!isAuthorized) return;
    setLoadingEstado(true);
    try {
      const data = await fetchEstadoPromocionesCiclo();
      setEstadoCiclo(data);
    } catch {
      // Silencioso; la validación principal también se ejecuta en servidor
    } finally {
      setLoadingEstado(false);
    }
  }, [isAuthorized]);

  useEffect(() => {
    loadEstadoCiclo();
  }, [loadEstadoCiclo]);

  // Sincronizar año origen inicial si cambia catálogo
  useEffect(() => {
    if (sortedAnosDesc.length > 0 && !sortedAnosDesc.some((a) => a.idAno === anioOrigenId)) {
      setAnioOrigenId(recommendedStartAnoId);
    }
  }, [sortedAnosDesc, anioOrigenId, recommendedStartAnoId]);

  const seccionesOrigen = useMemo(
    () => secciones.filter((s) => s.idAno === anioOrigenId),
    [secciones, anioOrigenId]
  );

  // Exigir estrictamente 1 sección válida (nunca 0 / "Todas")
  useEffect(() => {
    if (seccionesOrigen.length > 0) {
      const exists = seccionesOrigen.some((s) => s.idSeccion === seccionOrigenId);
      if (!exists) {
        setSeccionOrigenId(seccionesOrigen[0].idSeccion);
      }
    } else {
      setSeccionOrigenId(0);
    }
  }, [seccionesOrigen, seccionOrigenId]);

  // Sugerir automáticamente siguiente año escolar al cambiar origen
  useEffect(() => {
    const idx = sortedAnosAsc.findIndex((a) => a.idAno === anioOrigenId);
    if (idx !== -1 && idx + 1 < sortedAnosAsc.length) {
      setAnioDestinoId(sortedAnosAsc[idx + 1].idAno);
    } else if (sortedAnosAsc.length > 0) {
      setAnioDestinoId('EGRESADO');
    }
  }, [anioOrigenId, sortedAnosAsc]);

  const seccionesDestino = useMemo(
    () => (anioDestinoId === 'EGRESADO' ? [] : secciones.filter((s) => s.idAno === anioDestinoId)),
    [secciones, anioDestinoId]
  );

  // Seleccionar una única sección destino válida (coincidiendo letra cuando exista)
  useEffect(() => {
    if (anioDestinoId === 'EGRESADO') {
      setSeccionDestinoId(0);
      return;
    }
    if (seccionesDestino.length > 0) {
      const origenSecObj = secciones.find((s) => s.idSeccion === seccionOrigenId);
      const sameNameSec = origenSecObj
        ? seccionesDestino.find(
            (s) => s.nombreSeccion.toLowerCase() === origenSecObj.nombreSeccion.toLowerCase()
          )
        : null;
      const exists = seccionesDestino.some((s) => s.idSeccion === seccionDestinoId);
      if (!exists) {
        setSeccionDestinoId(sameNameSec ? sameNameSec.idSeccion : seccionesDestino[0].idSeccion);
      } else if (sameNameSec && seccionDestinoId !== sameNameSec.idSeccion) {
        // Mantener sección homóloga al cambiar sección origen
        setSeccionDestinoId(sameNameSec.idSeccion);
      }
    } else {
      setSeccionDestinoId(0);
    }
  }, [anioDestinoId, seccionesDestino, seccionDestinoId, seccionOrigenId, secciones]);

  // Alumnos activos estrictamente de esa ÚNICA sección de origen
  const originStudents = useMemo(() => {
    if (!seccionOrigenId) return [];
    const filtered = estudiantes.filter((e) => {
      if (e.estadoAcademico === 'EGRESADO' || e.estadoAcademico === 'RETIRADO') return false;
      if (e.idAnoActual !== anioOrigenId) return false;
      if (e.idSeccion !== seccionOrigenId) return false;
      return true;
    });
    return sortStudentsByCedula(filtered);
  }, [estudiantes, anioOrigenId, seccionOrigenId]);

  // Marcar todos por defecto cuando cambia la lista de origen
  useEffect(() => {
    setSelectedIds(originStudents.map((s) => s.idEstudiante));
    setConfirmOpen(false);
    setDoubleConfirmChecked(false);
    setBackendWarnings([]);
  }, [originStudents]);

  // Resetear confirmación doble si cambia origen o destino
  useEffect(() => {
    setConfirmOpen(false);
    setDoubleConfirmChecked(false);
    setBackendWarnings([]);
  }, [anioOrigenId, seccionOrigenId, anioDestinoId, seccionDestinoId]);

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

  // Conteo de activos por año para mostrar progreso descendente
  const activeCountByYear = useMemo(() => {
    const map = new Map<number, number>();
    for (const est of estudiantes) {
      if (est.estadoAcademico === 'ACTIVO' && est.idAnoActual) {
        map.set(est.idAnoActual, (map.get(est.idAnoActual) || 0) + 1);
      }
    }
    return map;
  }, [estudiantes]);

  // Evaluar advertencias de orden inverso y riesgo de cascada en cliente
  const clientWarnings = useMemo(() => {
    const list: string[] = [];
    const origenAnoObj = sortedAnosAsc.find((a) => a.idAno === anioOrigenId);
    const origenSecObj = seccionesOrigen.find((s) => s.idSeccion === seccionOrigenId);

    const higherPending = sortedAnosDesc.filter(
      (a) => a.idAno > anioOrigenId && (activeCountByYear.get(a.idAno) || 0) > 0
    );
    if (higherPending.length > 0) {
      list.push(
        `Orden inverso incumplido: ${higherPending.map((a) => a.nombreNivel).join(', ')} aún tiene(n) estudiantes activos sin promover. Inicie siempre por el último año hacia 1er Año.`
      );
    }

    if (estadoCiclo && origenAnoObj && origenSecObj) {
      const originKey = `${anioOrigenId}-${seccionOrigenId}`;
      if (estadoCiclo.origenesPromovidosKeys.includes(originKey)) {
        list.push(
          `Esta sección (${origenAnoObj.nombreNivel} — Sección "${origenSecObj.nombreSeccion}") ya registró una promoción en el ciclo ${estadoCiclo.cicloActual}.`
        );
      }
      if (estadoCiclo.destinosConPromocionesKeys.includes(originKey)) {
        list.push(
          `Riesgo de doble promoción en cascada: ${origenAnoObj.nombreNivel} — Sección "${origenSecObj.nombreSeccion}" ya recibió estudiantes promovidos en el ciclo ${estadoCiclo.cicloActual}.`
        );
      }
    }

    if (anioDestinoId !== 'EGRESADO' && seccionDestinoId > 0) {
      const destAnoObj = sortedAnosAsc.find((a) => a.idAno === anioDestinoId);
      const destSecObj = seccionesDestino.find((s) => s.idSeccion === seccionDestinoId);

      if (destAnoObj && origenAnoObj && destAnoObj.idAno < origenAnoObj.idAno) {
        list.push(
          `El año destino (${destAnoObj.nombreNivel}) es inferior al año origen (${origenAnoObj.nombreNivel}).`
        );
      }

      if (estadoCiclo && destAnoObj && destSecObj) {
        const destKey = `${anioDestinoId}-${seccionDestinoId}`;
        if (estadoCiclo.destinosConPromocionesKeys.includes(destKey)) {
          list.push(
            `La sección destino (${destAnoObj.nombreNivel} — Sección "${destSecObj.nombreSeccion}") ya recibió alumnos promovidos durante el ciclo ${estadoCiclo.cicloActual}.`
          );
        }
      }

      const destActiveCount = estudiantes.filter(
        (e) =>
          e.estadoAcademico === 'ACTIVO' &&
          e.idAnoActual === anioDestinoId &&
          e.idSeccion === seccionDestinoId
      ).length;
      if (destActiveCount > 0 && destAnoObj && destSecObj) {
        list.push(
          `La sección destino (${destAnoObj.nombreNivel} — Sección "${destSecObj.nombreSeccion}") aún contiene ${destActiveCount} estudiante(s) activo(s) sin promover.`
        );
      }
    }

    return list;
  }, [
    sortedAnosAsc,
    sortedAnosDesc,
    anioOrigenId,
    seccionOrigenId,
    anioDestinoId,
    seccionDestinoId,
    seccionesOrigen,
    seccionesDestino,
    activeCountByYear,
    estadoCiclo,
    estudiantes,
  ]);

  const activeWarnings = backendWarnings.length > 0 ? backendWarnings : clientWarnings;
  const requiresDoubleConfirm = activeWarnings.length > 0;

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
    seccionOrigenId > 0 &&
    seccionOrigenId === seccionDestinoId;

  const canSubmit =
    isAuthorized &&
    anioOrigenId > 0 &&
    seccionOrigenId > 0 &&
    selectedIds.length > 0 &&
    !isSameOriginAndDest &&
    (anioDestinoId === 'EGRESADO' || seccionDestinoId > 0);

  const origenAnoLabel =
    sortedAnosAsc.find((a) => a.idAno === anioOrigenId)?.nombreNivel || 'Año Origen';
  const origenSecLabel =
    seccionOrigenId > 0
      ? `Sección ${seccionesOrigen.find((s) => s.idSeccion === seccionOrigenId)?.nombreSeccion || ''}`
      : 'Sin sección';

  const destinoLabel =
    anioDestinoId === 'EGRESADO'
      ? 'EGRESADO (Culminación de Estudios)'
      : `${sortedAnosAsc.find((a) => a.idAno === anioDestinoId)?.nombreNivel || ''} — Sección "${
          seccionesDestino.find((s) => s.idSeccion === seccionDestinoId)?.nombreSeccion || ''
        }"`;

  const handleExecutePromotion = async () => {
    if (!canSubmit) return;
    if (requiresDoubleConfirm && !doubleConfirmChecked) return;

    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await promoverEstudiantes({
        anioOrigenId,
        seccionOrigenId,
        anioDestinoId,
        seccionDestinoId: anioDestinoId === 'EGRESADO' ? null : seccionDestinoId,
        estudiantesIds: selectedIds,
        confirmarDoble: requiresDoubleConfirm && doubleConfirmChecked,
      });
      setFeedback({ type: 'success', text: res.message });
      setConfirmOpen(false);
      setDoubleConfirmChecked(false);
      setBackendWarnings([]);
      await onRefreshData();
      await loadEstadoCiclo();
    } catch (err: any) {
      if (err?.status === 409 && err?.code === 'PROMOTION_DOUBLE_CONFIRM_REQUIRED') {
        setBackendWarnings(
          Array.isArray(err.warnings) && err.warnings.length > 0
            ? err.warnings
            : [err.message || 'Se requiere confirmación doble para esta promoción.']
        );
        setDoubleConfirmChecked(false);
        setConfirmOpen(true);
        setFeedback({
          type: 'error',
          text: 'Se detectaron advertencias de orden inverso o ciclo repetido. Revise el detalle y confirme explícitamente para continuar.',
        });
      } else {
        setFeedback({
          type: 'error',
          text: err?.message || 'Error ejecutando la promoción masiva de estudiantes.',
        });
        setConfirmOpen(false);
      }
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
      {/* Banner Obligatorio de Orden Inverso */}
      <div className="bg-amber-50/90 dark:bg-amber-950/25 border border-amber-300 dark:border-amber-800/80 rounded-2xl p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 shrink-0">
            <ArrowDownWideNarrow className="w-5 h-5" />
          </div>
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-xs sm:text-sm font-bold text-amber-950 dark:text-amber-200">
                Regla Obligatoria: Promoción en Orden Inverso y Por Sección Individual
              </h4>
              {estadoCiclo?.cicloActual && (
                <span className="px-2 py-0.5 rounded-md bg-amber-200/70 dark:bg-amber-900/70 text-[11px] font-mono font-bold text-amber-950 dark:text-amber-100">
                  Ciclo {estadoCiclo.cicloActual}
                </span>
              )}
            </div>
            <p className="text-xs text-amber-900/90 dark:text-amber-200/90 leading-relaxed">
              Inicie siempre por el <strong>último año escolar</strong> (ej.{' '}
              <strong>5to Año → Egresados</strong>) y descienda año por año hasta{' '}
              <strong>1er Año</strong>. Seleccione estrictamente{' '}
              <strong>1 año y 1 sección de origen</strong> por operación para evitar vaciar
              secciones completas o provocar promociones múltiples en cascada.
            </p>
          </div>
        </div>

        {/* Secuencia Descendente Interactiva */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 pt-1">
          {sortedAnosDesc.map((ano, idx) => {
            const activeCount = activeCountByYear.get(ano.idAno) || 0;
            const isSelected = ano.idAno === anioOrigenId;
            const isRecommended = ano.idAno === recommendedStartAnoId && activeCount > 0;
            return (
              <button
                key={ano.idAno}
                type="button"
                onClick={() => {
                  setAnioOrigenId(ano.idAno);
                  const secs = secciones.filter((s) => s.idAno === ano.idAno);
                  setSeccionOrigenId(secs[0]?.idSeccion || 0);
                  setFeedback(null);
                }}
                className={`text-left px-3 py-2 rounded-xl border transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                    : 'bg-white/90 dark:bg-[#121212] text-slate-800 dark:text-zinc-200 border-amber-200/80 dark:border-[#27272A] hover:border-indigo-400'
                }`}
              >
                <div className="flex items-center justify-between gap-1 text-[10px] font-bold uppercase tracking-wider opacity-85">
                  <span>Paso {idx + 1}</span>
                  <span>
                    {activeCount === 0 ? 'Vacío' : isRecommended ? 'Sugerido' : `${activeCount} act.`}
                  </span>
                </div>
                <div className="text-xs font-bold truncate mt-0.5">{ano.nombreNivel}</div>
              </button>
            );
          })}
        </div>
      </div>

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
                Transfiere una única sección de origen al siguiente grado o egreso en transacción
                atómica, conservando todo el historial de asistencias.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono tabular-nums">
            <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-[#181818] text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-[#27272A] font-semibold">
              Egresados históricos: {egresadosCount}
            </span>
          </div>
        </div>

        {/* Selectores Origen (estrictamente 1 año y 1 sección) -> Destino */}
        <div className="grid grid-cols-1 lg:grid-cols-11 gap-4 items-stretch pt-4 border-t border-slate-100 dark:border-[#27272A]">
          {/* Bloque Origen */}
          <div className="lg:col-span-5 p-4 rounded-xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] space-y-3">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
              1. Grupo de Origen (1 Año y 1 Sección)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                  Año Escolar Origen (Orden Inverso)
                </label>
                <select
                  value={anioOrigenId}
                  onChange={(e) => {
                    const nextAnoId = Number(e.target.value);
                    setAnioOrigenId(nextAnoId);
                    const nextSecs = secciones.filter((s) => s.idAno === nextAnoId);
                    setSeccionOrigenId(nextSecs[0]?.idSeccion || 0);
                    setFeedback(null);
                  }}
                  className="w-full min-h-[42px] bg-white dark:bg-[#121212] border border-slate-200 dark:border-[#27272A] rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 dark:text-[#F4F4F5] focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  {sortedAnosDesc.map((ano, idx) => (
                    <option key={ano.idAno} value={ano.idAno}>
                      {idx === 0 ? `${ano.nombreNivel} (Último año)` : ano.nombreNivel}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                  Sección Origen (Única)
                </label>
                <select
                  value={seccionOrigenId}
                  onChange={(e) => {
                    setSeccionOrigenId(Number(e.target.value));
                    setFeedback(null);
                  }}
                  className="w-full min-h-[42px] bg-white dark:bg-[#121212] border border-slate-200 dark:border-[#27272A] rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 dark:text-[#F4F4F5] focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  {seccionesOrigen.length === 0 ? (
                    <option value={0}>Sin secciones disponibles</option>
                  ) : (
                    seccionesOrigen.map((sec) => {
                      const count = estudiantes.filter(
                        (e) =>
                          e.estadoAcademico === 'ACTIVO' &&
                          e.idAnoActual === anioOrigenId &&
                          e.idSeccion === sec.idSeccion
                      ).length;
                      return (
                        <option key={sec.idSeccion} value={sec.idSeccion}>
                          Sección {sec.nombreSeccion} ({count} activos)
                        </option>
                      );
                    })
                  )}
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
              2. Destino Único de Promoción
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
                  {sortedAnosDesc.map((ano) => (
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
            <span>
              El año y la sección de destino coinciden exactamente con el grupo de origen.
              Seleccione un nivel o sección diferente.
            </span>
          </div>
        )}

        {/* Alertas de Orden Inverso / Doble Promoción / Destino Ocupado */}
        {activeWarnings.length > 0 && (
          <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/70 space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-bold text-rose-800 dark:text-rose-300">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Advertencias de Seguridad Operativa (Requiere Confirmación Doble)</span>
            </div>
            <ul className="list-disc pl-5 space-y-1 text-xs text-rose-700 dark:text-rose-300/95">
              {activeWarnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
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
              Mostrando únicamente estudiantes activos de <strong>{origenAnoLabel}</strong> (
              {origenSecLabel}). Desmarque solo repitientes o retirados.
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
            No hay estudiantes activos registrados en <strong>{origenAnoLabel}</strong> (
            {origenSecLabel}).
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
        <div className="p-4 bg-slate-50/80 dark:bg-[#181818] border-t border-slate-200 dark:border-[#27272A] flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs text-slate-600 dark:text-zinc-400 space-y-0.5">
              <div>
                <strong>Origen:</strong> {origenAnoLabel} ({origenSecLabel}) →{' '}
                <strong>Destino:</strong> {destinoLabel}
              </div>
              <div className="font-mono tabular-nums">
                {selectedIds.length} a promover · {originStudents.length - selectedIds.length} sin
                cambios
              </div>
            </div>

            {!confirmOpen && (
              <button
                type="button"
                onClick={() => {
                  setDoubleConfirmChecked(false);
                  setConfirmOpen(true);
                }}
                disabled={!canSubmit || submitting}
                className={`w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-white shadow-sm flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer ${
                  requiresDoubleConfirm
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                <GraduationCap className="w-4 h-4" />
                <span>
                  {requiresDoubleConfirm
                    ? 'Revisar Advertencias y Promover'
                    : 'Ejecutar Promoción de Sección'}
                </span>
              </button>
            )}
          </div>

          {confirmOpen && (
            <div
              className={`p-3.5 rounded-xl border space-y-3 ${
                requiresDoubleConfirm
                  ? 'bg-rose-50 dark:bg-rose-950/35 border-rose-300 dark:border-rose-800'
                  : 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span
                  className={`text-xs font-bold ${
                    requiresDoubleConfirm
                      ? 'text-rose-900 dark:text-rose-200'
                      : 'text-indigo-900 dark:text-indigo-200'
                  }`}
                >
                  {requiresDoubleConfirm
                    ? `Confirmación Doble Requerida: promover ${selectedIds.length} alumno(s) de ${origenAnoLabel} (${origenSecLabel}) → ${destinoLabel}`
                    : `¿Confirmar promoción de ${selectedIds.length} alumno(s) hacia ${destinoLabel}?`}
                </span>
              </div>

              {requiresDoubleConfirm && (
                <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-white/80 dark:bg-[#121212] border border-rose-200 dark:border-rose-900/70 cursor-pointer text-xs text-slate-800 dark:text-zinc-200 font-semibold">
                  <input
                    type="checkbox"
                    checked={doubleConfirmChecked}
                    onChange={(e) => setDoubleConfirmChecked(e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded text-rose-600 border-slate-300 focus:ring-rose-500 cursor-pointer shrink-0"
                  />
                  <span>
                    Confirmo que verifiqué el orden inverso y las advertencias anteriores, y autorizo
                    ejecutar esta promoción masiva bajo mi responsabilidad.
                  </span>
                </label>
              )}

              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setConfirmOpen(false);
                    setDoubleConfirmChecked(false);
                  }}
                  disabled={submitting}
                  className="px-3.5 py-2 min-h-[40px] rounded-lg text-xs font-bold bg-white dark:bg-[#27272A] text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-[#3F3F46] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleExecutePromotion}
                  disabled={submitting || (requiresDoubleConfirm && !doubleConfirmChecked)}
                  className={`px-4 py-2 min-h-[40px] rounded-lg text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                    requiresDoubleConfirm
                      ? 'bg-rose-600 hover:bg-rose-700'
                      : 'bg-indigo-600 hover:bg-indigo-700'
                  }`}
                >
                  {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>
                    {submitting
                      ? 'Procesando...'
                      : requiresDoubleConfirm
                      ? 'Confirmar Doble y Promover'
                      : 'Sí, Confirmar Promoción'}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Historial de Promociones del Ciclo Actual (Auditoría) */}
      <div className="bg-white dark:bg-[#121212] rounded-2xl border border-slate-200 dark:border-[#27272A] shadow-xs p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-slate-500 dark:text-zinc-400" />
            <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-[#F4F4F5]">
              Registro de Promociones del Ciclo ({estadoCiclo?.cicloActual || 'Actual'})
            </h4>
          </div>
          {loadingEstado && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
        </div>

        {!estadoCiclo || estadoCiclo.promociones.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-zinc-400">
            Aún no se han ejecutado promociones masivas registradas en el ciclo escolar actual.
          </p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-[#27272A] max-h-56 overflow-y-auto">
            {estadoCiclo.promociones.map((item) => (
              <div
                key={item.idLog}
                className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-xs"
              >
                <div className="min-w-0">
                  <span className="font-bold text-slate-900 dark:text-[#F4F4F5]">
                    {item.anioOrigenNombre}
                    {item.seccionOrigenNombre ? ` (Sección "${item.seccionOrigenNombre}")` : ''}
                  </span>{' '}
                  <span className="text-slate-400">→</span>{' '}
                  <span className="font-semibold text-indigo-700 dark:text-indigo-300">
                    {item.destinoLabel}
                  </span>
                  {item.confirmarDoble && (
                    <span className="ml-2 px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-[10px] font-bold">
                      Confirmación doble
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-[11px] font-mono text-slate-500 dark:text-zinc-400 shrink-0">
                  <span className="font-bold text-emerald-700 dark:text-emerald-400">
                    {item.promovidosCount} alum.
                  </span>
                  <span>{item.usuario}</span>
                  <span>{new Date(item.fecha).toLocaleDateString('es-VE')}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
