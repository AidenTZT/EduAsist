import React, { useState, useEffect } from 'react';
import {
  Clock,
  Calendar,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Search,
  RefreshCw,
  Shield,
  FileText,
  User,
  FileDown,
  Building,
  ShieldAlert,
  Edit3,
  FileCheck2,
  Stethoscope,
  X,
  Save,
  ClipboardCheck,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CalendarRange,
} from 'lucide-react';
import type {
  AnoEscolar,
  Seccion,
  Materia,
  RegistroAsistencia,
  AuditLog,
  Usuario,
  EstadoAsistencia,
  PaginationMeta,
  AttendanceSummaryStats,
  LapsoEscolar,
  LapsoBreakdownStats,
} from '../types.ts';
import {
  fetchAsistenciaGeneral,
  fetchAuditLogs,
  fetchConfiguracion,
  fetchLapsos,
  updateAsistenciaJustificacion,
} from '../lib/api.ts';
import {
  formatCedula,
  formatDateEs,
  formatTime,
  getLocalTodayDateString,
} from '../lib/utils.ts';
import { generateGeneralAttendancePDF } from '../lib/pdfGenerator.ts';

interface AttendanceAuditProps {
  anos?: AnoEscolar[];
  secciones?: Seccion[];
  materias: Materia[];
  currentUser?: Usuario | null;
}

const MODAL_ESTADOS: Array<{
  value: EstadoAsistencia;
  label: string;
  desc: string;
  activeClass: string;
}> = [
  {
    value: 'Justificado',
    label: 'Justificado',
    desc: 'Permiso o constancia válida',
    activeClass:
      'bg-sky-600 text-white border-sky-600 ring-2 ring-sky-200 dark:ring-sky-900/60',
  },
  {
    value: 'Reposo Médico',
    label: 'Reposo Médico',
    desc: 'Informe o certificado médico',
    activeClass:
      'bg-violet-600 text-white border-violet-600 ring-2 ring-violet-200 dark:ring-violet-900/60',
  },
  {
    value: 'Presente',
    label: 'Presente',
    desc: 'Corrección de asistencia regular',
    activeClass:
      'bg-emerald-600 text-white border-emerald-600 ring-2 ring-emerald-200 dark:ring-emerald-900/60',
  },
  {
    value: 'Tarde',
    label: 'Tarde',
    desc: 'Ingreso con retraso',
    activeClass:
      'bg-amber-500 text-white border-amber-500 ring-2 ring-amber-200 dark:ring-amber-900/60',
  },
  {
    value: 'Ausente',
    label: 'Ausente',
    desc: 'Inasistencia sin soporte',
    activeClass:
      'bg-rose-600 text-white border-rose-600 ring-2 ring-rose-200 dark:ring-rose-900/60',
  },
];

function getStatusBadgeClasses(estado: EstadoAsistencia): string {
  switch (estado) {
    case 'Presente':
      return 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
    case 'Ausente':
      return 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800';
    case 'Tarde':
      return 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800';
    case 'Reposo Médico':
      return 'bg-violet-50 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800';
    case 'Justificado':
    default:
      return 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800';
  }
}

const EMPTY_PAGINATION: PaginationMeta = {
  page: 1,
  limit: 25,
  totalCount: 0,
  totalPages: 1,
  hasNextPage: false,
  hasPrevPage: false,
};

const EMPTY_SUMMARY: AttendanceSummaryStats = {
  total: 0,
  presentes: 0,
  tardes: 0,
  ausentes: 0,
  justificadosYReposos: 0,
  porcentajeAsistencia: 0,
};

interface PaginationControlsProps {
  pagination: PaginationMeta;
  pageSize: number;
  onPageChange: (nextPage: number) => void;
  onPageSizeChange: (nextLimit: number) => void;
  loading?: boolean;
  itemLabel?: string;
}

const PaginationControls: React.FC<PaginationControlsProps> = ({
  pagination,
  pageSize,
  onPageChange,
  onPageSizeChange,
  loading = false,
  itemLabel = 'registros',
}) => {
  const { page, limit, totalCount, totalPages, hasNextPage, hasPrevPage } = pagination;
  const startItem = totalCount === 0 ? 0 : (page - 1) * limit + 1;
  const endItem = totalCount === 0 ? 0 : Math.min(page * limit, totalCount);

  return (
    <div className="px-4 py-3 bg-slate-50/80 dark:bg-[#181818]/90 border-t border-slate-200 dark:border-[#27272A] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
      <div className="flex flex-wrap items-center gap-3 text-slate-600 dark:text-slate-400">
        <span>
          Mostrando{' '}
          <strong className="text-slate-900 dark:text-[#F4F4F5] font-bold">
            {startItem}–{endItem}
          </strong>{' '}
          de{' '}
          <strong className="text-slate-900 dark:text-[#F4F4F5] font-bold">
            {totalCount}
          </strong>{' '}
          {itemLabel}
        </span>

        <div className="flex items-center gap-1.5">
          <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            Por página:
          </label>
          <select
            value={pageSize}
            disabled={loading}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="bg-white dark:bg-[#121212] border border-slate-200 dark:border-[#27272A] rounded-lg px-2 py-1 text-xs font-semibold text-slate-800 dark:text-[#F4F4F5] focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer disabled:opacity-50"
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
      </div>

      <div className="flex items-center justify-between sm:justify-end gap-1.5">
        <button
          type="button"
          onClick={() => onPageChange(1)}
          disabled={!hasPrevPage || loading}
          className="p-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121212] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#27272A] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
          title="Primera página"
        >
          <ChevronsLeft className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={!hasPrevPage || loading}
          className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121212] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#27272A] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer font-semibold flex items-center gap-1 transition-colors"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          <span>Anterior</span>
        </button>

        <span className="px-2.5 py-1 text-[11px] font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">
          Página {page} de {Math.max(1, totalPages)}
        </span>

        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={!hasNextPage || loading}
          className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121212] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#27272A] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer font-semibold flex items-center gap-1 transition-colors"
        >
          <span>Siguiente</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onPageChange(totalPages)}
          disabled={!hasNextPage || loading}
          className="p-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121212] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#27272A] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
          title="Última página"
        >
          <ChevronsRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

function renderTableSkeleton(rows: number, columns: number) {
  return Array.from({ length: rows }).map((_, rowIdx) => (
    <tr key={`skeleton-${rowIdx}`} className="animate-pulse">
      {Array.from({ length: columns }).map((__, colIdx) => (
        <td key={`skeleton-${rowIdx}-${colIdx}`} className="py-3.5 px-4">
          <div
            className={`h-3.5 rounded-md bg-slate-200/80 dark:bg-[#27272A] ${
              colIdx === 0
                ? 'w-8 mx-auto'
                : colIdx === columns - 1
                ? 'w-20 mx-auto'
                : colIdx % 2 === 0
                ? 'w-24'
                : 'w-36'
            }`}
          />
        </td>
      ))}
    </tr>
  ));
}

