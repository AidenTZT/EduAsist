import React, { useState, useEffect } from 'react';
import {
  CalendarCheck,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  Save,
  HelpCircle,
  RefreshCw,
  ArrowUpDown,
  Check,
  Smartphone,
  Table,
  Layers,
  Lock,
  ShieldCheck,
  CalendarRange,
} from 'lucide-react';
import type {
  AnoEscolar,
  Seccion,
  Materia,
  Estudiante,
  RegistroAsistencia,
  EstadoAsistencia,
  Usuario,
  DocenteMateria,
  LapsoEscolar,
  InstitutionalConfigSummary,
  RecesoInstitucional,
} from '../types.ts';
import {
  fetchAsistencia,
  fetchLapsoActivo,
  submitAsistenciaBatch,
  fetchConfiguracion,
  fetchRecesos,
} from '../lib/api.ts';
import { formatCedula, sortStudentsByCedula, getLocalTodayDateString } from '../lib/utils.ts';
import { SchoolScheduleStatusBanner } from './SchoolScheduleStatusBanner.tsx';

interface AttendanceManagerProps {
  anos: AnoEscolar[];
  secciones: Seccion[];
  materias: Materia[];
  docenteMaterias: DocenteMateria[];
  estudiantes: Estudiante[];
  currentUser: Usuario | null;
  onRefreshData: () => void;
  preselectedTarget?: {
    idAno?: number;
    idSeccion?: number;
    idMateria?: number;
    timestamp?: number;
  } | null;
}

