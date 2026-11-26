import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  BookOpen,
  CalendarCheck,
  CalendarOff,
  CheckCircle2,
  ChevronRight,
  Clock,
  MapPin,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import type {
  AnoEscolar,
  DocenteMateria,
  Estudiante,
  Horario,
  Materia,
  RegistroAsistencia,
  Seccion,
  Usuario,
  VerificarDiaNoLaborableResult,
} from '../types.ts';
import {
  fetchAsistencia,
  fetchHorarios,
  verificarDiaNoLaborable,
} from '../lib/api.ts';
import {
  formatDateEs,
  getLocalNowTimeHHMM,
  getLocalTodayDateString,
  getLocalTodayDayName,
} from '../lib/utils.ts';

interface TeacherTodaySubjectsProps {
  currentUser: Usuario;
  anos: AnoEscolar[];
  secciones: Seccion[];
  materias: Materia[];
  docenteMaterias: DocenteMateria[];
  estudiantes: Estudiante[];
  onSelectClassForAttendance: (params: {
    materiaId?: number;
    seccionId?: number;
    anoId?: number;
    fecha: string;
  }) => void;
  onViewFullSchedule?: () => void;
}

export const TeacherTodaySubjects: React.FC<TeacherTodaySubjectsProps> = ({
  currentUser,
  anos,
  secciones,
  materias,
  docenteMaterias,
  estudiantes,
  onSelectClassForAttendance,
  onViewFullSchedule,
}) => {
  const [todayDate, setTodayDate] = useState<string>(() => getLocalTodayDateString());
  const [nowHHMM, setNowHHMM] = useState<string>(() => getLocalNowTimeHHMM());

  const [todayBlocks, setTodayBlocks] = useState<Horario[]>([]);
  const [todayAttendance, setTodayAttendance] = useState<RegistroAsistencia[]>([]);
  const [nonWorkingInfo, setNonWorkingInfo] = useState<VerificarDiaNoLaborableResult | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const todayDayName = useMemo(() => getLocalTodayDayName(todayDate), [todayDate]);

  // Actualizar reloj local cada 30 segundos para reflejar bloque en curso y cambio de día
  useEffect(() => {
    const interval = setInterval(() => {
      const nextDate = getLocalTodayDateString();
      if (nextDate !== todayDate) setTodayDate(nextDate);
      setNowHHMM(getLocalNowTimeHHMM());
    }, 30000);
    return () => clearInterval(interval);
  }, [todayDate]);

  const loadTodayDashboard = useCallback(async () => {
    if (!currentUser?.id) return;
    setLoading(true);
    setError(null);
    try {
      const [horariosData, dayCheck] = await Promise.all([
        fetchHorarios({ idDocente: currentUser.id, diaSemana: todayDayName }),
        verificarDiaNoLaborable(todayDate).catch(() => null),
      ]);

      const sorted = [...horariosData].sort((a, b) =>
        a.horaInicio.localeCompare(b.horaInicio)
      );
      setTodayBlocks(sorted);
      setNonWorkingInfo(dayCheck);

      const idMateriasHoy = Array.from(new Set(sorted.map((h) => h.idMateria)));
      if (idMateriasHoy.length > 0) {
        const asistenciaData = await fetchAsistencia({
          fecha: todayDate,
          idMaterias: idMateriasHoy,
        });
        setTodayAttendance(asistenciaData);
      } else {
        setTodayAttendance([]);
      }
    } catch (err: any) {
      setError(err?.message || 'No se pudieron cargar tus materias del día.');
    } finally {
      setLoading(false);
    }
  }, [currentUser?.id, todayDayName, todayDate]);

  useEffect(() => {
    loadTodayDashboard();
  }, [loadTodayDashboard]);

  // Total de materias asignadas al docente (por si no tiene bloques hoy)
  const totalAssignedSubjects = useMemo(
    () => docenteMaterias.filter((dm) => dm.idUsuario === currentUser.id).length,
    [docenteMaterias, currentUser.id]
  );

  // Construir tarjetas enriquecidas con estado de asistencia real por materia + sección + fecha
  const enrichedBlocks = useMemo(() => {
    return todayBlocks.map((block) => {
      const materiaObj = materias.find((m) => m.idMateria === block.idMateria);
      const anoObj = anos.find((a) => a.idAno === block.idAno);
      const secObj = secciones.find((s) => s.idSeccion === block.idSeccion);

      const sectionStudents = estudiantes.filter(
        (e) =>
          e.estadoAcademico !== 'EGRESADO' &&
          e.estadoAcademico !== 'RETIRADO' &&
          e.idAnoActual === block.idAno &&
          e.idSeccion === block.idSeccion
      );
      const sectionStudentIds = new Set(sectionStudents.map((e) => e.idEstudiante));

      const recordedStudents = new Set<number>();
      for (const rec of todayAttendance) {
        if (rec.idMateria === block.idMateria && sectionStudentIds.has(rec.idEstudiante)) {
          recordedStudents.add(rec.idEstudiante);
        }
      }

      const totalStudents = sectionStudents.length;
      const recordedCount = recordedStudents.size;
      const status: 'registrada' | 'parcial' | 'pendiente' =
        totalStudents > 0 && recordedCount >= totalStudents
          ? 'registrada'
          : recordedCount > 0
          ? 'parcial'
          : 'pendiente';

      const isNow = nowHHMM >= block.horaInicio && nowHHMM < block.horaFin;

      return {
        block,
        materiaNombre: block.nombreMateria || materiaObj?.nombreMateria || 'Materia asignada',
        nivelNombre: block.nombreNivel || anoObj?.nombreNivel || 'Año Escolar',
        seccionNombre: block.nombreSeccion || secObj?.nombreSeccion || '--',
        totalStudents,
        recordedCount,
        status,
        isNow,
      };
    });
  }, [todayBlocks, materias, anos, secciones, estudiantes, todayAttendance, nowHHMM]);

  const counts = useMemo(() => {
    const total = enrichedBlocks.length;
    const registradas = enrichedBlocks.filter((b) => b.status === 'registrada').length;
    const pendientes = total - registradas;
    return { total, registradas, pendientes };
  }, [enrichedBlocks]);

  const isWeekend = todayDayName === 'Sábado' || todayDayName === 'Domingo';
  const isNonWorking = Boolean(nonWorkingInfo?.esNoLaborable) || isWeekend;
  const nonWorkingReason =
    nonWorkingInfo?.motivo ||
    (isWeekend ? `Fin de semana (${todayDayName})` : 'Día no laborable en el calendario escolar');

  return (
    <section
      aria-label="Mis materias asignadas de hoy"
      className="bg-white dark:bg-[#121212] p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-[#27272A] shadow-xs space-y-4"
    >
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start space-x-3">
          <div className="w-11 h-11 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200/80 dark:border-indigo-900 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900 dark:text-[#F4F4F5] tracking-tight">
                Mis Materias de Hoy
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-900">
                {todayDayName} • {formatDateEs(todayDate)}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Toca cualquier clase programada para abrir directamente su pase de asistencia con el grupo seleccionado.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!isNonWorking && counts.total > 0 && (
            <div className="flex items-center gap-1.5 text-[11px] font-bold">
              <span className="px-2.5 py-1 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-mono tabular-nums">
                {counts.registradas} listas
              </span>
              <span className="px-2.5 py-1 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 font-mono tabular-nums">
                {counts.pendientes} pendientes
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={loadTodayDashboard}
            disabled={loading}
            className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-[#181818] hover:bg-slate-200 dark:hover:bg-[#202024] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#27272A] flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Actualizar</span>
          </button>
        </div>
      </div>

      {/* Aviso de Fin de Semana / Día No Laborable */}
      {!loading && isNonWorking && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start space-x-3">
            <CalendarOff className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-amber-900 dark:text-amber-200">
                No hay actividades escolares programadas hoy ({todayDayName})
              </p>
              <p className="text-[11px] text-amber-800/90 dark:text-amber-300/90 mt-0.5">
                Motivo: <strong>{nonWorkingReason}</strong>. Puedes consultar manualmente otras fechas o revisar tu horario semanal completo.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onSelectClassForAttendance({ fecha: todayDate })}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <CalendarCheck className="w-3.5 h-3.5" />
              <span>Consultar Asistencia</span>
            </button>
            {onViewFullSchedule && (
              <button
                type="button"
                onClick={onViewFullSchedule}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-[#181818] text-slate-700 dark:text-slate-200 border border-amber-200 dark:border-[#27272A] hover:bg-slate-50 dark:hover:bg-[#202024] cursor-pointer"
              >
                Ver Horario Completo
              </button>
            )}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs font-semibold text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}

      {/* Contenido principal: Loading / Lista de Tarjetas / Estado Vacío */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-28 rounded-2xl bg-slate-100 dark:bg-[#181818] animate-pulse border border-slate-200/70 dark:border-[#27272A]"
            />
          ))}
        </div>
      ) : enrichedBlocks.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {enrichedBlocks.map(
            ({
              block,
              materiaNombre,
              nivelNombre,
              seccionNombre,
              totalStudents,
              recordedCount,
              status,
              isNow,
            }) => {
              const statusBadge = isNonWorking
                ? {
                    label: 'No laborable',
                    cls: 'bg-slate-100 dark:bg-[#27272A] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-[#3F3F46]',
                    icon: <CalendarOff className="w-3 h-3" />,
                  }
                : status === 'registrada'
                ? {
                    label: `Registrada (${recordedCount}/${totalStudents})`,
                    cls: 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
                    icon: <CheckCircle2 className="w-3 h-3" />,
                  }
                : status === 'parcial'
                ? {
                    label: `Parcial (${recordedCount}/${totalStudents})`,
                    cls: 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
                    icon: <Clock className="w-3 h-3" />,
                  }
                : {
                    label: totalStudents > 0 ? `Pendiente (${totalStudents} alum.)` : 'Pendiente',
                    cls: 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
                    icon: <Clock className="w-3 h-3" />,
                  };

              return (
                <button
                  key={block.idHorario}
                  type="button"
                  onClick={() =>
                    onSelectClassForAttendance({
                      materiaId: block.idMateria,
                      seccionId: block.idSeccion,
                      anoId: block.idAno,
                      fecha: todayDate,
                    })
                  }
                  className={`group text-left w-full p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between gap-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                    isNow && !isNonWorking
                      ? 'bg-indigo-50/60 dark:bg-indigo-950/25 border-indigo-400 dark:border-indigo-600 shadow-sm'
                      : 'bg-slate-50/80 dark:bg-[#181818] hover:bg-white dark:hover:bg-[#1E1E22] border-slate-200/90 dark:border-[#27272A] hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-sm'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-mono font-bold bg-white dark:bg-[#121212] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-[#27272A]">
                        <Clock className="w-3 h-3 text-indigo-500" />
                        {block.horaInicio} – {block.horaFin}
                      </span>

                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold border ${statusBadge.cls}`}
                      >
                        {statusBadge.icon}
                        <span>{statusBadge.label}</span>
                      </span>
                    </div>

                    <div>
                      <div className="flex items-center gap-1.5">
                        <h3 className="font-bold text-sm text-slate-900 dark:text-[#F4F4F5] group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors leading-snug">
                          {materiaNombre}
                        </h3>
                        {isNow && !isNonWorking && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-indigo-600 text-white shrink-0">
                            <Sparkles className="w-2.5 h-2.5" />
                            Ahora
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mt-0.5">
                        {nivelNombre} • Sección{' '}
                        <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                          {seccionNombre}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-200/70 dark:border-[#27272A] text-[11px]">
                    <span className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400 font-medium">
                      <MapPin className="w-3 h-3 shrink-0" />
                      <span>{block.aula || 'Aula asignada'}</span>
                    </span>

                    <span className="inline-flex items-center gap-1 font-bold text-indigo-600 dark:text-indigo-400 group-hover:translate-x-0.5 transition-transform">
                      <span>Pasar asistencia</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </button>
              );
            }
          )}
        </div>
      ) : !isNonWorking ? (
        <div className="p-6 rounded-2xl bg-slate-50 dark:bg-[#181818] border border-dashed border-slate-200 dark:border-[#27272A] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-sm font-bold text-slate-800 dark:text-[#F4F4F5]">
              No tienes clases programadas para hoy ({todayDayName})
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {totalAssignedSubjects > 0
                ? `Tienes ${totalAssignedSubjects} materia(s) asignada(s) en tu carga académica, pero sin bloques agendados para los días ${todayDayName}.`
                : 'Aún no tienes materias asignadas en el horario escolar.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onSelectClassForAttendance({ fecha: todayDate })}
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <CalendarCheck className="w-4 h-4" />
              <span>Ir al Pase de Asistencia</span>
            </button>
            {onViewFullSchedule && (
              <button
                type="button"
                onClick={onViewFullSchedule}
                className="px-4 py-2.5 rounded-xl text-xs font-bold bg-white dark:bg-[#121212] hover:bg-slate-100 dark:hover:bg-[#202024] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-[#27272A] cursor-pointer"
              >
                Ver Horario Completo
              </button>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
};
