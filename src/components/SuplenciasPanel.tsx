import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  Calendar,
  CheckCircle2,
  Edit2,
  Info,
  Layers,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import type {
  AnoEscolar,
  DocenteMateria,
  Horario,
  Materia,
  Seccion,
  SuplenciaDocente,
  Usuario,
} from '../types.ts';
import {
  createSuplencia,
  deleteSuplencia,
  fetchHorarios,
  toggleSuplencia,
  updateSuplencia,
} from '../lib/api.ts';

interface SuplenciasPanelProps {
  anos: AnoEscolar[];
  secciones: Seccion[];
  materias: Materia[];
  docenteMaterias: DocenteMateria[];
  suplencias: SuplenciaDocente[];
  staffUsers: Usuario[];
  currentUser: Usuario | null;
  onRefreshData: () => Promise<void> | void;
  embedded?: boolean;
}

const formatNivelCorto = (nivel?: string) => {
  if (!nivel) return 'Sin nivel';
  return nivel.split(' - ')[0].trim();
};

export const SuplenciasPanel: React.FC<SuplenciasPanelProps> = ({
  anos,
  secciones,
  materias,
  docenteMaterias,
  suplencias,
  staffUsers,
  currentUser,
  onRefreshData,
  embedded = false,
}) => {
  const canManage =
    currentUser?.rol === 'director' ||
    currentUser?.rol === 'coordinador' ||
    currentUser?.rol === 'coordinador_seccional';

  const isCoordinadorSeccional = currentUser?.rol === 'coordinador_seccional';

  const eligibleSuplentes = useMemo(
    () =>
      staffUsers
        .filter((u) => u.rol === 'docente_suplente')
        .sort((a, b) => `${a.nombre} ${a.apellidos}`.localeCompare(`${b.nombre} ${b.apellidos}`)),
    [staffUsers]
  );

  const eligibleTitulares = useMemo(
    () =>
      staffUsers
        .filter((u) => u.rol === 'docente' && u.activo !== false)
        .sort((a, b) => `${a.nombre} ${a.apellidos}`.localeCompare(`${b.nombre} ${b.apellidos}`)),
    [staffUsers]
  );

  const [horarios, setHorarios] = useState<Horario[]>([]);
  useEffect(() => {
    fetchHorarios()
      .then((data) => setHorarios(data))
      .catch(() => {});
  }, [docenteMaterias]);

  const [searchTerm, setSearchTerm] = useState<string>('');
  const [estadoFiltro, setEstadoFiltro] = useState<'todas' | 'activas' | 'inactivas'>('todas');
  const [filterSuplenteId, setFilterSuplenteId] = useState<number>(0);

  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [editingSuplencia, setEditingSuplencia] = useState<SuplenciaDocente | null>(null);
  const [form, setForm] = useState({
    idSuplente: 0,
    idDocenteTitular: 0,
    alcanceCompleto: true,
    idMateria: 0,
    idSeccion: 0,
    fechaInicio: '',
    fechaFin: '',
    motivo: '',
    activo: true,
  });

  const [saving, setSaving] = useState<boolean>(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const allowedAnoIdSet = useMemo(() => new Set(anos.map((a) => a.idAno)), [anos]);

  const getTitularSubjects = (idTitular: number): Materia[] => {
    const matIds = new Set(
      docenteMaterias.filter((dm) => dm.idUsuario === idTitular).map((dm) => dm.idMateria)
    );
    return materias.filter((m) => matIds.has(m.idMateria));
  };

  const getTitularScheduledSections = (idTitular: number): Seccion[] => {
    const titMatIds = new Set(
      docenteMaterias.filter((dm) => dm.idUsuario === idTitular).map((dm) => dm.idMateria)
    );
    const secIds = new Set(
      horarios.filter((h) => titMatIds.has(h.idMateria)).map((h) => h.idSeccion)
    );
    return secciones.filter((s) => secIds.has(s.idSeccion));
  };

  const openCreateModal = (preselectedSuplenteId?: number) => {
    setFeedback(null);
    setEditingSuplencia(null);
    const activeSuplentes = eligibleSuplentes.filter((s) => s.activo !== false);
    const defaultSupId =
      preselectedSuplenteId || activeSuplentes[0]?.id || eligibleSuplentes[0]?.id || 0;
    const titularWithSubjects =
      eligibleTitulares.find((t) => getTitularSubjects(t.id).length > 0) || eligibleTitulares[0];
    const defaultTitId = titularWithSubjects?.id || 0;
    const titSubjects = defaultTitId ? getTitularSubjects(defaultTitId) : [];

    setForm({
      idSuplente: defaultSupId,
      idDocenteTitular: defaultTitId,
      alcanceCompleto: titSubjects.length > 0,
      idMateria: titSubjects[0]?.idMateria || materias[0]?.idMateria || 0,
      idSeccion: 0,
      fechaInicio: '',
      fechaFin: '',
      motivo: '',
      activo: true,
    });
    setModalOpen(true);
  };

  const openEditModal = (sup: SuplenciaDocente) => {
    setFeedback(null);
    setEditingSuplencia(sup);
    const isFull = Boolean(sup.alcanceCompleto || sup.idMateria == null);
    const titSubjects = getTitularSubjects(sup.idDocenteTitular);
    setForm({
      idSuplente: sup.idSuplente,
      idDocenteTitular: sup.idDocenteTitular,
      alcanceCompleto: isFull,
      idMateria: sup.idMateria || titSubjects[0]?.idMateria || materias[0]?.idMateria || 0,
      idSeccion: sup.idSeccion ?? 0,
      fechaInicio: sup.fechaInicio || '',
      fechaFin: sup.fechaFin || '',
      motivo: sup.motivo || '',
      activo: sup.activo,
    });
    setModalOpen(true);
  };

  const selectedTitularSubjects = useMemo(
    () => (form.idDocenteTitular ? getTitularSubjects(form.idDocenteTitular) : []),
    [form.idDocenteTitular, docenteMaterias, materias]
  );

  const selectedTitularSections = useMemo(
    () => (form.idDocenteTitular ? getTitularScheduledSections(form.idDocenteTitular) : []),
    [form.idDocenteTitular, docenteMaterias, horarios, secciones]
  );

  const availableModalSections = useMemo(() => {
    if (form.alcanceCompleto) {
      const titAnoIds = new Set(selectedTitularSubjects.map((m) => m.idAno));
      if (titAnoIds.size === 0) return secciones;
      return secciones.filter((s) => titAnoIds.has(s.idAno));
    }
    const selectedMat = materias.find((m) => m.idMateria === form.idMateria);
    if (!selectedMat) return secciones;
    return secciones.filter((s) => s.idAno === selectedMat.idAno);
  }, [form.alcanceCompleto, form.idMateria, selectedTitularSubjects, materias, secciones]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.idSuplente || !form.idDocenteTitular) {
      setFeedback({
        type: 'error',
        text: 'Debe seleccionar el Docente Suplente y el Docente Titular al cual va a sustituir.',
      });
      return;
    }
    if (!form.alcanceCompleto && !form.idMateria) {
      setFeedback({
        type: 'error',
        text: 'Seleccione una materia específica o active "Todas las materias del titular".',
      });
      return;
    }
    if (form.fechaInicio && form.fechaFin && form.fechaInicio > form.fechaFin) {
      setFeedback({
        type: 'error',
        text: 'La fecha de inicio no puede ser posterior a la fecha de fin.',
      });
      return;
    }

    setSaving(true);
    setFeedback(null);
    try {
      const matchedDm =
        !form.alcanceCompleto && form.idMateria
          ? docenteMaterias.find(
              (dm) => dm.idUsuario === form.idDocenteTitular && dm.idMateria === form.idMateria
            )
          : undefined;

      if (editingSuplencia) {
        await updateSuplencia(editingSuplencia.idSuplencia, {
          idDocenteTitular: form.idDocenteTitular,
          alcanceCompleto: form.alcanceCompleto,
          idDocenteMateria: form.alcanceCompleto ? null : matchedDm?.idAsignacion || null,
          idMateria: form.alcanceCompleto ? null : form.idMateria,
          idSeccion: form.idSeccion > 0 ? form.idSeccion : null,
          activo: form.activo,
          fechaInicio: form.fechaInicio.trim() || null,
          fechaFin: form.fechaFin.trim() || null,
          motivo: form.motivo.trim() || null,
        });
        setFeedback({ type: 'success', text: 'Suplencia actualizada correctamente.' });
      } else {
        await createSuplencia({
          idSuplente: form.idSuplente,
          idDocenteTitular: form.idDocenteTitular,
          alcanceCompleto: form.alcanceCompleto,
          idDocenteMateria: form.alcanceCompleto ? null : matchedDm?.idAsignacion || null,
          idMateria: form.alcanceCompleto ? null : form.idMateria,
          idSeccion: form.idSeccion > 0 ? form.idSeccion : null,
          activo: form.activo,
          fechaInicio: form.fechaInicio.trim() || null,
          fechaFin: form.fechaFin.trim() || null,
          motivo: form.motivo.trim() || null,
        });
        setFeedback({ type: 'success', text: 'Suplencia registrada exitosamente.' });
      }
      setModalOpen(false);
      setEditingSuplencia(null);
      await onRefreshData();
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'No se pudo guardar la suplencia.' });
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (idSuplencia: number) => {
    setFeedback(null);
    try {
      const updated = await toggleSuplencia(idSuplencia);
      setFeedback({
        type: 'success',
        text: `Suplencia marcada como ${updated.activo ? 'Activa' : 'Inactiva'}.`,
      });
      await onRefreshData();
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Error al cambiar estado.' });
    }
  };

  const handleDelete = async (idSuplencia: number) => {
    setFeedback(null);
    try {
      await deleteSuplencia(idSuplencia);
      setConfirmDeleteId(null);
      setFeedback({ type: 'success', text: 'Suplencia eliminada correctamente.' });
      await onRefreshData();
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Error al eliminar suplencia.' });
    }
  };

  const suplenciasFiltradas = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return suplencias.filter((sup) => {
      if (filterSuplenteId && sup.idSuplente !== filterSuplenteId) return false;
      if (estadoFiltro === 'activas' && !sup.activo) return false;
      if (estadoFiltro === 'inactivas' && sup.activo) return false;
      if (!q) return true;
      const supName = `${sup.suplenteNombre || ''} ${sup.suplenteApellidos || ''}`.toLowerCase();
      const titName = `${sup.titularNombre || ''} ${sup.titularApellidos || ''}`.toLowerCase();
      const matName = (sup.nombreMateria || '').toLowerCase();
      const resumenMats = (sup.materiasTitularResumen || [])
        .map((m) => `${m.nombreMateria} ${m.nombreNivel || ''}`.toLowerCase())
        .join(' ');
      const anoName = (sup.nombreNivel || '').toLowerCase();
      const secName = (sup.nombreSeccion || '').toLowerCase();
      return (
        supName.includes(q) ||
        titName.includes(q) ||
        matName.includes(q) ||
        resumenMats.includes(q) ||
        anoName.includes(q) ||
        secName.includes(q)
      );
    });
  }, [suplencias, filterSuplenteId, estadoFiltro, searchTerm]);

  const activeCount = suplencias.filter((s) => s.activo).length;
  const distinctTitularesCovered = useMemo(
    () => new Set(suplencias.filter((s) => s.activo).map((s) => s.idDocenteTitular)).size,
    [suplencias]
  );

  const hasTitularSubjectsOutsideScope =
    isCoordinadorSeccional &&
    selectedTitularSubjects.some((m) => !allowedAnoIdSet.has(m.idAno)) &&
    form.idSeccion === 0;

  return (
    <div className="space-y-5">
      {/* Cabecera principal cuando se abre como módulo dedicado */}
      {!embedded && (
        <div className="bg-white dark:bg-[#121212] p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-[#27272A] shadow-xs">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/70 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
                <RefreshCw className="w-5 h-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-bold text-slate-900 dark:text-[#F4F4F5] tracking-tight">
                    Panel de Suplencias
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                    Docente Suplente
                  </span>
                  {isCoordinadorSeccional && (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-cyan-50 dark:bg-cyan-950/40 text-cyan-800 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800">
                      Coordinación Seccional ({anos.map((a) => formatNivelCorto(a.nombreNivel)).join(', ')})
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
                  Asigne qué Docente Titular sustituirá cada Docente Suplente y controle su vigencia para el pase de asistencia.
                </p>
              </div>
            </div>

            {canManage && (
              <button
                type="button"
                onClick={() => openCreateModal()}
                className="px-4 py-2.5 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white flex items-center justify-center gap-1.5 shadow-sm transition-colors cursor-pointer shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>Nueva Suplencia</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Aviso de regla de negocio */}
      <div className="p-3.5 rounded-2xl bg-amber-50/80 dark:bg-amber-950/25 border border-amber-200/90 dark:border-amber-800/60 flex items-start gap-2.5 text-xs text-amber-950 dark:text-amber-200">
        <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <strong>Regla de negocio Docente Suplente:</strong> Los usuarios con rol{' '}
          <strong>Docente Suplente</strong> no requieren ni utilizan asignaciones en{' '}
          <em>Docente-Materia</em>. Su acceso a horarios, estudiantes y pase de lista se gestiona{' '}
          <strong>exclusivamente desde este Panel de Suplencias</strong> vinculándolos al{' '}
          <strong>docente titular</strong> al cual sustituyen.
        </p>
      </div>

      {/* KPIs compactos */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white dark:bg-[#121212] p-4 rounded-2xl border border-slate-200 dark:border-[#27272A] flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
              Docentes Suplentes
            </p>
            <p className="text-2xl font-extrabold text-slate-900 dark:text-[#F4F4F5] mt-0.5">
              {eligibleSuplentes.length}
            </p>
          </div>
          <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400">
            <Users className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-[#121212] p-4 rounded-2xl border border-slate-200 dark:border-[#27272A] flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
              Suplencias Activas
            </p>
            <p className="text-2xl font-extrabold text-emerald-700 dark:text-emerald-400 mt-0.5">
              {activeCount}
              <span className="text-xs font-semibold text-slate-400 dark:text-zinc-500 ml-1">
                / {suplencias.length} total
              </span>
            </p>
          </div>
          <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-[#121212] p-4 rounded-2xl border border-slate-200 dark:border-[#27272A] flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
              Titulares Sustituidos
            </p>
            <p className="text-2xl font-extrabold text-indigo-700 dark:text-indigo-400 mt-0.5">
              {distinctTitularesCovered}
            </p>
          </div>
          <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400">
            <UserCheck className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Feedback */}
      {feedback && (
        <div
          className={`p-3.5 rounded-xl text-xs font-semibold flex items-center justify-between border ${
            feedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
              : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button type="button" onClick={() => setFeedback(null)} className="cursor-pointer ml-2">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Tarjetas rápidas de Docentes Suplentes registrados */}
      {eligibleSuplentes.length > 0 && (
        <div className="bg-white dark:bg-[#121212] p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-[#27272A] space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-300 flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span>Personal con Rol Docente Suplente ({eligibleSuplentes.length})</span>
            </h3>
            {filterSuplenteId !== 0 && (
              <button
                type="button"
                onClick={() => setFilterSuplenteId(0)}
                className="text-[11px] font-bold text-amber-700 dark:text-amber-300 hover:underline cursor-pointer"
              >
                Ver todos
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {eligibleSuplentes.map((supUser) => {
              const supCount = suplencias.filter(
                (s) => s.idSuplente === supUser.id && s.activo
              ).length;
              const isFiltered = filterSuplenteId === supUser.id;
              return (
                <div
                  key={supUser.id}
                  className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-2 ${
                    isFiltered
                      ? 'bg-amber-50/90 dark:bg-amber-950/40 border-amber-400 dark:border-amber-700'
                      : 'bg-slate-50/80 dark:bg-[#181818] border-slate-200 dark:border-[#27272A]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() =>
                      setFilterSuplenteId((prev) => (prev === supUser.id ? 0 : supUser.id))
                    }
                    className="text-left min-w-0 flex-1 cursor-pointer"
                    title="Filtrar suplencias de este docente suplente"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-xs text-slate-900 dark:text-[#F4F4F5] truncate">
                        {supUser.nombre} {supUser.apellidos}
                      </span>
                      {supUser.activo === false && (
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300">
                          Inactivo
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                      {supCount > 0
                        ? `${supCount} suplencia(s) activa(s)`
                        : 'Sin suplencias activas asignadas'}
                    </p>
                  </button>

                  {canManage && supUser.activo !== false && (
                    <button
                      type="button"
                      onClick={() => openCreateModal(supUser.id)}
                      className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-amber-600 hover:bg-amber-700 text-white shrink-0 cursor-pointer flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Asignar</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Listado de Suplencias */}
      <div className="bg-white dark:bg-[#121212] rounded-2xl border border-slate-200 dark:border-[#27272A] overflow-hidden shadow-xs">
        <div className="p-4 sm:p-5 bg-slate-50/70 dark:bg-[#0A0A0A] border-b border-slate-200 dark:border-[#27272A] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-sm sm:text-base text-slate-900 dark:text-[#F4F4F5]">
                  Suplencias Registradas
                </span>
                <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/70">
                  {suplenciasFiltradas.length} visible(s)
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                Cada registro habilita al Docente Suplente a cubrir la carga del Docente Titular indicado.
              </p>
            </div>
            {canManage && embedded && (
              <button
                type="button"
                onClick={() => openCreateModal()}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white flex items-center justify-center gap-1.5 shadow-sm transition-colors cursor-pointer shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Nueva Suplencia</span>
              </button>
            )}
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por suplente, titular, materia o sección..."
                className="w-full pl-9 pr-8 py-2 rounded-xl bg-white dark:bg-[#121212] border border-slate-200 dark:border-[#27272A] text-xs font-medium text-slate-900 dark:text-[#F4F4F5] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="inline-flex items-center p-1 rounded-xl bg-slate-100 dark:bg-[#121212] border border-slate-200 dark:border-[#27272A] self-start md:self-auto">
              {[
                { id: 'todas' as const, label: `Todas (${suplencias.length})` },
                { id: 'activas' as const, label: `Activas (${activeCount})` },
                {
                  id: 'inactivas' as const,
                  label: `Inactivas (${suplencias.length - activeCount})`,
                },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setEstadoFiltro(opt.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                    estadoFiltro === opt.id
                      ? 'bg-white dark:bg-[#27272A] text-amber-700 dark:text-amber-300 shadow-2xs'
                      : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {suplenciasFiltradas.length === 0 ? (
          <div className="p-10 text-center bg-white dark:bg-[#121212]">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-center justify-center mx-auto mb-3 text-amber-600 dark:text-amber-400">
              <RefreshCw className="w-6 h-6" />
            </div>
            <p className="text-sm font-bold text-slate-800 dark:text-[#F4F4F5]">
              No hay suplencias registradas con estos filtros
            </p>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 max-w-md mx-auto">
              {eligibleSuplentes.length === 0
                ? 'Registre primero al menos un usuario con rol "Docente Suplente" en Gestión de Personal.'
                : 'Asigne una suplencia seleccionando un Docente Suplente y el Docente Titular al cual va a reemplazar.'}
            </p>
            {canManage && eligibleSuplentes.length > 0 && (
              <button
                type="button"
                onClick={() => openCreateModal()}
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Asignar Suplencia</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto bg-white dark:bg-[#121212]">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-[#27272A] text-[11px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider bg-slate-50/50 dark:bg-[#0A0A0A]">
                  <th className="py-3.5 px-4">Docente Suplente</th>
                  <th className="py-3.5 px-4">Reemplaza a (Titular)</th>
                  <th className="py-3.5 px-4">Alcance / Materias</th>
                  <th className="py-3.5 px-4">Sección</th>
                  <th className="py-3.5 px-4">Vigencia / Motivo</th>
                  <th className="py-3.5 px-4 text-center">Estado</th>
                  {canManage && <th className="py-3.5 px-4 text-right w-36">Acciones</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#27272A]">
                {suplenciasFiltradas.map((sup) => {
                  const isFull = Boolean(sup.alcanceCompleto || sup.idMateria == null);
                  const coveredList = sup.materiasTitularResumen || [];
                  return (
                    <tr
                      key={sup.idSuplencia}
                      className="hover:bg-slate-50/70 dark:hover:bg-[#181818] transition-colors"
                    >
                      <td className="py-3.5 px-4 align-top">
                        <div className="font-bold text-slate-900 dark:text-[#F4F4F5]">
                          {sup.suplenteNombre} {sup.suplenteApellidos}
                        </div>
                        <span className="inline-block mt-1 px-2 py-0.2 rounded-full text-[10px] font-bold bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                          Docente Suplente
                        </span>
                      </td>
                      <td className="py-3.5 px-4 align-top">
                        <div className="font-semibold text-slate-800 dark:text-slate-200">
                          {sup.titularNombre} {sup.titularApellidos}
                        </div>
                        <span className="inline-block mt-0.5 text-[10px] font-medium text-slate-500 dark:text-zinc-400">
                          Docente Titular
                        </span>
                      </td>
                      <td className="py-3.5 px-4 align-top">
                        {isFull ? (
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                              <Layers className="w-3 h-3" />
                              Todas las materias del titular ({coveredList.length})
                            </span>
                            {coveredList.length > 0 && (
                              <div className="flex flex-wrap gap-1 pt-0.5">
                                {coveredList.slice(0, 4).map((m) => (
                                  <span
                                    key={m.idMateria}
                                    className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-[#181818] text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-[#27272A]"
                                  >
                                    {m.nombreMateria} ({formatNivelCorto(m.nombreNivel)})
                                  </span>
                                ))}
                                {coveredList.length > 4 && (
                                  <span className="text-[10px] font-semibold text-slate-500 dark:text-zinc-400">
                                    +{coveredList.length - 4} más
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div>
                            <div className="font-bold text-slate-900 dark:text-[#F4F4F5]">
                              {sup.nombreMateria}
                            </div>
                            <span className="inline-block mt-0.5 text-[10px] font-semibold px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                              {formatNivelCorto(sup.nombreNivel)}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 align-top">
                        <span className="inline-block px-2.5 py-0.5 rounded-lg text-xs font-bold bg-slate-100 dark:bg-[#181818] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#27272A]">
                          {sup.nombreSeccion ? `Sección ${sup.nombreSeccion}` : 'Todas las secciones'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 align-top text-xs">
                        <div className="font-mono text-[11px] text-slate-700 dark:text-slate-300 flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>
                            {sup.fechaInicio || sup.fechaFin
                              ? `${sup.fechaInicio || '...'} → ${sup.fechaFin || '...'}`
                              : 'Sin fecha límite'}
                          </span>
                        </div>
                        {sup.motivo && (
                          <div className="text-[11px] text-slate-500 dark:text-zinc-400 italic mt-0.5 line-clamp-2">
                            {sup.motivo}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 align-top text-center">
                        <button
                          type="button"
                          disabled={!canManage}
                          onClick={() => handleToggle(sup.idSuplencia)}
                          className={`px-2.5 py-1 rounded-full text-[11px] font-bold border cursor-pointer transition-colors disabled:cursor-default ${
                            sup.activo
                              ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                              : 'bg-slate-100 dark:bg-[#181818] text-slate-500 dark:text-slate-400 border-slate-200 dark:border-[#27272A]'
                          }`}
                          title="Clic para activar o desactivar"
                        >
                          {sup.activo ? 'Activa' : 'Inactiva'}
                        </button>
                      </td>
                      {canManage && (
                        <td className="py-3.5 px-4 align-top text-right">
                          {confirmDeleteId === sup.idSuplencia ? (
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleDelete(sup.idSuplencia)}
                                className="px-2 py-1 rounded-lg bg-rose-600 text-white text-[10px] font-bold cursor-pointer"
                              >
                                Borrar
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-1.5 py-1 rounded-lg bg-slate-200 dark:bg-[#27272A] text-slate-700 dark:text-slate-300 text-[10px] font-bold cursor-pointer"
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end space-x-1">
                              <button
                                type="button"
                                onClick={() => openEditModal(sup)}
                                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-lg transition-colors cursor-pointer"
                                title="Editar suplencia"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(sup.idSuplencia)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
                                title="Eliminar suplencia"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Crear / Editar Suplencia */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-[#0A0A0A] rounded-3xl max-w-xl w-full max-h-[92vh] overflow-y-auto border border-slate-200 dark:border-[#27272A] p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-[#27272A] mb-4">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 rounded-xl border border-amber-200/70 dark:border-amber-800/50">
                  <RefreshCw className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900 dark:text-[#F4F4F5]">
                    {editingSuplencia ? 'Editar Suplencia Docente' : 'Asignar Suplencia Docente'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    Seleccione el Docente Suplente y el Docente Titular al cual va a reemplazar
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setModalOpen(false);
                  setEditingSuplencia(null);
                }}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              {/* Selección Suplente + Titular */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">
                    Docente Suplente:
                  </label>
                  <select
                    value={form.idSuplente}
                    disabled={Boolean(editingSuplencia)}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, idSuplente: Number(e.target.value) }))
                    }
                    className="w-full bg-slate-50 dark:bg-[#121212] border border-slate-200 dark:border-[#27272A] rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-[#F4F4F5] disabled:opacity-60"
                  >
                    <option value={0}>Seleccione Docente Suplente...</option>
                    {eligibleSuplentes.map((s) => (
                      <option key={s.id} value={s.id} disabled={s.activo === false}>
                        {s.nombre} {s.apellidos}
                        {s.activo === false ? ' (Inactivo)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">
                    Docente Titular a Sustituir:
                  </label>
                  <select
                    value={form.idDocenteTitular}
                    onChange={(e) => {
                      const titId = Number(e.target.value);
                      const titMats = getTitularSubjects(titId);
                      setForm((prev) => ({
                        ...prev,
                        idDocenteTitular: titId,
                        alcanceCompleto: titMats.length > 0 ? prev.alcanceCompleto : false,
                        idMateria: titMats[0]?.idMateria || materias[0]?.idMateria || 0,
                        idSeccion: 0,
                      }));
                    }}
                    className="w-full bg-slate-50 dark:bg-[#121212] border border-slate-200 dark:border-[#27272A] rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-[#F4F4F5]"
                  >
                    <option value={0}>Seleccione Docente Titular...</option>
                    {eligibleTitulares.map((d) => {
                      const matCount = getTitularSubjects(d.id).length;
                      return (
                        <option key={d.id} value={d.id}>
                          {d.nombre} {d.apellidos} ({matCount} mat.)
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>

              {/* Resumen de carga del Docente Titular */}
              {form.idDocenteTitular > 0 && (
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-[#141414] border border-slate-200 dark:border-[#27272A] space-y-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-700 dark:text-zinc-200 flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                      <span>Carga académica actual del titular</span>
                    </span>
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400">
                      {selectedTitularSubjects.length} materia(s) · {selectedTitularSections.length}{' '}
                      sección(es) en horario
                    </span>
                  </div>
                  {selectedTitularSubjects.length === 0 ? (
                    <p className="text-[11px] text-amber-700 dark:text-amber-300">
                      Este docente titular no tiene materias asignadas en Docente-Materia. Puede elegir una materia específica abajo si es necesario.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {selectedTitularSubjects.map((m) => (
                        <span
                          key={m.idMateria}
                          className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-white dark:bg-[#1C1C1F] text-slate-700 dark:text-zinc-200 border border-slate-200 dark:border-[#27272A]"
                        >
                          {m.nombreMateria} ({formatNivelCorto(m.nombreNivel)})
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Modo de cobertura */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300">
                  Alcance de la Suplencia:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    disabled={selectedTitularSubjects.length === 0}
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        alcanceCompleto: true,
                        idSeccion: 0,
                      }))
                    }
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                      form.alcanceCompleto
                        ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-400 dark:border-amber-700 text-amber-950 dark:text-amber-100'
                        : 'bg-slate-50 dark:bg-[#121212] border-slate-200 dark:border-[#27272A] text-slate-700 dark:text-zinc-300'
                    }`}
                  >
                    <p className="text-xs font-bold">Todas las materias del titular</p>
                    <p className="text-[11px] opacity-80 mt-0.5">
                      Cubre automáticamente toda la carga asignada al docente titular.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        alcanceCompleto: false,
                        idMateria:
                          prev.idMateria ||
                          selectedTitularSubjects[0]?.idMateria ||
                          materias[0]?.idMateria ||
                          0,
                        idSeccion: 0,
                      }))
                    }
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      !form.alcanceCompleto
                        ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-400 dark:border-amber-700 text-amber-950 dark:text-amber-100'
                        : 'bg-slate-50 dark:bg-[#121212] border-slate-200 dark:border-[#27272A] text-slate-700 dark:text-zinc-300'
                    }`}
                  >
                    <p className="text-xs font-bold">Materia específica</p>
                    <p className="text-[11px] opacity-80 mt-0.5">
                      Sustituye solo una materia y año escolar puntual.
                    </p>
                  </button>
                </div>
              </div>

              {hasTitularSubjectsOutsideScope && form.alcanceCompleto && (
                <div className="p-3 rounded-xl bg-cyan-50 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-800 text-[11px] text-cyan-900 dark:text-cyan-200">
                  El titular dicta materias en años fuera de su coordinación seccional. Seleccione una sección de sus años asignados o cambie a &ldquo;Materia específica&rdquo;.
                </div>
              )}

              {/* Selector de Materia (si es específica) y Sección */}
              <div className={`grid grid-cols-1 ${!form.alcanceCompleto ? 'sm:grid-cols-2' : ''} gap-3`}>
                {!form.alcanceCompleto && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">
                      Materia:
                    </label>
                    <select
                      value={form.idMateria}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          idMateria: Number(e.target.value),
                          idSeccion: 0,
                        }))
                      }
                      className="w-full bg-slate-50 dark:bg-[#121212] border border-slate-200 dark:border-[#27272A] rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-[#F4F4F5]"
                    >
                      <option value={0}>Seleccione materia...</option>
                      {materias.map((m) => {
                        const isTitularMat = selectedTitularSubjects.some(
                          (tm) => tm.idMateria === m.idMateria
                        );
                        return (
                          <option key={m.idMateria} value={m.idMateria}>
                            {m.nombreMateria} ({formatNivelCorto(m.nombreNivel)})
                            {isTitularMat ? ' ★ Titular' : ''}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">
                    Sección (Opcional):
                  </label>
                  <select
                    value={form.idSeccion}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, idSeccion: Number(e.target.value) }))
                    }
                    className="w-full bg-slate-50 dark:bg-[#121212] border border-slate-200 dark:border-[#27272A] rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-[#F4F4F5]"
                  >
                    <option value={0}>Todas las secciones correspondientes</option>
                    {availableModalSections.map((s) => (
                      <option key={s.idSeccion} value={s.idSeccion}>
                        Sección {s.nombreSeccion} ({formatNivelCorto(s.nombreNivel)})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">
                    Fecha Inicio (Opcional):
                  </label>
                  <input
                    type="date"
                    value={form.fechaInicio}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, fechaInicio: e.target.value }))
                    }
                    className="w-full bg-slate-50 dark:bg-[#121212] border border-slate-200 dark:border-[#27272A] rounded-xl px-3 py-2 text-xs font-mono text-slate-900 dark:text-[#F4F4F5]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">
                    Fecha Fin (Opcional):
                  </label>
                  <input
                    type="date"
                    value={form.fechaFin}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, fechaFin: e.target.value }))
                    }
                    className="w-full bg-slate-50 dark:bg-[#121212] border border-slate-200 dark:border-[#27272A] rounded-xl px-3 py-2 text-xs font-mono text-slate-900 dark:text-[#F4F4F5]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">
                  Motivo de la Suplencia (Opcional):
                </label>
                <input
                  type="text"
                  maxLength={250}
                  placeholder="Ej: Reposo médico o permiso académico del titular"
                  value={form.motivo}
                  onChange={(e) => setForm((prev) => ({ ...prev, motivo: e.target.value }))}
                  className="w-full bg-slate-50 dark:bg-[#121212] border border-slate-200 dark:border-[#27272A] rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-[#F4F4F5]"
                />
              </div>

              <label className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.activo}
                  onChange={(e) => setForm((prev) => ({ ...prev, activo: e.target.checked }))}
                  className="rounded text-amber-600 focus:ring-amber-500"
                />
                <span>Suplencia activa inmediatamente</span>
              </label>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100 dark:border-[#27272A]">
                <button
                  type="button"
                  onClick={() => {
                    setModalOpen(false);
                    setEditingSuplencia(null);
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-[#181818] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving || eligibleSuplentes.length === 0 || eligibleTitulares.length === 0}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {saving ? 'Guardando...' : editingSuplencia ? 'Actualizar Suplencia' : 'Guardar Suplencia'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