export const AttendanceManager: React.FC<AttendanceManagerProps> = ({
  anos,
  secciones,
  materias,
  docenteMaterias,
  estudiantes,
  currentUser,
  onRefreshData,
  preselectedTarget,
}) => {
  const [selectedAnoId, setSelectedAnoId] = useState<number>(anos[0]?.idAno || 1);
  const [selectedSeccionId, setSelectedSeccionId] = useState<number>(0);
  const [selectedMateriaId, setSelectedMateriaId] = useState<number>(0);
  const [fecha, setFecha] = useState<string>(() => getLocalTodayDateString());

  // Mobile Tactile Cards view vs Desktop Table view
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  // Attendance map: idEstudiante -> { estado, horaEntrada, isModified, lockedByCoordination, motivoJustificacion, numeroJustificante }
  const [attendanceMap, setAttendanceMap] = useState<
    Record<
      number,
      {
        estado: EstadoAsistencia;
        horaEntrada: string;
        isModified: boolean;
        lockedByCoordination?: boolean;
        motivoJustificacion?: string | null;
        numeroJustificante?: string | null;
      }
    >
  >({});
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );
  const [lapsos, setLapsos] = useState<LapsoEscolar[]>([]);
  const [activeLapso, setActiveLapso] = useState<LapsoEscolar | null>(null);
  const [instConfig, setInstConfig] = useState<InstitutionalConfigSummary | null>(null);
  const [recesos, setRecesos] = useState<RecesoInstitucional[]>([]);

  useEffect(() => {
    if (!currentUser) return;
    fetchLapsoActivo()
      .then((res) => {
        setActiveLapso(res.lapsoActivo);
        setLapsos(res.lapsos || []);
      })
      .catch(() => {});
    Promise.all([fetchConfiguracion(), fetchRecesos(true)])
      .then(([cfg, rec]) => {
        setInstConfig(cfg);
        setRecesos(rec);
      })
      .catch(() => {});
  }, [currentUser?.id]);

  const detectedFechaLapso =
    lapsos.find((l) => fecha >= l.fechaInicio && fecha <= l.fechaFin) || activeLapso;

  // RBAC: Acceso permitido a Docente (sus materias asignadas), Coordinador y Director (acceso completo)
  const canTakeAttendance =
    currentUser?.rol === 'director' ||
    currentUser?.rol === 'coordinador' ||
    currentUser?.rol === 'docente';
  const isDocente = currentUser?.rol === 'docente';
  const isDirectorOrCoord =
    currentUser?.rol === 'director' || currentUser?.rol === 'coordinador';
  const assignedMateriaIds = isDocente
    ? docenteMaterias.filter((dm) => dm.idUsuario === currentUser?.id).map((dm) => dm.idMateria)
    : null;

  // Sincronizar año por defecto cuando el catálogo cargue desde el backend
  useEffect(() => {
    if (anos.length > 0 && !anos.some((a) => a.idAno === selectedAnoId)) {
      setSelectedAnoId(anos[0].idAno);
    }
  }, [anos, selectedAnoId]);

  // Aplicar preselección directa desde el módulo "Horarios & En Clase Ahora"
  useEffect(() => {
    if (!preselectedTarget) return;
    if (preselectedTarget.idAno) {
      setSelectedAnoId(preselectedTarget.idAno);
    }
    if (preselectedTarget.idSeccion !== undefined) {
      setSelectedSeccionId(preselectedTarget.idSeccion);
    }
    if (preselectedTarget.idMateria) {
      setSelectedMateriaId(preselectedTarget.idMateria);
    }
  }, [preselectedTarget]);

  // Filter materias by selected year AND RBAC restrictions
  const filteredMaterias = materias.filter((m) => {
    const matchesYear = m.idAno === selectedAnoId;
    const isAssigned = !assignedMateriaIds || assignedMateriaIds.includes(m.idMateria);
    return matchesYear && isAssigned;
  });

  // Filter secciones by selected year
  const filteredSecciones = secciones.filter((s) => s.idAno === selectedAnoId);

  // Default selections
  useEffect(() => {
    if (filteredSecciones.length > 0) {
      const exists = filteredSecciones.some((s) => s.idSeccion === selectedSeccionId);
      if (!exists && selectedSeccionId !== 0) {
        setSelectedSeccionId(filteredSecciones[0].idSeccion);
      }
    } else {
      setSelectedSeccionId(0);
    }
  }, [selectedAnoId, filteredSecciones]);

  useEffect(() => {
    if (filteredMaterias.length > 0) {
      const exists = filteredMaterias.some((m) => m.idMateria === selectedMateriaId);
      if (!exists) {
        setSelectedMateriaId(filteredMaterias[0].idMateria);
      }
    } else {
      setSelectedMateriaId(0);
    }
  }, [selectedAnoId, filteredMaterias]);

  // Filter students by selected year AND section, sorted strictly by numeric Cédula
  const filteredStudents = estudiantes.filter((e) => {
    const matchesAno = e.idAnoActual === selectedAnoId;
    const matchesSeccion = selectedSeccionId === 0 || e.idSeccion === selectedSeccionId;
    return matchesAno && matchesSeccion;
  });

  const sortedStudents = sortStudentsByCedula(filteredStudents);

  // Load existing attendance
  useEffect(() => {
    if (!selectedMateriaId || !fecha || !currentUser) return;

    let isMounted = true;
    const loadDayAttendance = async () => {
      if (!currentUser) return;
      setLoading(true);
      setStatusMessage(null);
      try {
        const records: RegistroAsistencia[] = await fetchAsistencia({
          idMateria: selectedMateriaId,
          fecha,
          idSeccion: selectedSeccionId || undefined,
        });

        if (!isMounted) return;

        const newMap: Record<
          number,
          {
            estado: EstadoAsistencia;
            horaEntrada: string;
            isModified: boolean;
            lockedByCoordination?: boolean;
            motivoJustificacion?: string | null;
            numeroJustificante?: string | null;
          }
        > = {};

        const nowTime = new Date().toTimeString().split(' ')[0];

        sortedStudents.forEach((student) => {
          const found = records.find((r) => r.idEstudiante === student.idEstudiante);
          if (found) {
            const isCoordinatedLeave =
              found.estado === 'Justificado' || found.estado === 'Reposo Médico';
            newMap[student.idEstudiante] = {
              estado: found.estado,
              horaEntrada: found.horaEntrada,
              isModified: false,
              lockedByCoordination: isDocente && isCoordinatedLeave,
              motivoJustificacion: found.motivoJustificacion ?? null,
              numeroJustificante: found.numeroJustificante ?? null,
            };
          } else {
            newMap[student.idEstudiante] = {
              estado: 'Presente',
              horaEntrada: nowTime,
              isModified: false,
              lockedByCoordination: false,
            };
          }
        });

        setAttendanceMap(newMap);
      } catch (err: any) {
        if (err?.message?.includes('Acceso no autenticado') || !currentUser) {
          return;
        }
        console.error('Error fetching attendance records:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadDayAttendance();

    return () => {
      isMounted = false;
    };
  }, [selectedMateriaId, selectedSeccionId, fecha, selectedAnoId, estudiantes, currentUser]);

  const handleStatusChange = (idEstudiante: number, estado: EstadoAsistencia) => {
    if (attendanceMap[idEstudiante]?.lockedByCoordination) {
      return;
    }
    if (isDocente && (estado === 'Justificado' || estado === 'Reposo Médico')) {
      return;
    }
    const nowTime = new Date().toTimeString().split(' ')[0];
    setAttendanceMap((prev) => ({
      ...prev,
      [idEstudiante]: {
        ...prev[idEstudiante],
        estado,
        horaEntrada: nowTime,
        isModified: true,
      },
    }));
  };

  const handleMarkAll = (estado: EstadoAsistencia) => {
    if (isDocente && (estado === 'Justificado' || estado === 'Reposo Médico')) {
      return;
    }
    const nowTime = new Date().toTimeString().split(' ')[0];
    const updated = { ...attendanceMap };
    sortedStudents.forEach((s) => {
      if (updated[s.idEstudiante]?.lockedByCoordination) {
        return;
      }
      updated[s.idEstudiante] = {
        ...updated[s.idEstudiante],
        estado,
        horaEntrada: nowTime,
        isModified: true,
      };
    });
    setAttendanceMap(updated);
  };

  const handleSaveAttendance = async () => {
    if (!selectedMateriaId) {
      setStatusMessage({ type: 'error', text: 'Seleccione una materia válida' });
      return;
    }
    if (sortedStudents.length === 0) {
      setStatusMessage({ type: 'error', text: 'No hay estudiantes en el grupo seleccionado' });
      return;
    }

    setSaving(true);
    setStatusMessage(null);

    try {
      const recordsToSubmit = sortedStudents.map((s) => {
        const item = attendanceMap[s.idEstudiante] || {
          estado: 'Presente' as EstadoAsistencia,
          horaEntrada: new Date().toTimeString().split(' ')[0],
        };
        return {
          idEstudiante: s.idEstudiante,
          estado: item.estado,
          horaEntrada: item.horaEntrada,
        };
      });

      const res = await submitAsistenciaBatch(selectedMateriaId, fecha, recordsToSubmit);

      setStatusMessage({
        type: 'success',
        text: `¡Asistencia asentada exitosamente en la base de datos institucional! (${res.count} estudiantes registrados)`,
      });

      setAttendanceMap((prev) => {
        const reset: typeof prev = {};
        Object.keys(prev).forEach((k) => {
          const numKey = Number(k);
          reset[numKey] = { ...prev[numKey], isModified: false };
        });
        return reset;
      });

      onRefreshData();
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'Error al guardar la asistencia en la base de datos.',
      });
    } finally {
      setSaving(false);
    }
  };

  const counts = {
    total: sortedStudents.length,
    presentes: Object.values(attendanceMap).filter((v) => v.estado === 'Presente').length,
    tardes: Object.values(attendanceMap).filter((v) => v.estado === 'Tarde').length,
    ausentes: Object.values(attendanceMap).filter((v) => v.estado === 'Ausente').length,
    justificados: Object.values(attendanceMap).filter(
      (v) => v.estado === 'Justificado' || v.estado === 'Reposo Médico'
    ).length,
  };

  if (!canTakeAttendance) {
    return (
      <div className="bg-white dark:bg-[#121212] rounded-3xl p-8 border border-rose-200 dark:border-rose-900/60 shadow-xl max-w-xl mx-auto my-8 text-center">
        <Lock className="w-10 h-10 text-rose-500 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-slate-900 dark:text-[#F4F4F5] mb-1">
          Acceso Restringido al Pase de Asistencia
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Esta vista está disponible únicamente para los roles Docente, Coordinador y Director.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Filter and Controls */}
      <div className="bg-white dark:bg-[#121212] p-5 rounded-2xl border border-slate-200 dark:border-[#27272A] shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 rounded-xl">
              <CalendarCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900 dark:text-[#F4F4F5]">Pase de Asistencia en Aula</h2>
                {isDocente ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
                    <Lock className="w-3 h-3" />
                    Materias asignadas
                  </span>
                ) : (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 dark:bg-purple-950/40 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" />
                    {currentUser?.rol === 'director'
                      ? 'Dirección — Acceso Total'
                      : 'Coordinación — Acceso Total'}
                  </span>
                )}
                {detectedFechaLapso && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 flex items-center gap-1">
                    <CalendarRange className="w-3 h-3" />
                    {detectedFechaLapso.nombre}
                    {detectedFechaLapso.activo ? ' • Actual' : ''}
                  </span>
                )}
                <SchoolScheduleStatusBanner
                  variant="pill"
                  horaRecesoInicio={instConfig?.horaRecesoInicio}
                  horaRecesoFin={instConfig?.horaRecesoFin}
                  horaSalida={instConfig?.horaSalida}
                  recesos={recesos}
                />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Captura de hora oficial en tiempo real con optimización ergonómica táctil
              </p>
            </div>
          </div>

          {/* Quick Mark & View Switcher */}
          <div className="flex flex-wrap items-center gap-2">
            {/* View Mode Switcher: visible solo en tablets/escritorio (en móvil siempre es táctil) */}
            <div className="hidden md:flex bg-slate-100 dark:bg-[#181818] p-1 rounded-xl items-center text-xs border border-slate-200 dark:border-[#27272A]">
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                  viewMode === 'cards'
                    ? 'bg-white dark:bg-[#27272A] text-indigo-700 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
                title="Diseño táctil en tarjetas"
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>Tarjetas</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-white dark:bg-[#27272A] text-indigo-700 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
                title="Diseño en tabla para escritorio"
              >
                <Table className="w-3.5 h-3.5" />
                <span>Tabla</span>
              </button>
            </div>

            <button
              onClick={() => handleMarkAll('Presente')}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-800 transition-colors flex items-center space-x-1 cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Todos Presentes</span>
            </button>
            <button
              onClick={() => handleMarkAll('Ausente')}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/50 border border-rose-200 dark:border-rose-800 transition-colors flex items-center space-x-1 cursor-pointer"
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>Todos Ausentes</span>
            </button>
          </div>
        </div>

        {/* Filters (Grid 4 columns) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-5 pt-4 border-t border-slate-100 dark:border-[#27272A]">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Año Escolar
            </label>
            <select
              value={selectedAnoId}
              onChange={(e) => setSelectedAnoId(Number(e.target.value))}
              className="w-full bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 dark:text-[#F4F4F5] focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              {anos.map((ano) => (
                <option key={ano.idAno} value={ano.idAno}>
                  {ano.nombreNivel}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Sección
            </label>
            <select
              value={selectedSeccionId}
              onChange={(e) => setSelectedSeccionId(Number(e.target.value))}
              className="w-full bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 dark:text-[#F4F4F5] focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              <option value={0}>Todas las Secciones</option>
              {filteredSecciones.map((sec) => (
                <option key={sec.idSeccion} value={sec.idSeccion}>
                  Sección {sec.nombreSeccion}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Materia / Asignatura
            </label>
            <select
              value={selectedMateriaId}
              onChange={(e) => setSelectedMateriaId(Number(e.target.value))}
              className="w-full bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 dark:text-[#F4F4F5] focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              {filteredMaterias.length === 0 ? (
                <option value={0}>
                  {isDocente ? 'Sin materias asignadas para este año' : 'Sin materias registradas'}
                </option>
              ) : (
                filteredMaterias.map((m) => (
                  <option key={m.idMateria} value={m.idMateria}>
                    {m.nombreMateria}
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Fecha de Asistencia
            </label>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="w-full bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 dark:text-[#F4F4F5] focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Summary KPI Badges */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
        <div className="bg-white dark:bg-[#121212] p-3 rounded-xl border border-slate-200 dark:border-[#27272A]">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Estudiantes</p>
          <p className="text-xl font-extrabold text-slate-800 dark:text-[#F4F4F5] mt-0.5">{counts.total}</p>
        </div>
        <div className="bg-emerald-50/70 dark:bg-emerald-950/30 p-3 rounded-xl border border-emerald-200/80 dark:border-emerald-800/60">
          <p className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider">Presentes</p>
          <p className="text-xl font-extrabold text-emerald-800 dark:text-emerald-200 mt-0.5">{counts.presentes}</p>
        </div>
        <div className="bg-amber-50/70 dark:bg-amber-950/30 p-3 rounded-xl border border-amber-200/80 dark:border-amber-800/60">
          <p className="text-[10px] font-semibold text-amber-700 dark:text-amber-300 uppercase tracking-wider">Tardanzas</p>
          <p className="text-xl font-extrabold text-amber-800 dark:text-amber-200 mt-0.5">{counts.tardes}</p>
        </div>
        <div className="bg-rose-50/70 dark:bg-rose-950/30 p-3 rounded-xl border border-rose-200/80 dark:border-rose-800/60">
          <p className="text-[10px] font-semibold text-rose-700 dark:text-rose-300 uppercase tracking-wider">Ausentes</p>
          <p className="text-xl font-extrabold text-rose-800 dark:text-rose-200 mt-0.5">{counts.ausentes}</p>
        </div>
        <div className="bg-sky-50/70 dark:bg-sky-950/30 p-3 rounded-xl border border-sky-200/80 dark:border-sky-800/60">
          <p className="text-[10px] font-semibold text-sky-700 dark:text-sky-300 uppercase tracking-wider">Justif. / Reposos</p>
          <p className="text-xl font-extrabold text-sky-800 dark:text-sky-200 mt-0.5">{counts.justificados}</p>
        </div>
      </div>

      {isDocente ? (
        <div className="p-3 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200/80 dark:border-indigo-800/60 text-xs text-indigo-800 dark:text-indigo-200 flex items-center gap-2">
          <Lock className="w-4 h-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
          <span>
            El pase de lista docente registra únicamente <strong>Presente, Tarde o Ausente</strong>. Los justificantes y reposos médicos son aprobados exclusivamente por Coordinación o Dirección.
          </span>
        </div>
      ) : (
        isDirectorOrCoord && (
          <div className="p-3 rounded-xl bg-purple-50/70 dark:bg-purple-950/30 border border-purple-200/80 dark:border-purple-800/60 text-xs text-purple-900 dark:text-purple-200 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 shrink-0 text-purple-600 dark:text-purple-400" />
            <span>
              <strong>Modo {currentUser?.rol === 'director' ? 'Director' : 'Coordinador'}:</strong> Puede registrar asistencia regular (<strong>Presente, Tarde, Ausente</strong>) o validar estados <strong>Justificado</strong> en cualquier año, sección y materia. Para adjuntar soportes detallados de <em>Reposo Médico</em>, utilice el módulo de <strong>Asistencia General &amp; Auditoría</strong>.
            </span>
          </div>
        )
      )}

      {/* Status Alert Banner */}
      {statusMessage && (
        <div
          className={`p-3.5 rounded-xl text-xs font-semibold flex items-center space-x-2.5 border ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
              : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Main Content Area: Tactile Cards (Mobile-first) vs Table (Desktop) */}
      {loading ? (
        <div className="bg-white dark:bg-[#121212] rounded-2xl p-12 text-center border border-slate-200 dark:border-[#27272A]">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-600 dark:text-indigo-400" />
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
            Consultando asistencia en la base de datos institucional...
          </p>
        </div>
      ) : sortedStudents.length === 0 ? (
        <div className="bg-white dark:bg-[#121212] rounded-2xl p-12 text-center border border-slate-200 dark:border-[#27272A]">
          <AlertCircle className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            No hay estudiantes en esta selección
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Verifique los filtros de año o asigne estudiantes a la sección correspondiente.
          </p>
        </div>
      ) : (
        /* RESPONSIVE ATTENDANCE CONTAINER: CARDS ALWAYS ON MOBILE (< md), CARDS/TABLE ON DESKTOP (>= md) */
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400 px-1">
            <span className="flex items-center gap-1.5">
              <ArrowUpDown className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              Nómina ordenada numéricamente por Cédula (Ascendente)
            </span>
            <span className="bg-slate-100 dark:bg-[#181818] px-2.5 py-0.5 rounded-md border border-slate-200 dark:border-[#27272A]">
              {sortedStudents.length} estudiantes
            </span>
          </div>

          {/* 1. VISTA MÓVIL (block md:hidden): SIEMPRE TARJETAS TÁCTILES VERTICALES ERGONÓMICAS */}
          <div className="block md:hidden space-y-3">
            {sortedStudents.map((student, index) => {
              const state = attendanceMap[student.idEstudiante] || {
                estado: 'Presente' as EstadoAsistencia,
                horaEntrada: '--:--:--',
              };

              return (
                <div
                  key={`mobile-${student.idEstudiante}`}
                  className={`bg-white dark:bg-[#121212] rounded-2xl border p-4 shadow-xs transition-all ${
                    state.isModified
                      ? 'border-indigo-400 dark:border-indigo-600 bg-indigo-50/20 dark:bg-indigo-950/20 ring-2 ring-indigo-200 dark:ring-indigo-900/40'
                      : 'border-slate-200 dark:border-[#27272A]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center space-x-2.5">
                      <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-[#181818] text-indigo-600 dark:text-indigo-400 font-extrabold text-xs flex items-center justify-center border border-indigo-100 dark:border-[#27272A] shrink-0">
                        {student.nombres[0]}
                      </div>
                      <div>
                        <h4 className="font-bold text-sm text-slate-900 dark:text-[#F4F4F5] leading-tight">
                          {student.apellidos}, {student.nombres}
                        </h4>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="font-mono text-xs font-bold text-slate-600 dark:text-slate-400">
                            {formatCedula(student.cedula)}
                          </span>
                          <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-slate-100 dark:bg-[#27272A] text-slate-700 dark:text-slate-300">
                            {student.nombreSeccion ? `Sec. ${student.nombreSeccion}` : 'Sin Sección'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <span className="inline-flex items-center px-2 py-0.5 rounded-md font-mono text-[10px] font-bold bg-slate-100 dark:bg-[#181818] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#27272A] shrink-0">
                      <Clock className="w-3 h-3 mr-1 text-slate-400" />
                      {state.horaEntrada || '--:--:--'}
                    </span>
                  </div>

                  {/* Botones Grandes Táctiles para Pulgar (Ergonomía Móvil) */}
                  {state.lockedByCoordination ? (
                    <div className="pt-2.5 border-t border-slate-100 dark:border-[#27272A]">
                      <div className="p-2.5 rounded-xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 text-sky-800 dark:text-sky-200 text-xs font-bold flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5">
                          <Lock className="w-3.5 h-3.5 shrink-0" />
                          Validado por Coordinación: {state.estado}
                        </span>
                        {state.numeroJustificante && (
                          <span className="font-mono text-[10px]">{state.numeroJustificante}</span>
                        )}
                      </div>
                      {state.motivoJustificacion && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                          {state.motivoJustificacion}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div
                      className={`grid ${isDocente ? 'grid-cols-3' : 'grid-cols-4'} gap-1.5 pt-2.5 border-t border-slate-100 dark:border-[#27272A]`}
                    >
                      <button
                        type="button"
                        onClick={() => handleStatusChange(student.idEstudiante, 'Presente')}
                        className={`min-h-[46px] py-1.5 px-1 rounded-xl text-xs font-bold transition-all text-center flex flex-col items-center justify-center gap-1 cursor-pointer ${
                          state.estado === 'Presente'
                            ? 'bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-300 dark:ring-emerald-800 scale-102'
                            : 'bg-slate-50 dark:bg-[#181818] text-slate-600 dark:text-slate-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 hover:text-emerald-700 dark:hover:text-emerald-300 border border-transparent dark:border-[#27272A]'
                        }`}
                      >
                        <Check className="w-4 h-4" />
                        <span className="text-[10px] font-extrabold">Presente</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleStatusChange(student.idEstudiante, 'Tarde')}
                        className={`min-h-[46px] py-1.5 px-1 rounded-xl text-xs font-bold transition-all text-center flex flex-col items-center justify-center gap-1 cursor-pointer ${
                          state.estado === 'Tarde'
                            ? 'bg-amber-500 text-white shadow-sm ring-2 ring-amber-300 dark:ring-amber-800 scale-102'
                            : 'bg-slate-50 dark:bg-[#181818] text-slate-600 dark:text-slate-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 hover:text-amber-700 dark:hover:text-amber-300 border border-transparent dark:border-[#27272A]'
                        }`}
                      >
                        <Clock className="w-4 h-4" />
                        <span className="text-[10px] font-extrabold">Tarde</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleStatusChange(student.idEstudiante, 'Ausente')}
                        className={`min-h-[46px] py-1.5 px-1 rounded-xl text-xs font-bold transition-all text-center flex flex-col items-center justify-center gap-1 cursor-pointer ${
                          state.estado === 'Ausente'
                            ? 'bg-rose-600 text-white shadow-sm ring-2 ring-rose-300 dark:ring-rose-800 scale-102'
                            : 'bg-slate-50 dark:bg-[#181818] text-slate-600 dark:text-slate-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 hover:text-rose-700 dark:hover:text-rose-300 border border-transparent dark:border-[#27272A]'
                        }`}
                      >
                        <XCircle className="w-4 h-4" />
                        <span className="text-[10px] font-extrabold">Ausente</span>
                      </button>

                      {!isDocente && (
                        <button
                          type="button"
                          onClick={() => handleStatusChange(student.idEstudiante, 'Justificado')}
                          className={`min-h-[46px] py-1.5 px-1 rounded-xl text-xs font-bold transition-all text-center flex flex-col items-center justify-center gap-1 cursor-pointer ${
                            state.estado === 'Justificado' || state.estado === 'Reposo Médico'
                              ? 'bg-sky-600 text-white shadow-sm ring-2 ring-sky-300 dark:ring-sky-800 scale-102'
                              : 'bg-slate-50 dark:bg-[#181818] text-slate-600 dark:text-slate-400 hover:bg-sky-50 dark:hover:bg-sky-950/30 hover:text-sky-700 dark:hover:text-sky-300 border border-transparent dark:border-[#27272A]'
                          }`}
                        >
                          <HelpCircle className="w-4 h-4" />
                          <span className="text-[10px] font-extrabold">
                            {state.estado === 'Reposo Médico' ? 'Reposo' : 'Justif.'}
                          </span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 2. VISTA ESCRITORIO (hidden md:block): SEGÚN VIEWMODE (CARDS O TABLA) */}
          <div className="hidden md:block">
            {viewMode === 'cards' ? (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                {sortedStudents.map((student, index) => {
                  const state = attendanceMap[student.idEstudiante] || {
                    estado: 'Presente' as EstadoAsistencia,
                    horaEntrada: '--:--:--',
                  };

                  return (
                    <div
                      key={`desktop-card-${student.idEstudiante}`}
                      className={`bg-white dark:bg-[#121212] rounded-2xl border p-4 shadow-xs transition-all ${
                        state.isModified
                          ? 'border-indigo-400 dark:border-indigo-600 bg-indigo-50/20 dark:bg-indigo-950/20 ring-2 ring-indigo-200 dark:ring-indigo-900/40'
                          : 'border-slate-200 dark:border-[#27272A]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="flex items-center space-x-2.5">
                          <span className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-[#181818] font-mono font-black text-xs text-slate-600 dark:text-slate-300 flex items-center justify-center border border-slate-200 dark:border-[#27272A]">
                            {index + 1}
                          </span>
                          <div>
                            <h4 className="font-bold text-sm text-slate-900 dark:text-[#F4F4F5] leading-tight">
                              {student.apellidos}, {student.nombres}
                            </h4>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="font-mono text-xs font-bold text-slate-600 dark:text-slate-400">
                                {formatCedula(student.cedula)}
                              </span>
                              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                                {student.nombreSeccion ? `Sec. ${student.nombreSeccion}` : 'Sin Sección'}
                              </span>
                            </div>
                          </div>
                        </div>

                        <span className="inline-flex items-center px-2 py-0.5 rounded-md font-mono text-[11px] font-bold bg-slate-100 dark:bg-[#181818] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#27272A]">
                          <Clock className="w-3 h-3 mr-1 text-slate-400" />
                          {state.horaEntrada || '--:--:--'}
                        </span>
                      </div>

                      {/* Botones de acción táctiles para escritorio */}
                      {state.lockedByCoordination ? (
                        <div className="pt-2 border-t border-slate-100 dark:border-[#27272A]">
                          <div className="p-2.5 rounded-xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 text-sky-800 dark:text-sky-200 text-xs font-bold flex items-center justify-between gap-2">
                            <span className="flex items-center gap-1.5">
                              <Lock className="w-3.5 h-3.5 shrink-0" />
                              Validado por Coordinación: {state.estado}
                            </span>
                            {state.numeroJustificante && (
                              <span className="font-mono text-[10px]">{state.numeroJustificante}</span>
                            )}
                          </div>
                          {state.motivoJustificacion && (
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                              {state.motivoJustificacion}
                            </p>
                          )}
                        </div>
                      ) : (
                        <div
                          className={`grid ${isDocente ? 'grid-cols-3' : 'grid-cols-4'} gap-1.5 pt-2 border-t border-slate-100 dark:border-[#27272A]`}
                        >
                          <button
                            type="button"
                            onClick={() => handleStatusChange(student.idEstudiante, 'Presente')}
                            className={`py-2 px-1 rounded-xl text-xs font-bold transition-all text-center flex flex-col items-center justify-center gap-1 cursor-pointer ${
                              state.estado === 'Presente'
                                ? 'bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-300 dark:ring-emerald-800 scale-102'
                                : 'bg-slate-50 dark:bg-[#181818] text-slate-600 dark:text-slate-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 hover:text-emerald-700 dark:hover:text-emerald-300'
                            }`}
                          >
                            <Check className="w-4 h-4" />
                            <span className="text-[11px]">Presente</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleStatusChange(student.idEstudiante, 'Tarde')}
                            className={`py-2 px-1 rounded-xl text-xs font-bold transition-all text-center flex flex-col items-center justify-center gap-1 cursor-pointer ${
                              state.estado === 'Tarde'
                                ? 'bg-amber-500 text-white shadow-sm ring-2 ring-amber-300 dark:ring-amber-800 scale-102'
                                : 'bg-slate-50 dark:bg-[#181818] text-slate-600 dark:text-slate-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 hover:text-amber-700 dark:hover:text-amber-300'
                            }`}
                          >
                            <Clock className="w-4 h-4" />
                            <span className="text-[11px]">Tarde</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleStatusChange(student.idEstudiante, 'Ausente')}
                            className={`py-2 px-1 rounded-xl text-xs font-bold transition-all text-center flex flex-col items-center justify-center gap-1 cursor-pointer ${
                              state.estado === 'Ausente'
                                ? 'bg-rose-600 text-white shadow-sm ring-2 ring-rose-300 dark:ring-rose-800 scale-102'
                                : 'bg-slate-50 dark:bg-[#181818] text-slate-600 dark:text-slate-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 hover:text-rose-700 dark:hover:text-rose-300'
                            }`}
                          >
                            <XCircle className="w-4 h-4" />
                            <span className="text-[11px]">Ausente</span>
                          </button>

                          {!isDocente && (
                            <button
                              type="button"
                              onClick={() => handleStatusChange(student.idEstudiante, 'Justificado')}
                              className={`py-2 px-1 rounded-xl text-xs font-bold transition-all text-center flex flex-col items-center justify-center gap-1 cursor-pointer ${
                                state.estado === 'Justificado' || state.estado === 'Reposo Médico'
                                  ? 'bg-sky-600 text-white shadow-sm ring-2 ring-sky-300 dark:ring-sky-800 scale-102'
                                  : 'bg-slate-50 dark:bg-[#181818] text-slate-600 dark:text-slate-400 hover:bg-sky-50 dark:hover:bg-sky-950/30 hover:text-sky-700 dark:hover:text-sky-300'
                              }`}
                            >
                              <HelpCircle className="w-4 h-4" />
                              <span className="text-[11px]">
                                {state.estado === 'Reposo Médico' ? 'Reposo' : 'Justif.'}
                              </span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-white dark:bg-[#121212] rounded-2xl border border-slate-200 dark:border-[#27272A] overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-[#27272A] text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider bg-slate-50/50 dark:bg-[#181818]">
                        <th className="py-3 px-4 w-12 text-center">#</th>
                        <th className="sticky left-0 z-20 bg-slate-50 dark:bg-[#181818] py-3 px-4 min-w-[200px] border-r border-slate-200 dark:border-[#27272A] shadow-[4px_0_6px_-2px_rgba(0,0,0,0.06)] dark:shadow-[4px_0_6px_-2px_rgba(0,0,0,0.5)]">
                          Estudiante / Cédula
                        </th>
                        <th className="py-3 px-4 w-28 text-center">Sección</th>
                        <th className="py-3 px-4 w-32 text-center">Hora Entrada</th>
                        <th className="py-3 px-4 text-center w-72">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-[#27272A]">
                      {sortedStudents.map((student, index) => {
                        const state = attendanceMap[student.idEstudiante] || {
                          estado: 'Presente' as EstadoAsistencia,
                          horaEntrada: '--:--:--',
                        };

                        return (
                          <tr key={`desktop-row-${student.idEstudiante}`} className="hover:bg-slate-50/70 dark:hover:bg-[#181818]/70 transition-colors">
                            <td className="py-3 px-4 text-center font-mono text-xs text-slate-400 font-bold">
                              {index + 1}
                            </td>
                            <td className="sticky left-0 z-10 bg-white dark:bg-[#121212] py-3 px-4 min-w-[200px] border-r border-slate-100 dark:border-[#27272A] shadow-[4px_0_6px_-2px_rgba(0,0,0,0.06)] dark:shadow-[4px_0_6px_-2px_rgba(0,0,0,0.5)]">
                              <div className="font-bold text-slate-900 dark:text-[#F4F4F5]">
                                {student.apellidos}, {student.nombres}
                              </div>
                              <div className="font-mono text-xs font-bold text-slate-500 dark:text-slate-400 mt-0.5">
                                {formatCedula(student.cedula)}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-center">
                              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-[#27272A] text-slate-700 dark:text-slate-300">
                                {student.nombreSeccion ? `Sec. ${student.nombreSeccion}` : '--'}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">
                              {state.horaEntrada || '--:--:--'}
                            </td>
                            <td className="py-3 px-4">
                              {state.lockedByCoordination ? (
                                <div className="flex flex-col items-center text-center">
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-50 dark:bg-sky-950/50 text-sky-800 dark:text-sky-200 border border-sky-200 dark:border-sky-800 text-xs font-bold">
                                    <Lock className="w-3 h-3" />
                                    {state.estado} (Coordinación)
                                  </span>
                                  {state.motivoJustificacion && (
                                    <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 max-w-[240px] truncate">
                                      {state.motivoJustificacion}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <div className="flex items-center justify-center space-x-1">
                                  <button
                                    type="button"
                                    onClick={() => handleStatusChange(student.idEstudiante, 'Presente')}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                      state.estado === 'Presente'
                                        ? 'bg-emerald-600 text-white shadow-xs'
                                        : 'bg-slate-100 dark:bg-[#27272A] text-slate-600 dark:text-slate-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-700 dark:hover:text-emerald-300'
                                    }`}
                                  >
                                    Presente
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleStatusChange(student.idEstudiante, 'Tarde')}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                      state.estado === 'Tarde'
                                        ? 'bg-amber-500 text-white shadow-xs'
                                        : 'bg-slate-100 dark:bg-[#27272A] text-slate-600 dark:text-slate-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 hover:text-amber-700 dark:hover:text-amber-300'
                                    }`}
                                  >
                                    Tarde
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleStatusChange(student.idEstudiante, 'Ausente')}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                      state.estado === 'Ausente'
                                        ? 'bg-rose-600 text-white shadow-xs'
                                        : 'bg-slate-100 dark:bg-[#27272A] text-slate-600 dark:text-slate-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-700 dark:hover:text-rose-300'
                                    }`}
                                  >
                                    Ausente
                                  </button>
                                  {!isDocente && (
                                    <button
                                      type="button"
                                      onClick={() => handleStatusChange(student.idEstudiante, 'Justificado')}
                                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                        state.estado === 'Justificado' || state.estado === 'Reposo Médico'
                                          ? 'bg-sky-600 text-white shadow-xs'
                                          : 'bg-slate-100 dark:bg-[#27272A] text-slate-600 dark:text-slate-400 hover:bg-sky-50 dark:hover:bg-sky-950/40 hover:text-sky-700 dark:hover:text-sky-300'
                                      }`}
                                    >
                                      {state.estado === 'Reposo Médico' ? 'Reposo' : 'Justif.'}
                                    </button>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floating / Sticky Save Bar */}
      <div className="sticky bottom-4 z-30 bg-slate-900/90 backdrop-blur-md text-white p-4 rounded-2xl shadow-xl flex flex-col sm:flex-row items-center justify-between gap-3 border border-slate-800">
        <div className="text-xs text-slate-300 flex items-center space-x-2 text-center sm:text-left">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>
            Los cambios se guardan de forma atómica en la base de datos institucional. La hora actual será sellada en el registro.
          </span>
        </div>

        <button
          type="button"
          onClick={handleSaveAttendance}
          disabled={saving || sortedStudents.length === 0}
          className="w-full sm:w-auto px-6 py-2.5 rounded-xl font-bold text-xs sm:text-sm bg-indigo-600 hover:bg-indigo-500 transition-all shadow-md shadow-indigo-900/50 flex items-center justify-center space-x-2 disabled:opacity-50 cursor-pointer"
        >
          {saving ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Guardando registro...</span>
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              <span>Guardar Asistencia de la Clase</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
