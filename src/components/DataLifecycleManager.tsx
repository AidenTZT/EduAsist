import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Archive,
  Download,
  Trash2,
  ShieldCheck,
  ShieldAlert,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  CalendarClock,
  FileSpreadsheet,
  Search,
  Layers,
  Lock,
  Sparkles,
  HardDriveDownload,
} from 'lucide-react';
import type {
  Usuario,
  ResumenAsistenciaConsolidado,
  CierreAnioEscolarResponse,
  CierreAnioEscolarSnapshot,
  RespaldoCierreArchivoMeta,
  LimpiezaAntiguosResponse,
} from '../types.ts';
import {
  fetchResumenesAsistencia,
  ejecutarCierreAnioEscolar,
  limpiarDatosAntiguos,
  fetchCierreBackups,
  fetchCierreBackupSnapshot,
} from '../lib/api.ts';

interface DataLifecycleManagerProps {
  currentUser: Usuario | null;
  onDataChanged?: () => void;
}

function downloadJsonFile(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function normalizeAnioCanonical(val: string): string {
  return String(val || '')
    .trim()
    .toLowerCase()
    .replace(/\s*[-–—/]\s*/g, '-')
    .replace(/\s+/g, ' ');
}

export const DataLifecycleManager: React.FC<DataLifecycleManagerProps> = ({
  currentUser,
  onDataChanged,
}) => {
  const isDirector = currentUser?.rol === 'director';

  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  // =========================================================================
  // 1. ESTADO DE CIERRE DE AÑO LECTIVO Y COMPACTACIÓN
  // =========================================================================
  const [anioObjetivo, setAnioObjetivo] = useState<string>('');
  const [incluirInactivosAniosAnteriores, setIncluirInactivosAniosAnteriores] = useState<boolean>(true);
  const [incluirLapsosCerrados, setIncluirLapsosCerrados] = useState<boolean>(true);
  const [selectedLapsoIds, setSelectedLapsoIds] = useState<number[]>([]);
  const [nuevoAnoLectivo, setNuevoAnoLectivo] = useState<string>('');

  const [previewClosure, setPreviewClosure] = useState<CierreAnioEscolarResponse | null>(null);
  const [previewClosureKey, setPreviewClosureKey] = useState<string>('');
  const [loadingClosurePreview, setLoadingClosurePreview] = useState<boolean>(false);
  const [executingClosure, setExecutingClosure] = useState<boolean>(false);
  const [showClosureModal, setShowClosureModal] = useState<boolean>(false);
  const [closureConfirmText, setClosureConfirmText] = useState<string>('');
  const [lastSnapshot, setLastSnapshot] = useState<{
    filename: string;
    snapshot: CierreAnioEscolarSnapshot;
  } | null>(null);
  const [serverBackups, setServerBackups] = useState<RespaldoCierreArchivoMeta[]>([]);
  const [downloadingBackupName, setDownloadingBackupName] = useState<string | null>(null);

  const closureReqIdRef = useRef<number>(0);

  const closureParamsKey = useMemo(
    () =>
      JSON.stringify({
        anioObjetivo,
        selectedLapsoIds: [...selectedLapsoIds].sort((a, b) => a - b),
        incluirInactivosAniosAnteriores,
        incluirLapsosCerrados,
        nuevoAnoLectivo: nuevoAnoLectivo.trim(),
      }),
    [
      anioObjetivo,
      selectedLapsoIds,
      incluirInactivosAniosAnteriores,
      incluirLapsosCerrados,
      nuevoAnoLectivo,
    ]
  );

  const isClosurePreviewSynced = Boolean(
    previewClosure && previewClosureKey === closureParamsKey && !loadingClosurePreview
  );

  const isNuevoAnoSameAsActive = useMemo(() => {
    const trimmed = nuevoAnoLectivo.trim();
    const active = previewClosure?.metricas.anoLectivoActivoActual;
    if (!trimmed || !active) return false;
    return normalizeAnioCanonical(trimmed) === normalizeAnioCanonical(active);
  }, [nuevoAnoLectivo, previewClosure]);

  // =========================================================================
  // 2. ESTADO DE RETENCIÓN Y LIMPIEZA DE DATOS ANTIGUOS
  // =========================================================================
  const [diasRetencionPush, setDiasRetencionPush] = useState<number>(90);
  const [diasRetencionLogs, setDiasRetencionLogs] = useState<number>(180);
  const [limpiarPush, setLimpiarPush] = useState<boolean>(true);
  const [limpiarLogs, setLimpiarLogs] = useState<boolean>(true);

  const [previewRetention, setPreviewRetention] = useState<LimpiezaAntiguosResponse | null>(null);
  const [previewRetentionKey, setPreviewRetentionKey] = useState<string>('');
  const [loadingRetentionPreview, setLoadingRetentionPreview] = useState<boolean>(false);
  const [executingRetention, setExecutingRetention] = useState<boolean>(false);
  const [showRetentionModal, setShowRetentionModal] = useState<boolean>(false);

  const retentionReqIdRef = useRef<number>(0);

  const retentionParamsKey = useMemo(
    () =>
      JSON.stringify({
        diasRetencionPush: Math.min(3650, Math.max(7, Number(diasRetencionPush) || 90)),
        diasRetencionLogs: Math.min(3650, Math.max(30, Number(diasRetencionLogs) || 180)),
        limpiarPush,
        limpiarLogs,
      }),
    [diasRetencionPush, diasRetencionLogs, limpiarPush, limpiarLogs]
  );

  const isRetentionPreviewSynced = Boolean(
    previewRetention && previewRetentionKey === retentionParamsKey && !loadingRetentionPreview
  );

  // =========================================================================
  // 3. HISTÓRICO DE RESÚMENES CONSOLIDADOS
  // =========================================================================
  const [resumenes, setResumenes] = useState<ResumenAsistenciaConsolidado[]>([]);
  const [loadingResumenes, setLoadingResumenes] = useState<boolean>(false);
  const [resumenSearch, setResumenSearch] = useState<string>('');
  const [resumenAnioFilter, setResumenAnioFilter] = useState<string>('');

  const loadClosurePreview = useCallback(async () => {
    if (!isDirector) return;
    const reqId = ++closureReqIdRef.current;
    const keySnapshot = closureParamsKey;
    setLoadingClosurePreview(true);
    try {
      const res = await ejecutarCierreAnioEscolar({
        ...(anioObjetivo ? { anioLectivo: anioObjetivo } : {}),
        ...(selectedLapsoIds.length > 0 ? { lapsoIds: selectedLapsoIds } : {}),
        incluirInactivosAniosAnteriores,
        incluirLapsosCerrados,
        ...(nuevoAnoLectivo.trim() ? { nuevoAnoLectivo: nuevoAnoLectivo.trim() } : {}),
        dryRun: true,
        confirmado: false,
      });
      if (reqId === closureReqIdRef.current) {
        setPreviewClosure(res);
        setPreviewClosureKey(keySnapshot);
      }
    } catch (err: any) {
      if (reqId === closureReqIdRef.current) {
        setFeedback({
          type: 'error',
          text: err?.message || 'Error al calcular la vista previa de compactación.',
        });
      }
    } finally {
      if (reqId === closureReqIdRef.current) {
        setLoadingClosurePreview(false);
      }
    }
  }, [
    isDirector,
    closureParamsKey,
    anioObjetivo,
    selectedLapsoIds,
    incluirInactivosAniosAnteriores,
    incluirLapsosCerrados,
    nuevoAnoLectivo,
  ]);

  const loadRetentionPreview = useCallback(async () => {
    if (!isDirector) return;
    const reqId = ++retentionReqIdRef.current;
    const keySnapshot = retentionParamsKey;
    setLoadingRetentionPreview(true);
    try {
      const res = await limpiarDatosAntiguos({
        diasRetencionPush: Math.min(3650, Math.max(7, Number(diasRetencionPush) || 90)),
        diasRetencionLogs: Math.min(3650, Math.max(30, Number(diasRetencionLogs) || 180)),
        limpiarPush,
        limpiarLogs,
        dryRun: true,
        confirmado: false,
      });
      if (reqId === retentionReqIdRef.current) {
        setPreviewRetention(res);
        setPreviewRetentionKey(keySnapshot);
      }
    } catch (err: any) {
      if (reqId === retentionReqIdRef.current) {
        setFeedback({
          type: 'error',
          text: err?.message || 'Error al analizar registros obsoletos.',
        });
      }
    } finally {
      if (reqId === retentionReqIdRef.current) {
        setLoadingRetentionPreview(false);
      }
    }
  }, [
    isDirector,
    retentionParamsKey,
    diasRetencionPush,
    diasRetencionLogs,
    limpiarPush,
    limpiarLogs,
  ]);

  const loadResumenes = useCallback(async () => {
    if (!isDirector) return;
    setLoadingResumenes(true);
    try {
      const data = await fetchResumenesAsistencia();
      setResumenes(data);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err?.message || 'Error al cargar resúmenes consolidados de asistencia.',
      });
    } finally {
      setLoadingResumenes(false);
    }
  }, [isDirector]);

  const loadServerBackups = useCallback(async () => {
    if (!isDirector) return;
    try {
      const list = await fetchCierreBackups();
      setServerBackups(list);
    } catch {
      // Silencioso si aún no hay carpeta
    }
  }, [isDirector]);

  // Carga inicial de resúmenes y respaldos guardados en servidor
  useEffect(() => {
    if (!isDirector) return;
    loadResumenes();
    loadServerBackups();
  }, [isDirector, loadResumenes, loadServerBackups]);

  // Recalcular vista previa de cierre/compactación automáticamente (debounce 350ms) al cambiar parámetros
  useEffect(() => {
    if (!isDirector) return;
    const timer = window.setTimeout(() => {
      void loadClosurePreview();
    }, 350);
    return () => window.clearTimeout(timer);
  }, [isDirector, closureParamsKey, loadClosurePreview]);

  // Recalcular vista previa de retención automáticamente (debounce 350ms) al cambiar parámetros
  useEffect(() => {
    if (!isDirector) return;
    const timer = window.setTimeout(() => {
      void loadRetentionPreview();
    }, 350);
    return () => window.clearTimeout(timer);
  }, [isDirector, retentionParamsKey, loadRetentionPreview]);

  const closedLapsos = useMemo(() => {
    const all = previewClosure?.lapsosDisponibles || [];
    return all.filter((l) => !l.activo);
  }, [previewClosure]);

  const toggleLapsoSelection = (idLapso: number) => {
    setSelectedLapsoIds((prev) =>
      prev.includes(idLapso) ? prev.filter((id) => id !== idLapso) : [...prev, idLapso]
    );
  };

  const handleDownloadServerBackup = async (filename: string) => {
    setDownloadingBackupName(filename);
    try {
      const snapshot = await fetchCierreBackupSnapshot(filename);
      downloadJsonFile(snapshot, filename);
      setFeedback({
        type: 'success',
        text: `Respaldo de cierre descargado desde el servidor (${filename}).`,
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err?.message || 'No se pudo descargar el archivo de respaldo del servidor.',
      });
    } finally {
      setDownloadingBackupName(null);
    }
  };

  const handleConfirmClosure = async () => {
    if (!isClosurePreviewSynced) {
      setFeedback({
        type: 'error',
        text: 'La vista previa está recalculándose o desactualizada. Espere a que coincida con los parámetros actuales.',
      });
      return;
    }
    if (isNuevoAnoSameAsActive) {
      setFeedback({
        type: 'error',
        text: 'El nuevo año lectivo coincide con el año activo actual. Indique un período distinto o déjelo vacío.',
      });
      return;
    }
    if (closureConfirmText.trim().toUpperCase() !== 'COMPACTAR') {
      setFeedback({
        type: 'error',
        text: 'Debe escribir la palabra COMPACTAR exactamente para confirmar el cierre y compactación.',
      });
      return;
    }

    setExecutingClosure(true);
    setFeedback(null);
    try {
      const res = await ejecutarCierreAnioEscolar({
        ...(anioObjetivo ? { anioLectivo: anioObjetivo } : {}),
        ...(selectedLapsoIds.length > 0 ? { lapsoIds: selectedLapsoIds } : {}),
        incluirInactivosAniosAnteriores,
        incluirLapsosCerrados,
        ...(nuevoAnoLectivo.trim() ? { nuevoAnoLectivo: nuevoAnoLectivo.trim() } : {}),
        dryRun: false,
        confirmado: true,
      });

      if (res.respaldoSnapshot) {
        const filename =
          res.respaldoArchivoId ||
          `cierre_anio_eduasist_${(anioObjetivo || res.metricas.anoLectivoActivoActual || 'historico').replace(/[^a-zA-Z0-9_-]/g, '-')}_${new Date().toISOString().split('T')[0]}.json`;
        downloadJsonFile(res.respaldoSnapshot, filename);
        setLastSnapshot({ filename, snapshot: res.respaldoSnapshot });
      }

      setShowClosureModal(false);
      setClosureConfirmText('');
      setNuevoAnoLectivo('');
      setSelectedLapsoIds([]);
      setFeedback({
        type: 'success',
        text: `${res.mensaje} Se guardó copia de seguridad en servidor y se descargó el JSON al equipo.`,
      });

      await Promise.all([loadClosurePreview(), loadResumenes(), loadServerBackups()]);
      onDataChanged?.();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err?.message || 'Error al ejecutar el cierre de año lectivo y compactación.',
      });
    } finally {
      setExecutingClosure(false);
    }
  };

  const handleConfirmRetentionCleanup = async () => {
    if (!isRetentionPreviewSynced) {
      setFeedback({
        type: 'error',
        text: 'La vista previa de retención aún no está sincronizada con los parámetros actuales.',
      });
      return;
    }

    setExecutingRetention(true);
    setFeedback(null);
    try {
      const res = await limpiarDatosAntiguos({
        diasRetencionPush: Math.min(3650, Math.max(7, Number(diasRetencionPush) || 90)),
        diasRetencionLogs: Math.min(3650, Math.max(30, Number(diasRetencionLogs) || 180)),
        limpiarPush,
        limpiarLogs,
        dryRun: false,
        confirmado: true,
      });
      setShowRetentionModal(false);
      setFeedback({
        type: 'success',
        text: res.mensaje,
      });
      await loadRetentionPreview();
      onDataChanged?.();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err?.message || 'Error al ejecutar limpieza de datos antiguos.',
      });
    } finally {
      setExecutingRetention(false);
    }
  };

  const resumenAniosUnicos = useMemo(() => {
    const set = new Set<string>();
    resumenes.forEach((r) => {
      if (r.anioLectivo) set.add(r.anioLectivo);
    });
    return Array.from(set).sort().reverse();
  }, [resumenes]);

  const filteredResumenes = useMemo(() => {
    const term = resumenSearch.trim().toLowerCase();
    return resumenes.filter((r) => {
      if (resumenAnioFilter && r.anioLectivo !== resumenAnioFilter) return false;
      if (!term) return true;
      const nombre = (r.estudianteNombre || '').toLowerCase();
      const cedula = (r.estudianteCedula || '').toLowerCase();
      const lapso = (r.lapsoNombre || '').toLowerCase();
      return nombre.includes(term) || cedula.includes(term) || lapso.includes(term);
    });
  }, [resumenes, resumenSearch, resumenAnioFilter]);

  if (!isDirector) {
    return (
      <div className="bg-white dark:bg-[#121212] p-8 rounded-3xl border border-rose-200 dark:border-rose-900 shadow-sm text-center max-w-2xl mx-auto my-8 space-y-4">
        <div className="w-14 h-14 bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 rounded-2xl flex items-center justify-center mx-auto">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-black text-rose-900 dark:text-rose-200">
          Acceso Restringido (403 Forbidden)
        </h3>
        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
          Las herramientas de <strong>Cierre de Año Lectivo, Compactación y Limpieza de Retención</strong> son exclusivas de la Dirección General.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {feedback && (
        <div
          className={`p-4 rounded-xl text-xs font-semibold flex items-center justify-between gap-3 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
              : feedback.type === 'error'
              ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-900'
              : 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800'
          }`}
        >
          <div className="flex items-center space-x-2.5">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
            )}
            <span>{feedback.text}</span>
          </div>
          {lastSnapshot && feedback.type === 'success' && (
            <button
              type="button"
              onClick={() => downloadJsonFile(lastSnapshot.snapshot, lastSnapshot.filename)}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Descargar Respaldo</span>
            </button>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* SECCIÓN 1: CIERRE DE AÑO LECTIVO Y COMPACTACIÓN HISTÓRICA */}
      {/* =================================================================== */}
      <div className="bg-white dark:bg-[#121212] p-6 rounded-2xl border border-slate-200 dark:border-[#27272A] shadow-xs space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-[#27272A]">
          <div className="flex items-start space-x-3">
            <div className="w-11 h-11 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-900 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
              <Archive className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-[#F4F4F5]">
                  Cierre de Año Lectivo y Compactación de Asistencias
                </h3>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                  <Lock className="w-3 h-3" />
                  Respaldo en Servidor + JSON Previo
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                Consolida en resúmenes históricos los registros diarios de lapsos cerrados o de estudiantes{' '}
                <strong>EGRESADOS / RETIRADOS</strong> de períodos previos, protegiendo intactos los datos del año escolar activo.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={loadClosurePreview}
            disabled={loadingClosurePreview}
            className="self-start md:self-auto px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-[#181818] hover:bg-slate-200 dark:hover:bg-[#202024] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#27272A] flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingClosurePreview ? 'animate-spin' : ''}`} />
            <span>{loadingClosurePreview ? 'Sincronizando...' : 'Recalcular Vista Previa'}</span>
          </button>
        </div>

        {/* Parámetros de Compactación */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3 bg-slate-50 dark:bg-[#181818] p-4 rounded-xl border border-slate-200/80 dark:border-[#27272A]">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Año Lectivo Objetivo (Opcional)
              </label>
              <select
                value={anioObjetivo}
                onChange={(e) => setAnioObjetivo(e.target.value)}
                className="w-full bg-white dark:bg-[#121212] border border-slate-200 dark:border-[#27272A] rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 dark:text-[#F4F4F5] focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Todos los períodos elegibles (Automático)</option>
                {(previewClosure?.anosDisponibles || []).map((anio) => (
                  <option key={anio} value={anio}>
                    Año Lectivo {anio}
                    {anio === previewClosure?.metricas.anoLectivoActivoActual ? ' (Activo Actual)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Aperturar Nuevo Año Lectivo tras el Cierre (Opcional)
              </label>
              <input
                type="text"
                placeholder="Ej: 2027 - 2028 (dejar vacío para no cambiar)"
                value={nuevoAnoLectivo}
                onChange={(e) => setNuevoAnoLectivo(e.target.value)}
                className="w-full bg-white dark:bg-[#121212] border border-slate-200 dark:border-[#27272A] rounded-xl px-3 py-2 text-xs font-mono text-slate-900 dark:text-[#F4F4F5] focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {isNuevoAnoSameAsActive ? (
                <p className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 mt-1">
                  El período ingresado equivale al año lectivo activo actual ({previewClosure?.metricas.anoLectivoActivoActual}). Indique un nuevo período distinto.
                </p>
              ) : (
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  Si ingresa un nuevo año lectivo, se desactivarán los lapsos salientes para cerrar oficialmente el ciclo actual.
                </p>
              )}
            </div>
          </div>

          <div className="space-y-3 bg-slate-50 dark:bg-[#181818] p-4 rounded-xl border border-slate-200/80 dark:border-[#27272A]">
            <label className="flex items-start space-x-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={incluirInactivosAniosAnteriores}
                onChange={(e) => setIncluirInactivosAniosAnteriores(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-xs text-slate-700 dark:text-slate-300 leading-snug">
                <strong>Compactar alumnos Egresados o Retirados</strong> con registros en años escolares anteriores.
              </span>
            </label>

            <label className="flex items-start space-x-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={incluirLapsosCerrados}
                onChange={(e) => setIncluirLapsosCerrados(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-xs text-slate-700 dark:text-slate-300 leading-snug">
                <strong>Compactar lapsos cerrados / inactivos</strong> preservando los totales consolidados por estudiante.
              </span>
            </label>

            {closedLapsos.length > 0 && (
              <div className="pt-2 border-t border-slate-200/70 dark:border-[#27272A]">
                <span className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1.5">
                  Filtrar lapsos cerrados específicos (opcional):
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {closedLapsos.map((lapso) => {
                    const selected = selectedLapsoIds.includes(lapso.id);
                    return (
                      <button
                        key={lapso.id}
                        type="button"
                        onClick={() => toggleLapsoSelection(lapso.id)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                          selected
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white dark:bg-[#121212] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-[#27272A]'
                        }`}
                      >
                        {lapso.nombre} ({lapso.anioEscolar})
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Estado de sincronización de Vista Previa */}
        {!isClosurePreviewSynced && (
          <div className="px-3.5 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 text-xs font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-2">
            <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
            <span>
              Sincronizando vista previa con los parámetros seleccionados... La ejecución se habilitará al finalizar el cálculo.
            </span>
          </div>
        )}

        {/* Métricas de Vista Previa */}
        {previewClosure && (
          <div
            className={`grid grid-cols-2 sm:grid-cols-4 gap-3 transition-opacity ${
              isClosurePreviewSynced ? 'opacity-100' : 'opacity-60'
            }`}
          >
            <div className="bg-indigo-50/70 dark:bg-indigo-950/30 p-3.5 rounded-xl border border-indigo-200/80 dark:border-indigo-900/60">
              <span className="text-[10px] font-bold uppercase text-indigo-700 dark:text-indigo-400">
                Asistencias a Compactar
              </span>
              <p className="font-mono text-xl font-black text-indigo-900 dark:text-indigo-200 mt-0.5 tabular-nums">
                {previewClosure.metricas.asistenciasACompactar}
              </p>
            </div>
            <div className="bg-emerald-50/70 dark:bg-emerald-950/30 p-3.5 rounded-xl border border-emerald-200/80 dark:border-emerald-900/60">
              <span className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-400">
                Resúmenes a Generar
              </span>
              <p className="font-mono text-xl font-black text-emerald-900 dark:text-emerald-200 mt-0.5 tabular-nums">
                {previewClosure.metricas.resumenesGeneradosCount}
              </p>
            </div>
            <div className="bg-slate-50 dark:bg-[#181818] p-3.5 rounded-xl border border-slate-200/80 dark:border-[#27272A]">
              <span className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
                Registros Protegidos
              </span>
              <p className="font-mono text-xl font-black text-slate-900 dark:text-[#F4F4F5] mt-0.5 tabular-nums">
                {previewClosure.metricas.asistenciasConservadas}
              </p>
            </div>
            <div className="bg-amber-50/70 dark:bg-amber-950/30 p-3.5 rounded-xl border border-amber-200/80 dark:border-amber-900/60">
              <span className="text-[10px] font-bold uppercase text-amber-700 dark:text-amber-400">
                Egresados / Retirados
              </span>
              <p className="font-mono text-xl font-black text-amber-900 dark:text-amber-200 mt-0.5 tabular-nums">
                {previewClosure.metricas.estudiantesInactivosAfectadosCount}
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-[#27272A]">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Año Lectivo Activo:{' '}
            <strong className="font-mono text-slate-900 dark:text-[#F4F4F5]">
              {previewClosure?.metricas.anoLectivoActivoActual || 'N/D'}
            </strong>
            {nuevoAnoLectivo.trim() && !isNuevoAnoSameAsActive && (
              <>
                {' '}→ Nuevo:{' '}
                <strong className="font-mono text-indigo-600 dark:text-indigo-400">
                  {nuevoAnoLectivo.trim()}
                </strong>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {lastSnapshot && (
              <button
                type="button"
                onClick={() => downloadJsonFile(lastSnapshot.snapshot, lastSnapshot.filename)}
                className="px-3.5 py-2.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-[#181818] hover:bg-slate-200 dark:hover:bg-[#202024] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-[#27272A] flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Último Respaldo JSON</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setClosureConfirmText('');
                setShowClosureModal(true);
              }}
              disabled={
                executingClosure ||
                !isClosurePreviewSynced ||
                isNuevoAnoSameAsActive ||
                !previewClosure ||
                (previewClosure.metricas.asistenciasACompactar === 0 && !nuevoAnoLectivo.trim())
              }
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-45"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Respaldar y Compactar Período</span>
            </button>
          </div>
        </div>

        {/* Respaldos de Cierre Almacenados en Servidor (Recuperación ante fallo de descarga) */}
        {serverBackups.length > 0 && (
          <div className="pt-3 border-t border-slate-100 dark:border-[#27272A] space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-zinc-300">
              <HardDriveDownload className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Respaldos de Cierre Guardados en Servidor ({serverBackups.length})</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {serverBackups.slice(0, 6).map((b) => (
                <div
                  key={b.filename}
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#181818] border border-slate-200/80 dark:border-[#27272A] text-xs"
                >
                  <div className="min-w-0">
                    <p className="font-mono font-semibold text-slate-800 dark:text-zinc-200 truncate">
                      {b.filename}
                    </p>
                    <p className="text-[11px] font-mono text-slate-500 dark:text-zinc-400">
                      {(b.sizeBytes / 1024).toFixed(1)} KB ·{' '}
                      {new Date(b.createdAt).toLocaleString('es-VE')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDownloadServerBackup(b.filename)}
                    disabled={downloadingBackupName === b.filename}
                    className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold flex items-center gap-1 shrink-0 cursor-pointer disabled:opacity-50"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{downloadingBackupName === b.filename ? '...' : 'Descargar'}</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* =================================================================== */}
      {/* SECCIÓN 2: POLÍTICAS DE RETENCIÓN Y LIMPIEZA SEGURA */}
      {/* =================================================================== */}
      <div className="bg-white dark:bg-[#121212] p-6 rounded-2xl border border-slate-200 dark:border-[#27272A] shadow-xs space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-[#27272A]">
          <div className="flex items-start space-x-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
              <CalendarClock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-[#F4F4F5]">
                Políticas de Retención y Limpieza de Registros Auxiliares
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                Depura suscripciones push caducadas o inactivas y eventos rutinarios antiguos en{' '}
                <code className="font-mono">auditLogs</code>. Los eventos críticos (cierres, respaldos, promociones, cambios de rol y justificaciones) se conservan siempre.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={loadRetentionPreview}
            disabled={loadingRetentionPreview}
            className="self-start md:self-auto px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-[#181818] hover:bg-slate-200 dark:hover:bg-[#202024] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#27272A] flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingRetentionPreview ? 'animate-spin' : ''}`} />
            <span>{loadingRetentionPreview ? 'Analizando...' : 'Analizar Registros Obsoletos'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Política Push */}
          <div className="bg-slate-50 dark:bg-[#181818] p-4 rounded-xl border border-slate-200/80 dark:border-[#27272A] space-y-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={limpiarPush}
                  onChange={(e) => setLimpiarPush(e.target.checked)}
                  className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                />
                <span className="text-xs font-bold text-slate-800 dark:text-[#F4F4F5]">
                  Depurar Suscripciones Push Obsoletas
                </span>
              </label>
              <span className="text-[11px] font-mono font-bold text-amber-600 dark:text-amber-400">
                {isRetentionPreviewSynced && previewRetention
                  ? `${previewRetention.pushEliminadas} por depurar`
                  : 'Calculando...'}
              </span>
            </div>

            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-slate-600 dark:text-slate-400">Antigüedad máxima (días):</span>
              <input
                type="number"
                min={7}
                max={3650}
                value={diasRetencionPush}
                onChange={(e) => setDiasRetencionPush(Number(e.target.value))}
                className="w-24 bg-white dark:bg-[#121212] border border-slate-200 dark:border-[#27272A] rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-slate-900 dark:text-[#F4F4F5] text-right"
              />
            </div>

            {previewRetention && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Total: <strong className="font-mono">{previewRetention.pushTotalAntes}</strong> · Se conservan:{' '}
                <strong className="font-mono text-emerald-600 dark:text-emerald-400">
                  {previewRetention.pushConservadas}
                </strong>
              </p>
            )}
          </div>

          {/* Política Logs Rutinarios */}
          <div className="bg-slate-50 dark:bg-[#181818] p-4 rounded-xl border border-slate-200/80 dark:border-[#27272A] space-y-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={limpiarLogs}
                  onChange={(e) => setLimpiarLogs(e.target.checked)}
                  className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                />
                <span className="text-xs font-bold text-slate-800 dark:text-[#F4F4F5]">
                  Depurar Bitácora Rutinaria Antigua
                </span>
              </label>
              <span className="text-[11px] font-mono font-bold text-amber-600 dark:text-amber-400">
                {isRetentionPreviewSynced && previewRetention
                  ? `${previewRetention.logsEliminados} por depurar`
                  : 'Calculando...'}
              </span>
            </div>

            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-slate-600 dark:text-slate-400">Antigüedad máxima (días):</span>
              <input
                type="number"
                min={30}
                max={3650}
                value={diasRetencionLogs}
                onChange={(e) => setDiasRetencionLogs(Number(e.target.value))}
                className="w-24 bg-white dark:bg-[#121212] border border-slate-200 dark:border-[#27272A] rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-slate-900 dark:text-[#F4F4F5] text-right"
              />
            </div>

            {previewRetention && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Total: <strong className="font-mono">{previewRetention.logsTotalAntes}</strong> · Se conservan:{' '}
                <strong className="font-mono text-emerald-600 dark:text-emerald-400">
                  {previewRetention.logsConservados}
                </strong>
              </p>
            )}
          </div>
        </div>

        {!isRetentionPreviewSynced && (
          <div className="px-3.5 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 text-xs font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-2">
            <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
            <span>
              Recalculando vista previa de retención según los nuevos umbrales...
            </span>
          </div>
        )}

        {previewRetention && Object.keys(previewRetention.desgloseLogsPorAccion || {}).length > 0 && (
          <div className="bg-amber-50/50 dark:bg-amber-950/20 p-3.5 rounded-xl border border-amber-200/70 dark:border-amber-900/50 space-y-2">
            <span className="text-[11px] font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wider">
              Desglose de logs rutinarios elegibles para depuración:
            </span>
            <div className="flex flex-wrap gap-2">
              {Object.entries(previewRetention.desgloseLogsPorAccion).map(([accion, count]) => (
                <span
                  key={accion}
                  className="px-2.5 py-1 rounded-lg bg-white dark:bg-[#181818] border border-amber-200 dark:border-amber-900/60 text-[11px] font-mono text-slate-700 dark:text-slate-300"
                >
                  {accion}: <strong>{count}</strong>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-[#27272A]">
          <button
            type="button"
            onClick={() => setShowRetentionModal(true)}
            disabled={
              executingRetention ||
              !isRetentionPreviewSynced ||
              !previewRetention ||
              (previewRetention.pushEliminadas === 0 && previewRetention.logsEliminados === 0)
            }
            className="px-4 py-2.5 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-xs flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-45"
          >
            <Trash2 className="w-4 h-4" />
            <span>Ejecutar Limpieza Segura</span>
          </button>
        </div>
      </div>

      {/* =================================================================== */}
      {/* SECCIÓN 3: HISTÓRICO DE RESÚMENES CONSOLIDADOS DE ASISTENCIA */}
      {/* =================================================================== */}
      <div className="bg-white dark:bg-[#121212] p-6 rounded-2xl border border-slate-200 dark:border-[#27272A] shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center space-x-2.5">
            <FileSpreadsheet className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-[#F4F4F5]">
                Resúmenes Consolidados Históricos ({filteredResumenes.length})
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Totales compactados preservados por estudiante, año lectivo y lapso escolar.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Buscar estudiante o cédula..."
                value={resumenSearch}
                onChange={(e) => setResumenSearch(e.target.value)}
                className="bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-[#F4F4F5] focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <select
              value={resumenAnioFilter}
              onChange={(e) => setResumenAnioFilter(e.target.value)}
              className="bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300"
            >
              <option value="">Todos los Años</option>
              {resumenAniosUnicos.map((anio) => (
                <option key={anio} value={anio}>
                  {anio}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loadingResumenes ? (
          <div className="py-8 text-center text-xs text-slate-500">Cargando resúmenes consolidados...</div>
        ) : filteredResumenes.length === 0 ? (
          <div className="py-10 text-center bg-slate-50 dark:bg-[#181818] rounded-xl border border-dashed border-slate-200 dark:border-[#27272A] space-y-2">
            <Layers className="w-7 h-7 text-slate-400 mx-auto" />
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Aún no existen resúmenes consolidados compactados para los filtros aplicados.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto border border-slate-200 dark:border-[#27272A] rounded-xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-[#181818] border-b border-slate-200 dark:border-[#27272A] text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 px-3">Estudiante</th>
                  <th className="py-2.5 px-3">Estado</th>
                  <th className="py-2.5 px-3">Año Lectivo / Lapso</th>
                  <th className="py-2.5 px-3 text-center">Total</th>
                  <th className="py-2.5 px-3 text-center text-emerald-600 dark:text-emerald-400">Pres.</th>
                  <th className="py-2.5 px-3 text-center text-amber-600 dark:text-amber-400">Tardes</th>
                  <th className="py-2.5 px-3 text-center text-rose-600 dark:text-rose-400">Aus.</th>
                  <th className="py-2.5 px-3 text-center text-indigo-600 dark:text-indigo-400">Just./Rep.</th>
                  <th className="py-2.5 px-3 text-right">% Asist.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#27272A]">
                {filteredResumenes.map((r) => (
                  <tr key={r.idResumen} className="hover:bg-slate-50/70 dark:hover:bg-[#181818]/70">
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-slate-900 dark:text-[#F4F4F5]">
                        {r.estudianteNombre || `ID #${r.estudianteId}`}
                      </div>
                      <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                        {r.estudianteCedula || '--'}
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-md font-bold text-[10px] ${
                          r.estadoAcademico === 'EGRESADO'
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                            : r.estadoAcademico === 'RETIRADO'
                            ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                            : 'bg-slate-100 dark:bg-[#181818] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#27272A]'
                        }`}
                      >
                        {r.estadoAcademico || 'ACTIVO'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-mono font-bold text-slate-800 dark:text-slate-200">
                        {r.anioLectivo}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {r.lapsoNombre || r.nombreNivel || 'General'}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono font-bold tabular-nums">
                      {r.totalRegistros}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                      {r.presentes}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                      {r.tardes}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono font-bold text-rose-600 dark:text-rose-400 tabular-nums">
                      {r.ausentes}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">
                      {r.justificados + r.reposoMedico}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-black text-slate-900 dark:text-[#F4F4F5] tabular-nums">
                      {r.porcentajeAsistencia.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* =================================================================== */}
      {/* MODAL DE CONFIRMACIÓN DE CIERRE Y COMPACTACIÓN */}
      {/* =================================================================== */}
      {showClosureModal && previewClosure && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#121212] rounded-3xl max-w-lg w-full border border-indigo-200 dark:border-indigo-900 shadow-2xl p-6 space-y-5">
            <div className="flex items-center space-x-3 text-indigo-600 dark:text-indigo-400">
              <Sparkles className="w-6 h-6" />
              <h3 className="font-black text-base text-slate-900 dark:text-[#F4F4F5]">
                Confirmar Cierre y Compactación de Período
              </h3>
            </div>

            <div className="text-xs text-slate-600 dark:text-slate-400 space-y-2 leading-relaxed">
              <p>
                Antes de depurar registros diarios, el sistema guardará un{' '}
                <strong>respaldo de seguridad en el servidor</strong> (con catálogo de años, secciones y materias) y descargará automáticamente el paquete JSON.
              </p>
              <div className="bg-slate-50 dark:bg-[#181818] p-3.5 rounded-2xl border border-slate-200 dark:border-[#27272A] font-mono text-[11px] space-y-1 text-slate-700 dark:text-slate-300">
                <p>• Asistencias a compactar y depurar: {previewClosure.metricas.asistenciasACompactar}</p>
                <p>• Resúmenes históricos generados: {previewClosure.metricas.resumenesGeneradosCount}</p>
                <p>• Registros activos protegidos: {previewClosure.metricas.asistenciasConservadas}</p>
                {nuevoAnoLectivo.trim() && (
                  <p>• Nuevo año lectivo a activar: {nuevoAnoLectivo.trim()}</p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Escriba <span className="text-indigo-600 dark:text-indigo-400 font-mono">COMPACTAR</span> para confirmar:
              </label>
              <input
                type="text"
                value={closureConfirmText}
                onChange={(e) => setClosureConfirmText(e.target.value)}
                placeholder="COMPACTAR"
                className="w-full bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold text-slate-900 dark:text-[#F4F4F5] focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-100 dark:border-[#27272A]">
              <button
                type="button"
                onClick={() => {
                  setShowClosureModal(false);
                  setClosureConfirmText('');
                }}
                disabled={executingClosure}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmClosure}
                disabled={
                  executingClosure ||
                  !isClosurePreviewSynced ||
                  isNuevoAnoSameAsActive ||
                  closureConfirmText.trim().toUpperCase() !== 'COMPACTAR'
                }
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs flex items-center space-x-2 cursor-pointer disabled:opacity-40"
              >
                <Download className="w-4 h-4" />
                <span>{executingClosure ? 'Compactando...' : 'Respaldar y Ejecutar'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL DE CONFIRMACIÓN DE LIMPIEZA DE RETENCIÓN */}
      {/* =================================================================== */}
      {showRetentionModal && previewRetention && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#121212] rounded-3xl max-w-md w-full border border-amber-200 dark:border-amber-900 shadow-2xl p-6 space-y-5">
            <div className="flex items-center space-x-3 text-amber-600 dark:text-amber-400">
              <AlertCircle className="w-6 h-6" />
              <h3 className="font-black text-base text-slate-900 dark:text-[#F4F4F5]">
                Confirmar Limpieza de Retención
              </h3>
            </div>

            <div className="bg-slate-50 dark:bg-[#181818] p-3.5 rounded-2xl border border-slate-200 dark:border-[#27272A] font-mono text-[11px] space-y-1 text-slate-700 dark:text-slate-300">
              <p>• Suscripciones Push a eliminar: {previewRetention.pushEliminadas}</p>
              <p>• Suscripciones Push protegidas: {previewRetention.pushConservadas}</p>
              <p>• Logs rutinarios a eliminar: {previewRetention.logsEliminados}</p>
              <p>• Logs críticos/recientes protegidos: {previewRetention.logsConservados}</p>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-100 dark:border-[#27272A]">
              <button
                type="button"
                onClick={() => setShowRetentionModal(false)}
                disabled={executingRetention}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmRetentionCleanup}
                disabled={executingRetention || !isRetentionPreviewSynced}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-xs cursor-pointer disabled:opacity-45"
              >
                {executingRetention ? 'Depurando...' : 'Confirmar Limpieza'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