export const AttendanceAudit: React.FC<AttendanceAuditProps> = ({
  anos = [],
  secciones = [],
  materias,
  currentUser,
}) => {
  // Restricción RBAC: Acceso estrictamente reservado a Director y Coordinador
  const isAuthorized = currentUser?.rol === 'director' || currentUser?.rol === 'coordinador';

  const [subTab, setSubTab] = useState<'asistencias' | 'seguridad'>('asistencias');

  // Granular Filters for General Attendance (Mensual por defecto para carga inicial liviana)
  const [lapsos, setLapsos] = useState<LapsoEscolar[]>([]);
  const [selectedLapsoId, setSelectedLapsoId] = useState<number>(0);
  const [selectedAnoId, setSelectedAnoId] = useState<number>(0);
  const [selectedSeccionId, setSelectedSeccionId] = useState<number>(0);
  const [selectedMateriaId, setSelectedMateriaId] = useState<number>(0);
  const [periodMode, setPeriodMode] = useState<'mensual' | 'diario' | 'rango' | 'todos'>('mensual');
  const [selectedDate, setSelectedDate] = useState<string>(() => getLocalTodayDateString());
  const [selectedMonth, setSelectedMonth] = useState<string>(() =>
    getLocalTodayDateString().slice(0, 7)
  );
  const [startDate, setStartDate] = useState<string>(
    () => `${getLocalTodayDateString().slice(0, 7)}-01`
  );
  const [endDate, setEndDate] = useState<string>(() => getLocalTodayDateString());
  const [selectedEstadoFilter, setSelectedEstadoFilter] = useState<EstadoAsistencia | ''>('');
  const [searchStudent, setSearchStudent] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');

  // Server-Side Pagination & Summary for Attendance
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(25);
  const [pagination, setPagination] = useState<PaginationMeta>(EMPTY_PAGINATION);
  const [summary, setSummary] = useState<AttendanceSummaryStats>(EMPTY_SUMMARY);
  const [lapsoBreakdown, setLapsoBreakdown] = useState<LapsoBreakdownStats[]>([]);

  // Attendance Records & Loading
  const [records, setRecords] = useState<RegistroAsistencia[]>([]);
  const [loadingAsistencia, setLoadingAsistencia] = useState<boolean>(true);
  const [attendanceError, setAttendanceError] = useState<string | null>(null);
  const [exportingPDF, setExportingPDF] = useState<boolean>(false);
  const [actionFeedback, setActionFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Justification / Medical Leave Modal State
  const [editingRecord, setEditingRecord] = useState<RegistroAsistencia | null>(null);
  const [modalEstado, setModalEstado] = useState<EstadoAsistencia>('Justificado');
  const [modalMotivo, setModalMotivo] = useState<string>('');
  const [modalNumeroJustificante, setModalNumeroJustificante] = useState<string>('');
  const [modalFechaRecepcion, setModalFechaRecepcion] = useState<string>(() =>
    getLocalTodayDateString()
  );
  const [modalError, setModalError] = useState<string>('');
  const [savingJustification, setSavingJustification] = useState<boolean>(false);

  // Institutional Config for letterhead
  const [instConfig, setInstConfig] = useState<{ nombrePlantel?: string; anoLectivo?: string }>({});

  // Security Audit Logs State (Exclusive for Director) + Server-Side Pagination
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState<boolean>(false);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [logFilterAction, setLogFilterAction] = useState<string>('');
  const [logSearch, setLogSearch] = useState<string>('');
  const [debouncedLogSearch, setDebouncedLogSearch] = useState<string>('');
  const [logStartDate, setLogStartDate] = useState<string>('');
  const [logEndDate, setLogEndDate] = useState<string>('');
  const [logPage, setLogPage] = useState<number>(1);
  const [logLimit, setLogLimit] = useState<number>(25);
  const [logPagination, setLogPagination] = useState<PaginationMeta>(EMPTY_PAGINATION);
  const [selectedLogDetail, setSelectedLogDetail] = useState<AuditLog | null>(null);

  useEffect(() => {
    fetchConfiguracion()
      .then((cfg) => {
        setInstConfig({
          nombrePlantel: cfg.nombreInstitucion,
          anoLectivo: cfg.anoLectivo,
        });
      })
      .catch(() => {});

    if (isAuthorized) {
      fetchLapsos()
        .then((list) => setLapsos(list))
        .catch(() => {});
    }
  }, [isAuthorized]);

  // Debounce búsqueda de asistencia (300ms) y reinicio a página 1
  useEffect(() => {
    const trimmed = searchStudent.trim();
    if (trimmed === debouncedSearch) return;
    const timer = setTimeout(() => {
      setDebouncedSearch(trimmed);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchStudent, debouncedSearch]);

  // Debounce búsqueda de logs de seguridad (300ms) y reinicio a página 1
  useEffect(() => {
    const trimmed = logSearch.trim();
    if (trimmed === debouncedLogSearch) return;
    const timer = setTimeout(() => {
      setDebouncedLogSearch(trimmed);
      setLogPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [logSearch, debouncedLogSearch]);

  // Filter secciones based on selected Año
  const availableSecciones =
    selectedAnoId === 0 ? secciones : secciones.filter((s) => s.idAno === selectedAnoId);

  // Filter materias based on selected Año
  const availableMaterias =
    selectedAnoId === 0 ? materias : materias.filter((m) => m.idAno === selectedAnoId);

  const buildAttendanceFilters = (overridePage = page, overrideLimit = limit) => ({
    page: overridePage,
    limit: overrideLimit,
    idAno: selectedAnoId || undefined,
    idSeccion: selectedSeccionId || undefined,
    idMateria: selectedMateriaId || undefined,
    lapsoId: selectedLapsoId || undefined,
    fecha: periodMode === 'diario' && selectedDate ? selectedDate : undefined,
    mes: periodMode === 'mensual' && selectedMonth ? selectedMonth : undefined,
    startDate: periodMode === 'rango' && startDate ? startDate : undefined,
    endDate: periodMode === 'rango' && endDate ? endDate : undefined,
    estado: selectedEstadoFilter || undefined,
    search: debouncedSearch || undefined,
  });

  const loadGeneralAttendance = async (options?: { silent?: boolean }) => {
    if (!isAuthorized) return;
    if (periodMode === 'rango' && startDate && endDate && startDate > endDate) {
      setAttendanceError('La fecha inicial no puede ser posterior a la fecha final.');
      setRecords([]);
      setPagination({ ...EMPTY_PAGINATION, limit });
      setSummary(EMPTY_SUMMARY);
      setLapsoBreakdown([]);
      setLoadingAsistencia(false);
      return;
    }

    if (!options?.silent) {
      setLoadingAsistencia(true);
    }
    setAttendanceError(null);
    try {
      const res = await fetchAsistenciaGeneral(buildAttendanceFilters());
      setRecords(res.data);
      setPagination(res.pagination);
      setSummary(res.summary || EMPTY_SUMMARY);
      setLapsoBreakdown(res.lapsoBreakdown || []);
    } catch (err: any) {
      console.error('Error fetching general attendance:', err);
      setAttendanceError(err?.message || 'Error al consultar el historial de asistencia.');
    } finally {
      if (!options?.silent) {
        setLoadingAsistencia(false);
      }
    }
  };

  const loadSecurityLogs = async () => {
    if (currentUser?.rol !== 'director') {
      setAuditLogs([]);
      setLogPagination({ ...EMPTY_PAGINATION, limit: logLimit });
      return;
    }
    if (logStartDate && logEndDate && logStartDate > logEndDate) {
      setLogsError('La fecha inicial no puede ser posterior a la fecha final.');
      setAuditLogs([]);
      setLogPagination({ ...EMPTY_PAGINATION, limit: logLimit });
      setLoadingLogs(false);
      return;
    }

    setLoadingLogs(true);
    setLogsError(null);
    try {
      const res = await fetchAuditLogs({
        page: logPage,
        limit: logLimit,
        accion: logFilterAction || undefined,
        search: debouncedLogSearch || undefined,
        startDate: logStartDate || undefined,
        endDate: logEndDate || undefined,
      });
      setAuditLogs(res.data);
      setLogPagination(res.pagination);
    } catch (err: any) {
      console.warn('Registro de auditoría no disponible en sesión actual:', err?.message || err);
      setLogsError(err?.message || 'No se pudieron consultar los logs de auditoría.');
      setAuditLogs([]);
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    if (isAuthorized && subTab === 'asistencias') {
      loadGeneralAttendance();
    }
  }, [
    isAuthorized,
    subTab,
    page,
    limit,
    selectedAnoId,
    selectedSeccionId,
    selectedMateriaId,
    selectedLapsoId,
    periodMode,
    selectedDate,
    selectedMonth,
    startDate,
    endDate,
    selectedEstadoFilter,
    debouncedSearch,
  ]);

  useEffect(() => {
    if (isAuthorized && subTab === 'seguridad' && currentUser?.rol === 'director') {
      loadSecurityLogs();
    }
  }, [
    isAuthorized,
    subTab,
    currentUser?.rol,
    logPage,
    logLimit,
    logFilterAction,
    debouncedLogSearch,
    logStartDate,
    logEndDate,
  ]);

  const openJustificationModal = (record: RegistroAsistencia) => {
    setEditingRecord(record);
    // Si está ausente o tarde, sugerir por defecto 'Justificado' para agilizar el flujo de coordinación
    const suggestedEstado: EstadoAsistencia =
      record.estado === 'Ausente' || record.estado === 'Tarde' ? 'Justificado' : record.estado;
    setModalEstado(suggestedEstado);
    setModalMotivo(record.motivoJustificacion || '');
    setModalNumeroJustificante(record.numeroJustificante || '');
    setModalFechaRecepcion(record.fechaRecepcionDocumento || getLocalTodayDateString());
    setModalError('');
  };

  const closeJustificationModal = () => {
    if (savingJustification) return;
    setEditingRecord(null);
    setModalError('');
  };

  const handleSaveJustification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecord) return;

    const trimmedMotivo = modalMotivo.trim();
    if (trimmedMotivo.length < 3) {
      setModalError(
        'Debe ingresar el motivo o detalle de la justificación / reposo (mínimo 3 caracteres).'
      );
      return;
    }

    if (modalFechaRecepcion && !/^\d{4}-\d{2}-\d{2}$/.test(modalFechaRecepcion)) {
      setModalError('La fecha de recepción del documento debe tener el formato YYYY-MM-DD.');
      return;
    }

    setSavingJustification(true);
    setModalError('');
    setActionFeedback(null);

    try {
      const response = await updateAsistenciaJustificacion(editingRecord.idAsistencia, {
        estado: modalEstado,
        motivoJustificacion: trimmedMotivo,
        numeroJustificante: modalNumeroJustificante.trim() || null,
        fechaRecepcionDocumento: modalFechaRecepcion || getLocalTodayDateString(),
      });

      setRecords((prev) =>
        prev.map((item) =>
          item.idAsistencia === editingRecord.idAsistencia ? response.registro : item
        )
      );

      setActionFeedback({
        type: 'success',
        text: `Asistencia de ${editingRecord.estudianteApellidos}, ${editingRecord.estudianteNombres} actualizada a "${response.registro.estado}" por ${response.registro.modificadoPorNombre || currentUser?.nombre}.`,
      });
      setEditingRecord(null);
      // Refrescar resumen global y página actual de forma silenciosa
      loadGeneralAttendance({ silent: true });
    } catch (err: any) {
      setModalError(err?.message || 'No se pudo guardar la modificación de asistencia.');
    } finally {
      setSavingJustification(false);
    }
  };

  // Si no está autorizado, mostrar bloqueo RBAC de seguridad
  if (!isAuthorized) {
    return (
      <div className="bg-white dark:bg-[#121212] rounded-3xl p-8 border border-rose-200 dark:border-rose-900/60 shadow-xl max-w-xl mx-auto my-8 text-center animate-in fade-in duration-200">
        <div className="w-16 h-16 rounded-2xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto mb-4 border border-rose-200 dark:border-rose-900">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-bold text-slate-900 dark:text-[#F4F4F5] mb-2">
          Acceso Restringido (403 Forbidden)
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4 leading-relaxed">
          El <strong>Módulo de Asistencia General y Gestión de Justificantes</strong> es accesible
          únicamente por los roles <strong>Director</strong> y <strong>Coordinador</strong>. Los docentes de aula solo realizan el pase de lista regular y no pueden alterar registros con reposos o justificantes sin aprobación de coordinación.
        </p>
        <span className="inline-block px-3 py-1 rounded-full text-xs font-mono font-bold bg-slate-100 dark:bg-[#181818] text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-[#27272A]">
          Rol detectado: {currentUser?.rol ? currentUser.rol.toUpperCase() : 'NO_AUTORIZADO'}
        </span>
      </div>
    );
  }

  // Exportar Reporte General a PDF con Membrete y Totales (obtiene lote completo filtrado hasta 500 registros)
  const handleExportPDF = async () => {
    setExportingPDF(true);
    try {
      const anoObj = anos.find((a) => a.idAno === selectedAnoId);
      const secObj = secciones.find((s) => s.idSeccion === selectedSeccionId);
      const matObj = materias.find((m) => m.idMateria === selectedMateriaId);
      const lapsoObj = lapsos.find((l) => l.id === selectedLapsoId);
      const fechaLabel =
        periodMode === 'diario' && selectedDate
          ? selectedDate
          : periodMode === 'mensual' && selectedMonth
          ? `${selectedMonth}-01`
          : periodMode === 'rango' && startDate
          ? startDate
          : lapsoObj
          ? lapsoObj.fechaInicio
          : getLocalTodayDateString();

      const fullExportRes = await fetchAsistenciaGeneral(buildAttendanceFilters(1, 500));

      generateGeneralAttendancePDF({
        nombreAno: anoObj ? anoObj.nombreNivel : 'Todos los Años Escolares',
        nombreSeccion: secObj ? secObj.nombreSeccion : 'Todas las Secciones',
        fecha: fechaLabel,
        materiaNombre: matObj ? matObj.nombreMateria : undefined,
        lapsoLabel: lapsoObj
          ? `${lapsoObj.nombre} (${formatDateEs(lapsoObj.fechaInicio)} al ${formatDateEs(lapsoObj.fechaFin)})`
          : 'Todos los Lapsos',
        lapsoBreakdown: fullExportRes.lapsoBreakdown || lapsoBreakdown,
        registros: fullExportRes.data,
        generadoPor: {
          nombre: currentUser ? `${currentUser.nombre} ${currentUser.apellidos}` : 'Dirección General',
          rol: currentUser?.rol === 'director' ? 'Director General' : 'Coordinador Académico',
        },
        config: {
          nombrePlantel: instConfig.nombrePlantel,
          anoLectivo: instConfig.anoLectivo,
        },
      });
    } catch (err) {
      console.error('Error al generar PDF de Asistencia General:', err);
    } finally {
      setExportingPDF(false);
    }
  };

  const getActionBadge = (accion: string) => {
    if (accion.includes('DENEGADO') || accion.includes('FALLIDO') || accion.includes('NO_ASIGNADA')) {
      return 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800';
    }
    if (accion.includes('CREADO') || accion.includes('REGISTRADA') || accion.includes('EXITOSO')) {
      return 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800';
    }
    if (accion.includes('ELIMINADO')) {
      return 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800';
    }
    return 'bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800';
  };

  // Resumen métrico global calculado por el servidor sobre todo el universo filtrado
  const totalRecords = summary.total;
  const countPresente = summary.presentes;
  const countTarde = summary.tardes;
  const countAusente = summary.ausentes;
  const countJustificadosYReposos = summary.justificadosYReposos;
  const pctAsistencia = summary.porcentajeAsistencia;
  const pageRowOffset = (pagination.page - 1) * pagination.limit;

  return (
    <div className="space-y-6">
      {/* Subtabs Selector & Export Button */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-[#121212] p-3 rounded-2xl border border-slate-200 dark:border-[#27272A] shadow-xs">
        <div className="flex items-center space-x-1.5">
          <button
            type="button"
            onClick={() => setSubTab('asistencias')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center space-x-2 cursor-pointer ${
              subTab === 'asistencias'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#181818]'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Historial, Justificantes y Reposos</span>
          </button>

          {currentUser?.rol === 'director' && (
            <button
              type="button"
              onClick={() => setSubTab('seguridad')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center space-x-2 cursor-pointer ${
                subTab === 'seguridad'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#181818]'
              }`}
            >
              <Shield className="w-4 h-4" />
              <span>Logs de Seguridad y Auditoría</span>
            </button>
          )}
        </div>

        <div className="flex items-center space-x-2">
          {subTab === 'asistencias' && (
            <button
              type="button"
              onClick={handleExportPDF}
              disabled={exportingPDF || totalRecords === 0}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm flex items-center space-x-2 transition-all cursor-pointer disabled:opacity-50"
              title="Exportar documento oficial en formato PDF listo para impresión"
            >
              <FileDown className="w-4 h-4" />
              <span>{exportingPDF ? 'Generando PDF...' : 'Exportar Reporte PDF'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => (subTab === 'asistencias' ? loadGeneralAttendance() : loadSecurityLogs())}
            className="px-3 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-[#181818] text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#27272A] border border-slate-200 dark:border-[#27272A] transition-colors flex items-center space-x-1.5 cursor-pointer"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${
                (subTab === 'asistencias' ? loadingAsistencia : loadingLogs) ? 'animate-spin' : ''
              }`}
            />
            <span className="hidden sm:inline">Actualizar</span>
          </button>
        </div>
      </div>

      {/* VIEW 1: ASISTENCIA GENERAL INSTITUCIONAL Y JUSTIFICACIONES */}
      {subTab === 'asistencias' && (
        <div className="space-y-6">
          {/* Panel de Filtros Granulares */}
          <div className="bg-white dark:bg-[#121212] p-5 rounded-2xl border border-slate-200 dark:border-[#27272A] shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-xl">
                  <Building className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-[#F4F4F5]">
                    Consolidado de Asistencia y Gestión de Justificantes
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Consulta histórica diaria o mensual. Haga clic sobre cualquier registro para aprobar un justificante o reposo médico.
                  </p>
                </div>
              </div>

              <span className="px-3 py-1 rounded-full text-xs font-extrabold uppercase bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 self-start sm:self-center">
                {currentUser?.rol === 'director' ? 'Dirección' : 'Coordinación'}
              </span>
            </div>

            {/* Filter grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3 pt-3 border-t border-slate-100 dark:border-[#27272A]">
              {/* 0. Lapso Escolar */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Lapso Escolar:
                </label>
                <select
                  value={selectedLapsoId}
                  onChange={(e) => {
                    const nextLapso = Number(e.target.value);
                    setSelectedLapsoId(nextLapso);
                    if (nextLapso > 0 && periodMode === 'mensual') {
                      setPeriodMode('todos');
                    }
                    setPage(1);
                  }}
                  className="w-full bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 dark:text-[#F4F4F5] focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value={0}>Todos los Lapsos</option>
                  {lapsos.map((lapso) => (
                    <option key={lapso.id} value={lapso.id}>
                      {lapso.nombre}
                      {lapso.activo ? ' (Actual)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* 1. Año Escolar */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Año Escolar:
                </label>
                <select
                  value={selectedAnoId}
                  onChange={(e) => {
                    setSelectedAnoId(Number(e.target.value));
                    setSelectedSeccionId(0);
                    setSelectedMateriaId(0);
                    setPage(1);
                  }}
                  className="w-full bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] rounded-xl px-3 py-2 text-xs font-medium text-slate-800 dark:text-[#F4F4F5] focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value={0}>Todos los Años</option>
                  {anos.map((ano) => (
                    <option key={ano.idAno} value={ano.idAno}>
                      {ano.nombreNivel}
                    </option>
                  ))}
                </select>
              </div>

              {/* 2. Sección */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Sección:
                </label>
                <select
                  value={selectedSeccionId}
                  onChange={(e) => {
                    setSelectedSeccionId(Number(e.target.value));
                    setPage(1);
                  }}
                  className="w-full bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] rounded-xl px-3 py-2 text-xs font-medium text-slate-800 dark:text-[#F4F4F5] focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value={0}>Todas las Secciones</option>
                  {availableSecciones.map((sec) => (
                    <option key={sec.idSeccion} value={sec.idSeccion}>
                      Sección {sec.nombreSeccion} ({sec.nombreNivel})
                    </option>
                  ))}
                </select>
              </div>

              {/* 3. Materia */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Asignatura:
                </label>
                <select
                  value={selectedMateriaId}
                  onChange={(e) => {
                    setSelectedMateriaId(Number(e.target.value));
                    setPage(1);
                  }}
                  className="w-full bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] rounded-xl px-3 py-2 text-xs font-medium text-slate-800 dark:text-[#F4F4F5] focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value={0}>Todas las Materias</option>
                  {availableMaterias.map((m) => (
                    <option key={m.idMateria} value={m.idMateria}>
                      {m.nombreMateria}
                    </option>
                  ))}
                </select>
              </div>

              {/* 4. Periodo (Mensual / Diario / Rango / Todos) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Periodo de Historial:
                </label>
                <div className="flex flex-col gap-1.5">
                  <div className="flex gap-1.5">
                    <select
                      value={periodMode}
                      onChange={(e) => {
                        setPeriodMode(e.target.value as 'mensual' | 'diario' | 'rango' | 'todos');
                        setPage(1);
                      }}
                      className="w-28 shrink-0 bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] rounded-xl px-2.5 py-2 text-xs font-semibold text-slate-800 dark:text-[#F4F4F5] focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      <option value="mensual">Por Mes</option>
                      <option value="diario">Por Día</option>
                      <option value="rango">Rango Fechas</option>
                      <option value="todos">Todo el historial</option>
                    </select>
                    {periodMode === 'diario' && (
                      <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => {
                          setSelectedDate(e.target.value);
                          setPage(1);
                        }}
                        className="w-full min-w-0 bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] rounded-xl px-2.5 py-2 text-xs font-medium text-slate-800 dark:text-[#F4F4F5] focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                      />
                    )}
                    {periodMode === 'mensual' && (
                      <input
                        type="month"
                        value={selectedMonth}
                        onChange={(e) => {
                          setSelectedMonth(e.target.value);
                          setPage(1);
                        }}
                        className="w-full min-w-0 bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] rounded-xl px-2.5 py-2 text-xs font-medium text-slate-800 dark:text-[#F4F4F5] focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                      />
                    )}
                  </div>
                  {periodMode === 'rango' && (
                    <div className="grid grid-cols-2 gap-1.5">
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => {
                          setStartDate(e.target.value);
                          setPage(1);
                        }}
                        title="Fecha inicial"
                        className="w-full min-w-0 bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] rounded-xl px-2 py-1.5 text-[11px] font-medium text-slate-800 dark:text-[#F4F4F5] focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                      />
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => {
                          setEndDate(e.target.value);
                          setPage(1);
                        }}
                        title="Fecha final"
                        className="w-full min-w-0 bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] rounded-xl px-2 py-1.5 text-[11px] font-medium text-slate-800 dark:text-[#F4F4F5] focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* 5. Estado */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Filtrar Estatus:
                </label>
                <select
                  value={selectedEstadoFilter}
                  onChange={(e) => {
                    setSelectedEstadoFilter(e.target.value as EstadoAsistencia | '');
                    setPage(1);
                  }}
                  className="w-full bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] rounded-xl px-3 py-2 text-xs font-medium text-slate-800 dark:text-[#F4F4F5] focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="">Todos los Estatus</option>
                  <option value="Ausente">Ausente</option>
                  <option value="Tarde">Tarde</option>
                  <option value="Presente">Presente</option>
                  <option value="Justificado">Justificado</option>
                  <option value="Reposo Médico">Reposo Médico</option>
                </select>
              </div>

              {/* 6. Búsqueda (Server-side con debounce) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Buscar Estudiante / Soporte:
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Cédula, nombre o N° justificante..."
                    value={searchStudent}
                    onChange={(e) => setSearchStudent(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] rounded-xl pl-9 pr-3 py-2 text-xs font-medium text-slate-800 dark:text-[#F4F4F5] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {attendanceError && (
            <div className="p-3.5 rounded-2xl text-xs font-semibold flex items-center justify-between gap-2 border bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{attendanceError}</span>
              </div>
              <button
                type="button"
                onClick={() => setAttendanceError(null)}
                className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {actionFeedback && (
            <div
              className={`p-3.5 rounded-2xl text-xs font-semibold flex items-center justify-between gap-2 border ${
                actionFeedback.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                  : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300'
              }`}
            >
              <div className="flex items-center gap-2">
                {actionFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                )}
                <span>{actionFeedback.text}</span>
              </div>
              <button
                type="button"
                onClick={() => setActionFeedback(null)}
                className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* KPI Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-white dark:bg-[#121212] p-3.5 rounded-2xl border border-slate-200 dark:border-[#27272A] shadow-2xs">
              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Registros Evaluados
              </p>
              <p className="text-xl sm:text-2xl font-black text-slate-900 dark:text-[#F4F4F5] mt-1">
                {totalRecords}
              </p>
            </div>

            <div className="bg-emerald-50/70 dark:bg-emerald-950/30 p-3.5 rounded-2xl border border-emerald-200/80 dark:border-emerald-800/60 shadow-2xs">
              <p className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider">
                Presentes
              </p>
              <p className="text-xl sm:text-2xl font-black text-emerald-800 dark:text-emerald-200 mt-1">
                {countPresente}
              </p>
            </div>

            <div className="bg-amber-50/70 dark:bg-amber-950/30 p-3.5 rounded-2xl border border-amber-200/80 dark:border-amber-800/60 shadow-2xs">
              <p className="text-[10px] font-bold text-amber-700 dark:text-amber-300 uppercase tracking-wider">
                Tardanzas
              </p>
              <p className="text-xl sm:text-2xl font-black text-amber-800 dark:text-amber-200 mt-1">
                {countTarde}
              </p>
            </div>

            <div className="bg-rose-50/70 dark:bg-rose-950/30 p-3.5 rounded-2xl border border-rose-200/80 dark:border-rose-800/60 shadow-2xs">
              <p className="text-[10px] font-bold text-rose-700 dark:text-rose-300 uppercase tracking-wider">
                Ausentes
              </p>
              <p className="text-xl sm:text-2xl font-black text-rose-800 dark:text-rose-200 mt-1">
                {countAusente}
              </p>
            </div>

            <div className="bg-violet-50/70 dark:bg-violet-950/30 p-3.5 rounded-2xl border border-violet-200/80 dark:border-violet-800/60 shadow-2xs">
              <p className="text-[10px] font-bold text-violet-700 dark:text-violet-300 uppercase tracking-wider">
                Justif. / Reposos
              </p>
              <p className="text-xl sm:text-2xl font-black text-violet-800 dark:text-violet-200 mt-1">
                {countJustificadosYReposos}
              </p>
            </div>

            <div className="bg-indigo-50/70 dark:bg-indigo-950/30 p-3.5 rounded-2xl border border-indigo-200/80 dark:border-indigo-800/60 shadow-2xs">
              <p className="text-[10px] font-bold text-indigo-700 dark:text-indigo-300 uppercase tracking-wider">
                Índice Global
              </p>
              <p className="text-xl sm:text-2xl font-black text-indigo-800 dark:text-indigo-200 mt-1">
                {pctAsistencia}%
              </p>
            </div>
          </div>

          {/* Desglose Estructurado por Lapso Escolar */}
          {lapsoBreakdown.length > 0 && (
            <div className="bg-white dark:bg-[#121212] p-4 rounded-2xl border border-slate-200 dark:border-[#27272A] shadow-xs space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CalendarRange className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Desglose Estadístico por Lapso Escolar
                  </h3>
                </div>
                {selectedLapsoId > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedLapsoId(0);
                      setPage(1);
                    }}
                    className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                  >
                    Ver todos los lapsos
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {lapsoBreakdown.map((lb) => {
                  const isSelected = lb.lapsoId !== null && selectedLapsoId === lb.lapsoId;
                  return (
                    <button
                      key={lb.lapsoId ?? lb.nombre}
                      type="button"
                      disabled={lb.lapsoId === null}
                      onClick={() => {
                        if (lb.lapsoId === null) return;
                        const nextId = isSelected ? 0 : lb.lapsoId;
                        setSelectedLapsoId(nextId);
                        if (nextId > 0 && periodMode === 'mensual') {
                          setPeriodMode('todos');
                        }
                        setPage(1);
                      }}
                      className={`text-left p-3.5 rounded-xl border transition-all ${
                        lb.lapsoId === null ? 'cursor-default opacity-85' : 'cursor-pointer'
                      } ${
                        isSelected
                          ? 'bg-indigo-50/90 dark:bg-indigo-950/40 border-indigo-400 dark:border-indigo-700 ring-2 ring-indigo-200 dark:ring-indigo-900/50'
                          : 'bg-slate-50/70 dark:bg-[#181818] border-slate-200 dark:border-[#27272A] hover:border-indigo-300 dark:hover:border-indigo-800'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-bold text-xs text-slate-900 dark:text-[#F4F4F5] truncate">
                            {lb.nombre}
                          </span>
                          {lb.activo && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 shrink-0">
                              Actual
                            </span>
                          )}
                        </div>
                        <span className="text-xs font-black text-indigo-700 dark:text-indigo-300 shrink-0">
                          {lb.porcentajeAsistencia}%
                        </span>
                      </div>
                      <p className="text-[10px] font-mono text-slate-500 dark:text-slate-400 mb-2">
                        {lb.fechaInicio && lb.fechaFin
                          ? `${formatDateEs(lb.fechaInicio)} — ${formatDateEs(lb.fechaFin)}`
                          : 'Fuera de rango de lapso'}
                      </p>
                      <div className="grid grid-cols-4 gap-1 text-center text-[10px]">
                        <div className="bg-white dark:bg-[#121212] rounded-lg py-1 border border-slate-200/70 dark:border-[#27272A]">
                          <div className="font-bold text-emerald-600 dark:text-emerald-400">
                            {lb.presentes}
                          </div>
                          <div className="text-slate-400">Pres.</div>
                        </div>
                        <div className="bg-white dark:bg-[#121212] rounded-lg py-1 border border-slate-200/70 dark:border-[#27272A]">
                          <div className="font-bold text-amber-600 dark:text-amber-400">
                            {lb.tardes}
                          </div>
                          <div className="text-slate-400">Tarde</div>
                        </div>
                        <div className="bg-white dark:bg-[#121212] rounded-lg py-1 border border-slate-200/70 dark:border-[#27272A]">
                          <div className="font-bold text-rose-600 dark:text-rose-400">
                            {lb.ausentes}
                          </div>
                          <div className="text-slate-400">Aus.</div>
                        </div>
                        <div className="bg-white dark:bg-[#121212] rounded-lg py-1 border border-slate-200/70 dark:border-[#27272A]">
                          <div className="font-bold text-violet-600 dark:text-violet-400">
                            {lb.justificadosYReposos}
                          </div>
                          <div className="text-slate-400">Justif.</div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Table Container */}
          <div className="bg-white dark:bg-[#121212] rounded-2xl border border-slate-200 dark:border-[#27272A] overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-[#181818] border-b border-slate-200 dark:border-[#27272A] text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    <th className="py-3 px-4 w-12 text-center">N°</th>
                    <th className="py-3 px-4 min-w-[180px]">Estudiante</th>
                    <th className="py-3 px-4 min-w-[110px]">Cédula</th>
                    <th className="py-3 px-4 min-w-[110px]">Sección / Nivel</th>
                    <th className="py-3 px-4 min-w-[130px]">Asignatura</th>
                    <th className="py-3 px-4 min-w-[100px]">Fecha / Hora</th>
                    <th className="py-3 px-4 min-w-[180px]">Estatus y Justificante</th>
                    <th className="py-3 px-4 w-32 text-center">Gestión</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#27272A]">
                  {loadingAsistencia ? (
                    renderTableSkeleton(6, 8)
                  ) : records.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400 dark:text-slate-500">
                        No se encontraron registros de asistencia con los filtros seleccionados.
                      </td>
                    </tr>
                  ) : (
                    records.map((r, idx) => (
                      <tr
                        key={r.idAsistencia}
                        onClick={() => openJustificationModal(r)}
                        className="hover:bg-indigo-50/40 dark:hover:bg-indigo-950/20 transition-colors cursor-pointer group"
                        title="Clic para gestionar justificación o reposo médico"
                      >
                        <td className="py-3 px-4 text-center font-mono text-slate-400 font-bold">
                          {pageRowOffset + idx + 1}
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-900 dark:text-[#F4F4F5]">
                          {r.estudianteApellidos}, {r.estudianteNombres}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-slate-600 dark:text-slate-400">
                          {formatCedula(r.estudianteCedula || '')}
                        </td>
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                          {r.nombreNivel ? `${r.nombreNivel} - ${r.nombreSeccion || 'U'}` : 'N/A'}
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-800 dark:text-slate-200">
                          {r.nombreMateria || 'General'}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-400">
                          <div>{formatDateEs(r.fecha)}</div>
                          <div className="text-[10px] text-slate-400">
                            {formatTime(r.horaEntrada || '')}
                          </div>
                          {r.lapsoNombre && (
                            <div className="text-[10px] font-sans font-semibold text-indigo-600 dark:text-indigo-400 mt-0.5">
                              {r.lapsoNombre}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="space-y-1">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${getStatusBadgeClasses(
                                r.estado
                              )}`}
                            >
                              {r.estado === 'Reposo Médico' && <Stethoscope className="w-3 h-3" />}
                              {r.estado === 'Justificado' && <FileCheck2 className="w-3 h-3" />}
                              <span>{r.estado}</span>
                            </span>

                            {r.motivoJustificacion && (
                              <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-snug line-clamp-2">
                                {r.numeroJustificante && (
                                  <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400 mr-1">
                                    [{r.numeroJustificante}]
                                  </span>
                                )}
                                {r.motivoJustificacion}
                              </p>
                            )}

                            {r.modificadoPorNombre && (
                              <p className="text-[10px] text-slate-400 dark:text-slate-500">
                                Validado por {r.modificadoPorNombre}
                                {r.fechaRecepcionDocumento
                                  ? ` • Recibido: ${formatDateEs(r.fechaRecepcionDocumento)}`
                                  : ''}
                              </p>
                            )}
                          </div>
                        </td>
                        <td
                          className="py-3 px-4 text-center"
                          onClick={(e) => {
                            e.stopPropagation();
                            openJustificationModal(r);
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => openJustificationModal(r)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-bold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-600 hover:text-white dark:hover:bg-indigo-600 dark:hover:text-white transition-colors cursor-pointer"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>Justificar</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <PaginationControls
              pagination={pagination}
              pageSize={limit}
              onPageChange={(nextPage) => setPage(nextPage)}
              onPageSizeChange={(nextLimit) => {
                setLimit(nextLimit);
                setPage(1);
              }}
              loading={loadingAsistencia}
              itemLabel="registros"
            />
          </div>
        </div>
      )}

      {/* VIEW 2: LOGS DE SEGURIDAD Y AUDITORÍA (ROL EXCLUSIVO: DIRECTOR) */}
      {subTab === 'seguridad' && currentUser?.rol === 'director' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-[#121212] p-5 rounded-2xl border border-slate-200 dark:border-[#27272A] shadow-xs">
            <div className="flex items-center space-x-3 mb-4">
              <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-xl">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-[#F4F4F5]">
                  Logs de Seguridad y Auditoría Criptográfica
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Trazabilidad inmutable de inicios de sesión, registros y justificaciones de asistencia, violaciones RBAC y cambios de horarios
                </p>
              </div>
            </div>

            {/* Filters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3 border-t border-slate-100 dark:border-[#27272A]">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Filtrar por Tipo de Acción:
                </label>
                <select
                  value={logFilterAction}
                  onChange={(e) => {
                    setLogFilterAction(e.target.value);
                    setLogPage(1);
                  }}
                  className="w-full bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] rounded-xl px-3 py-2 text-xs font-medium text-slate-800 dark:text-[#F4F4F5] focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="">Todas las Acciones</option>
                  <option value="LOGIN_">Inicios de Sesión (Éxitos / Fallos)</option>
                  <option value="ASISTENCIA_">Asistencias y Justificaciones</option>
                  <option value="REPRESENTANTE_">Representantes y Credenciales</option>
                  <option value="HORARIO_">Malla Horaria</option>
                  <option value="DENEGADO">Violaciones de Permisos (Denegados)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Desde (Fecha):
                </label>
                <input
                  type="date"
                  value={logStartDate}
                  onChange={(e) => {
                    setLogStartDate(e.target.value);
                    setLogPage(1);
                  }}
                  className="w-full bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] rounded-xl px-3 py-2 text-xs font-medium text-slate-800 dark:text-[#F4F4F5] focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Hasta (Fecha):
                </label>
                <input
                  type="date"
                  value={logEndDate}
                  onChange={(e) => {
                    setLogEndDate(e.target.value);
                    setLogPage(1);
                  }}
                  className="w-full bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] rounded-xl px-3 py-2 text-xs font-medium text-slate-800 dark:text-[#F4F4F5] focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Buscar en Registros:
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Usuario, IP, acción o entidad..."
                    value={logSearch}
                    onChange={(e) => setLogSearch(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] rounded-xl pl-9 pr-3 py-2 text-xs font-medium text-slate-800 dark:text-[#F4F4F5] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {logsError && (
            <div className="p-3.5 rounded-2xl text-xs font-semibold flex items-center justify-between gap-2 border bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{logsError}</span>
              </div>
              <button
                type="button"
                onClick={() => setLogsError(null)}
                className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Audit Logs Table */}
          <div className="bg-white dark:bg-[#121212] rounded-2xl border border-slate-200 dark:border-[#27272A] overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-[#181818] border-b border-slate-200 dark:border-[#27272A] text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    <th className="py-3 px-4">Fecha y Hora</th>
                    <th className="py-3 px-4">Acción Auditada</th>
                    <th className="py-3 px-4">Usuario / Cédula</th>
                    <th className="py-3 px-4">Rol</th>
                    <th className="py-3 px-4">Entidad</th>
                    <th className="py-3 px-4">IP Origen</th>
                    <th className="py-3 px-4 text-center">Detalles</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#27272A]">
                  {loadingLogs ? (
                    renderTableSkeleton(6, 7)
                  ) : auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400 dark:text-slate-500">
                        No se encontraron registros de auditoría para los criterios seleccionados.
                      </td>
                    </tr>
                  ) : (
                    auditLogs.map((log) => (
                      <tr
                        key={log.idLog}
                        className="hover:bg-slate-50/70 dark:hover:bg-[#181818]/70 transition-colors"
                      >
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                          {new Date(log.createdAt).toLocaleString('es-VE')}
                        </td>
                        <td className="py-3 px-4 font-bold">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-extrabold border ${getActionBadge(
                              log.accion
                            )}`}
                          >
                            {log.accion}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-800 dark:text-slate-200">
                          {log.emailOCedula || `Usuario #${log.idUsuario || 'N/A'}`}
                        </td>
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-400 uppercase font-semibold text-[10px]">
                          {log.rol || 'Sistema'}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-400">
                          {log.entidad}
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                          {log.ipOrigen || '127.0.0.1'}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {log.detalles && (
                            <button
                              type="button"
                              onClick={() => setSelectedLogDetail(log)}
                              className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-[#181818] text-indigo-600 dark:text-indigo-400 hover:bg-slate-200 dark:hover:bg-[#27272A] text-[10px] font-bold cursor-pointer"
                            >
                              Ver JSON
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <PaginationControls
              pagination={logPagination}
              pageSize={logLimit}
              onPageChange={(nextPage) => setLogPage(nextPage)}
              onPageSizeChange={(nextLimit) => {
                setLogLimit(nextLimit);
                setLogPage(1);
              }}
              loading={loadingLogs}
              itemLabel="eventos"
            />
          </div>
        </div>
      )}

      {/* MODAL DE JUSTIFICACIÓN / REPOSO MÉDICO */}
      {editingRecord && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={closeJustificationModal}
        >
          <div
            className="bg-white dark:bg-[#121212] rounded-3xl border border-slate-200 dark:border-[#27272A] shadow-2xl max-w-xl w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-5 bg-slate-50 dark:bg-[#181818] border-b border-slate-200 dark:border-[#27272A] flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                  <ClipboardCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-[#F4F4F5]">
                    Justificación y Reposo Médico
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Modificación auditada del registro #{editingRecord.idAsistencia}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeJustificationModal}
                disabled={savingJustification}
                className="p-1.5 rounded-xl hover:bg-slate-200 dark:hover:bg-[#27272A] text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveJustification} className="p-5 space-y-4">
              {/* Student & Class Summary */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">
                    Estudiante
                  </span>
                  <span className="font-bold text-slate-900 dark:text-[#F4F4F5]">
                    {editingRecord.estudianteApellidos}, {editingRecord.estudianteNombres}
                  </span>
                  <span className="block font-mono text-[11px] text-slate-500 dark:text-slate-400">
                    {formatCedula(editingRecord.estudianteCedula || '')}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">
                    Clase y Fecha
                  </span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {editingRecord.nombreMateria || 'Asignatura'}
                  </span>
                  <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                    {formatDateEs(editingRecord.fecha)} • {formatTime(editingRecord.horaEntrada)}
                  </span>
                </div>
              </div>

              {/* Status selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                  Nuevo Estatus de Asistencia <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {MODAL_ESTADOS.map((opt) => {
                    const isSelected = modalEstado === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setModalEstado(opt.value)}
                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                          isSelected
                            ? opt.activeClass
                            : 'bg-slate-50 dark:bg-[#181818] border-slate-200 dark:border-[#27272A] text-slate-700 dark:text-slate-300 hover:border-indigo-300 dark:hover:border-indigo-700'
                        }`}
                      >
                        <div className="text-xs font-extrabold">{opt.label}</div>
                        <div
                          className={`text-[10px] mt-0.5 ${
                            isSelected ? 'text-white/90' : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {opt.desc}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Motivo obligatorio */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Motivo, Diagnóstico o Detalles del Soporte <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  minLength={3}
                  maxLength={500}
                  value={modalMotivo}
                  onChange={(e) => setModalMotivo(e.target.value)}
                  placeholder="Ej: Reposo médico por cuadro viral de 48 horas emitido por Centro de Salud..."
                  className="w-full bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-[#F4F4F5] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                  <span>Obligatorio para auditoría institucional</span>
                  <span>{modalMotivo.length}/500</span>
                </div>
              </div>

              {/* Número de justificante + Fecha de recepción */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    N° de Justificante / Reposo (Opcional)
                  </label>
                  <div className="relative">
                    <FileText className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      maxLength={80}
                      value={modalNumeroJustificante}
                      onChange={(e) => setModalNumeroJustificante(e.target.value)}
                      placeholder="Ej: REP-2026-0148"
                      className="w-full bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] rounded-xl pl-8 pr-3 py-2 text-xs font-mono text-slate-900 dark:text-[#F4F4F5] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Fecha de Recepción del Documento
                  </label>
                  <div className="relative">
                    <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="date"
                      value={modalFechaRecepcion}
                      onChange={(e) => setModalFechaRecepcion(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] rounded-xl pl-8 pr-3 py-2 text-xs font-medium text-slate-900 dark:text-[#F4F4F5] focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* Audit attribution */}
              <div className="p-3 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200/80 dark:border-indigo-800/60 text-[11px] text-indigo-900 dark:text-indigo-200 space-y-1">
                <div className="flex items-center gap-1.5 font-bold">
                  <User className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>
                    Responsable de esta modificación: {currentUser?.nombre}{' '}
                    {currentUser?.apellidos} ({currentUser?.rol.toUpperCase()})
                  </span>
                </div>
                {editingRecord.modificadoPorNombre && (
                  <p className="text-[10px] text-indigo-700 dark:text-indigo-300">
                    Última edición previa por {editingRecord.modificadoPorNombre}
                    {editingRecord.fechaModificacion
                      ? ` el ${new Date(editingRecord.fechaModificacion).toLocaleString('es-VE')}`
                      : ''}
                    .
                  </p>
                )}
              </div>

              {modalError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-[#27272A]">
                <button
                  type="button"
                  onClick={closeJustificationModal}
                  disabled={savingJustification}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-[#181818] text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#27272A] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingJustification}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {savingJustification ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>Guardar Justificación</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* JSON Details Modal */}
      {selectedLogDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#121212] rounded-3xl p-6 border border-slate-200 dark:border-[#27272A] shadow-2xl max-w-lg w-full">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100 dark:border-[#27272A]">
              <h3 className="font-bold text-sm text-slate-900 dark:text-[#F4F4F5]">
                Detalles del Evento #{selectedLogDetail.idLog}
              </h3>
              <button
                type="button"
                onClick={() => setSelectedLogDetail(null)}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-[#181818] text-slate-500 cursor-pointer"
              >
                ✕
              </button>
            </div>
            <pre className="bg-slate-50 dark:bg-[#000000] p-4 rounded-xl text-xs font-mono text-slate-800 dark:text-emerald-400 overflow-x-auto border border-slate-200 dark:border-[#27272A] max-h-64">
              {JSON.stringify(selectedLogDetail.detalles, null, 2)}
            </pre>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedLogDetail(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-200 dark:bg-[#27272A] text-slate-800 dark:text-slate-200 hover:bg-slate-300 cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

