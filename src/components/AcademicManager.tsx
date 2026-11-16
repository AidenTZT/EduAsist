import React, { useState, useEffect, useMemo } from 'react';
import {
  Building,
  Layers,
  BookOpen,
  UserCheck,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  X,
  ShieldAlert,
  Settings,
  Save,
  Search,
  GraduationCap,
} from 'lucide-react';
import type {
  AnoEscolar,
  Seccion,
  Materia,
  DocenteMateria,
  Usuario,
  Horario,
} from '../types.ts';
import {
  createAnoEscolar,
  updateAnoEscolar,
  deleteAnoEscolar,
  createSeccion,
  updateSeccion,
  deleteSeccion,
  createMateria,
  updateMateria,
  deleteMateria,
  assignDocenteMateriasBatch,
  removeDocenteMateria,
  fetchConfiguracion,
  updateConfiguracion,
  fetchHorarios,
} from '../lib/api.ts';

interface MateriaAsignadaResumen {
  idAsignacion: number;
  idMateria: number;
  nombreMateria: string;
  idAno: number;
  nombreNivel: string;
  seccionesProgramadas: string[];
}

interface SeccionAsociadaResumen {
  idSeccion: number;
  nombreSeccion: string;
  idAno: number;
  nombreNivel: string;
  esProgramadaEnHorario: boolean;
}

interface DocenteCargaAgrupada {
  idUsuario: number;
  nombreCompleto: string;
  iniciales: string;
  email: string;
  cedula?: string | null;
  asignaciones: MateriaAsignadaResumen[];
  anosEscolares: Array<{ idAno: number; nombreNivel: string }>;
  secciones: SeccionAsociadaResumen[];
  totalMaterias: number;
  totalAnos: number;
  totalSecciones: number;
}

interface AcademicManagerProps {
  anos: AnoEscolar[];
  secciones: Seccion[];
  materias: Materia[];
  docenteMaterias: DocenteMateria[];
  staffUsers: Usuario[];
  currentUser?: Usuario | null;
  onRefreshData: () => void;
}

export const AcademicManager: React.FC<AcademicManagerProps> = ({
  anos,
  secciones,
  materias,
  docenteMaterias,
  staffUsers,
  currentUser,
  onRefreshData,
}) => {
  const [activeTab, setActiveTab] = useState<
    'secciones' | 'materias' | 'asignaciones' | 'anos' | 'configuracion'
  >('secciones');

  // Modals state
  const [modalType, setModalType] = useState<'ano' | 'seccion' | 'materia' | 'asignacion' | null>(null);
  const [editItem, setEditItem] = useState<any | null>(null);

  // Form states
  const [anoForm, setAnoForm] = useState({ nombreNivel: '', activo: true });
  const [seccionForm, setSeccionForm] = useState({ idAno: anos[0]?.idAno || 1, nombreSeccion: 'A' });
  const [materiaForm, setMateriaForm] = useState({ idAno: anos[0]?.idAno || 1, nombreMateria: '' });

  // Institutional Configuration state
  const [configAnoLectivo, setConfigAnoLectivo] = useState<string>('2025 - 2026');
  const [configNombrePlantel, setConfigNombrePlantel] = useState<string>(
    'Liceo Nacional Bolivariano Gran Mariscal de Ayacucho'
  );
  const [savingConfig, setSavingConfig] = useState<boolean>(false);

  const isDirector = currentUser?.rol === 'director';

  // Strictly filter only users with rol === 'docente'
  const eligibleDocentes = staffUsers.filter((u) => u.rol === 'docente');

  // Form state for multiple subject assignment
  const [selectedDocenteId, setSelectedDocenteId] = useState<number>(
    staffUsers.find((u) => u.rol === 'docente')?.id || 0
  );
  const [selectedMateriaIds, setSelectedMateriaIds] = useState<number[]>([]);

  // Horarios & Consolidated Teacher Assignment View state
  const [horarios, setHorarios] = useState<Horario[]>([]);
  const [asignacionSearch, setAsignacionSearch] = useState<string>('');
  const [asignacionFiltro, setAsignacionFiltro] = useState<'con_carga' | 'todos' | 'sin_carga'>('con_carga');
  const [confirmRemoveAsignacionId, setConfirmRemoveAsignacionId] = useState<number | null>(null);
  const [removingAsignacionId, setRemovingAsignacionId] = useState<number | null>(null);

  const [saving, setSaving] = useState<boolean>(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load institutional configuration on mount
  useEffect(() => {
    fetchConfiguracion()
      .then((cfg) => {
        if (cfg.anoLectivo) setConfigAnoLectivo(cfg.anoLectivo);
        if (cfg.nombreInstitucion) setConfigNombrePlantel(cfg.nombreInstitucion);
      })
      .catch((e) => console.error('Error loading config in AcademicManager:', e));
  }, []);

  useEffect(() => {
    fetchHorarios()
      .then((data) => setHorarios(data))
      .catch((e) => console.error('Error loading horarios in AcademicManager:', e));
  }, [docenteMaterias]);

  // Helper to shorten level name (e.g. "1er Año - Educación Media General" -> "1er Año")
  const formatNivelCorto = (nivel?: string) => {
    if (!nivel) return 'Sin nivel';
    return nivel.split(' - ')[0].trim();
  };

  // Consolidated grouping: 1 entry per teacher with subjects, academic years, and sections
  const docentesCargaAgrupada = useMemo<DocenteCargaAgrupada[]>(() => {
    const anoById = new Map<number, AnoEscolar>(anos.map((a) => [a.idAno, a]));
    const materiaById = new Map<number, Materia>(materias.map((m) => [m.idMateria, m]));
    const seccionById = new Map<number, Seccion>(secciones.map((s) => [s.idSeccion, s]));

    // Group raw assignments by idUsuario
    const assignmentsByDocente = new Map<number, DocenteMateria[]>();
    for (const dm of docenteMaterias) {
      const list = assignmentsByDocente.get(dm.idUsuario) || [];
      list.push(dm);
      assignmentsByDocente.set(dm.idUsuario, list);
    }

    // Collect all docente IDs to process (eligible teachers + any assigned teacher)
    const docenteMap = new Map<number, Usuario>();
    for (const doc of eligibleDocentes) {
      docenteMap.set(doc.id, doc);
    }
    for (const dm of docenteMaterias) {
      if (!docenteMap.has(dm.idUsuario)) {
        const staffMatch = staffUsers.find((u) => u.id === dm.idUsuario);
        docenteMap.set(
          dm.idUsuario,
          staffMatch || {
            id: dm.idUsuario,
            uid: String(dm.idUsuario),
            email: '',
            nombre: dm.usuarioNombre || 'Docente',
            apellidos: dm.usuarioApellidos || '',
            rol: dm.usuarioRol || 'docente',
          }
        );
      }
    }

    const result: DocenteCargaAgrupada[] = [];

    docenteMap.forEach((docente, idUsuario) => {
      const rawAssignments = assignmentsByDocente.get(idUsuario) || [];

      const asignaciones: MateriaAsignadaResumen[] = rawAssignments
        .map((dm) => {
          const mat = materiaById.get(dm.idMateria);
          const idAno = dm.idAno ?? mat?.idAno ?? 0;
          const ano = anoById.get(idAno);
          const nombreNivel = dm.nombreNivel || mat?.nombreNivel || ano?.nombreNivel || 'Sin nivel';

          // Exact sections from horarios for this subject & teacher
          const scheduledSecNames = Array.from(
            new Set(
              horarios
                .filter(
                  (h) =>
                    h.idMateria === dm.idMateria &&
                    (!h.idDocente || h.idDocente === idUsuario)
                )
                .map((h) => seccionById.get(h.idSeccion)?.nombreSeccion || h.nombreSeccion)
                .filter((name): name is string => Boolean(name))
            )
          ).sort((a, b) => a.localeCompare(b));

          return {
            idAsignacion: dm.idAsignacion,
            idMateria: dm.idMateria,
            nombreMateria: dm.nombreMateria || mat?.nombreMateria || 'Materia',
            idAno,
            nombreNivel,
            seccionesProgramadas: scheduledSecNames,
          };
        })
        .sort((a, b) => {
          if (a.idAno !== b.idAno) return a.idAno - b.idAno;
          return a.nombreMateria.localeCompare(b.nombreMateria);
        });

      // Distinct academic years (sorted by idAno)
      const anosMap = new Map<number, string>();
      for (const asig of asignaciones) {
        if (asig.idAno > 0 && !anosMap.has(asig.idAno)) {
          anosMap.set(asig.idAno, asig.nombreNivel);
        }
      }
      const anosEscolares = Array.from(anosMap.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([idAno, nombreNivel]) => ({ idAno, nombreNivel }));

      // Consolidate sections: prioritize scheduled sections per academic year;
      // if an assigned year has no schedule blocks yet, fall back to sections defined for that year.
      const assignedMateriaIds = new Set(asignaciones.map((a) => a.idMateria));
      const scheduledBySecId = new Map<number, SeccionAsociadaResumen>();
      const anosWithScheduledHorarios = new Set<number>();

      for (const h of horarios) {
        const matchesTeacherOrSubject =
          h.idDocente === idUsuario || (!h.idDocente && assignedMateriaIds.has(h.idMateria));
        if (matchesTeacherOrSubject && assignedMateriaIds.has(h.idMateria)) {
          const sec = seccionById.get(h.idSeccion);
          const idAno = sec?.idAno ?? h.idAno;
          const nombreNivel =
            sec?.nombreNivel || anoById.get(idAno)?.nombreNivel || h.nombreNivel || 'Sin nivel';
          const nombreSeccion = sec?.nombreSeccion || h.nombreSeccion || '';

          if (nombreSeccion && !scheduledBySecId.has(h.idSeccion)) {
            scheduledBySecId.set(h.idSeccion, {
              idSeccion: h.idSeccion,
              nombreSeccion,
              idAno,
              nombreNivel,
              esProgramadaEnHorario: true,
            });
          }
          if (idAno) anosWithScheduledHorarios.add(idAno);
        }
      }

      for (const anoItem of anosEscolares) {
        if (!anosWithScheduledHorarios.has(anoItem.idAno)) {
          const seccionesDelAno = secciones.filter((s) => s.idAno === anoItem.idAno);
          for (const sec of seccionesDelAno) {
            if (!scheduledBySecId.has(sec.idSeccion)) {
              scheduledBySecId.set(sec.idSeccion, {
                idSeccion: sec.idSeccion,
                nombreSeccion: sec.nombreSeccion,
                idAno: sec.idAno,
                nombreNivel: sec.nombreNivel || anoItem.nombreNivel,
                esProgramadaEnHorario: false,
              });
            }
          }
        }
      }

      const seccionesConsolidadas = Array.from(scheduledBySecId.values()).sort((a, b) => {
        if (a.idAno !== b.idAno) return a.idAno - b.idAno;
        return a.nombreSeccion.localeCompare(b.nombreSeccion);
      });

      const nombre = (docente.nombre || '').trim();
      const apellidos = (docente.apellidos || '').trim();
      const nombreCompleto = `${nombre} ${apellidos}`.trim() || docente.email || 'Docente';
      const iniciales = `${nombre.charAt(0)}${apellidos.charAt(0)}`.toUpperCase() || 'DO';

      result.push({
        idUsuario,
        nombreCompleto,
        iniciales,
        email: docente.email || '',
        cedula: docente.cedula,
        asignaciones,
        anosEscolares,
        secciones: seccionesConsolidadas,
        totalMaterias: asignaciones.length,
        totalAnos: anosEscolares.length,
        totalSecciones: seccionesConsolidadas.length,
      });
    });

    return result.sort((a, b) => {
      if (a.totalMaterias === 0 && b.totalMaterias > 0) return 1;
      if (a.totalMaterias > 0 && b.totalMaterias === 0) return -1;
      return a.nombreCompleto.localeCompare(b.nombreCompleto);
    });
  }, [docenteMaterias, eligibleDocentes, staffUsers, materias, anos, secciones, horarios]);

  const docentesFiltrados = useMemo(() => {
    const query = asignacionSearch.trim().toLowerCase();
    return docentesCargaAgrupada.filter((doc) => {
      if (asignacionFiltro === 'con_carga' && doc.totalMaterias === 0) return false;
      if (asignacionFiltro === 'sin_carga' && doc.totalMaterias > 0) return false;
      if (!query) return true;
      const matchesDocente =
        doc.nombreCompleto.toLowerCase().includes(query) ||
        doc.email.toLowerCase().includes(query) ||
        (doc.cedula || '').toLowerCase().includes(query);
      const matchesMateria = doc.asignaciones.some(
        (a) =>
          a.nombreMateria.toLowerCase().includes(query) ||
          a.nombreNivel.toLowerCase().includes(query)
      );
      const matchesSeccion = doc.secciones.some(
        (s) =>
          s.nombreSeccion.toLowerCase().includes(query) ||
          s.nombreNivel.toLowerCase().includes(query)
      );
      return matchesDocente || matchesMateria || matchesSeccion;
    });
  }, [docentesCargaAgrupada, asignacionFiltro, asignacionSearch]);

  const openCreateModal = (type: 'ano' | 'seccion' | 'materia' | 'asignacion') => {
    setEditItem(null);
    setMessage(null);
    setModalType(type);
    if (type === 'ano') setAnoForm({ nombreNivel: '', activo: true });
    if (type === 'seccion') setSeccionForm({ idAno: anos[0]?.idAno || 1, nombreSeccion: 'A' });
    if (type === 'materia') setMateriaForm({ idAno: anos[0]?.idAno || 1, nombreMateria: '' });
    if (type === 'asignacion') {
      const firstDocente = staffUsers.find((u) => u.rol === 'docente');
      const targetDocenteId = firstDocente ? firstDocente.id : 0;
      setSelectedDocenteId(targetDocenteId);
      const currentlyAssigned = docenteMaterias
        .filter((dm) => dm.idUsuario === targetDocenteId)
        .map((dm) => dm.idMateria);
      setSelectedMateriaIds(currentlyAssigned);
    }
  };

  const openEditDocenteAsignacionModal = (idUsuario: number) => {
    setEditItem(null);
    setMessage(null);
    setSelectedDocenteId(idUsuario);
    const currentlyAssigned = docenteMaterias
      .filter((dm) => dm.idUsuario === idUsuario)
      .map((dm) => dm.idMateria);
    setSelectedMateriaIds(currentlyAssigned);
    setModalType('asignacion');
  };

  const handleQuickRemoveAsignacion = async (idAsignacion: number, nombreMateria: string) => {
    setRemovingAsignacionId(idAsignacion);
    setMessage(null);
    try {
      await removeDocenteMateria(idAsignacion);
      setConfirmRemoveAsignacionId(null);
      setMessage({
        type: 'success',
        text: `Asignación de "${nombreMateria}" removida correctamente.`,
      });
      onRefreshData();
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err.message || 'No se pudo remover la asignación.',
      });
    } finally {
      setRemovingAsignacionId(null);
    }
  };

  const handleDocenteChange = (newDocenteId: number) => {
    setSelectedDocenteId(newDocenteId);
    const currentlyAssigned = docenteMaterias
      .filter((dm) => dm.idUsuario === newDocenteId)
      .map((dm) => dm.idMateria);
    setSelectedMateriaIds(currentlyAssigned);
  };

  const toggleMateriaSelection = (idMateria: number) => {
    setSelectedMateriaIds((prev) =>
      prev.includes(idMateria) ? prev.filter((id) => id !== idMateria) : [...prev, idMateria]
    );
  };

  const selectAllMaterias = () => {
    setSelectedMateriaIds(materias.map((m) => m.idMateria));
  };

  const deselectAllMaterias = () => {
    setSelectedMateriaIds([]);
  };

  const openEditModal = (type: 'ano' | 'seccion' | 'materia', item: any) => {
    setEditItem(item);
    setMessage(null);
    setModalType(type);
    if (type === 'ano') setAnoForm({ nombreNivel: item.nombreNivel, activo: item.activo });
    if (type === 'seccion') setSeccionForm({ idAno: item.idAno, nombreSeccion: item.nombreSeccion });
    if (type === 'materia') setMateriaForm({ idAno: item.idAno, nombreMateria: item.nombreMateria });
  };

  const handleSaveAno = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      if (editItem) {
        await updateAnoEscolar(editItem.idAno, anoForm.nombreNivel, anoForm.activo);
        setMessage({ type: 'success', text: 'Año escolar actualizado correctamente' });
      } else {
        await createAnoEscolar(anoForm.nombreNivel);
        setMessage({ type: 'success', text: 'Año escolar creado con éxito' });
      }
      setModalType(null);
      onRefreshData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Error al guardar año escolar' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAno = async (idAno: number) => {
    if (!confirm('¿Seguro que desea eliminar este año escolar? Se eliminarán en cascada las materias asociadas.')) return;
    try {
      await deleteAnoEscolar(idAno);
      setMessage({ type: 'success', text: 'Año escolar eliminado' });
      onRefreshData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Error al eliminar año escolar' });
    }
  };

  const handleSaveSeccion = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      if (editItem) {
        await updateSeccion(editItem.idSeccion, seccionForm.nombreSeccion, seccionForm.idAno);
        setMessage({ type: 'success', text: 'Sección actualizada correctamente' });
      } else {
        await createSeccion(seccionForm.idAno, seccionForm.nombreSeccion);
        setMessage({ type: 'success', text: 'Sección creada exitosamente' });
      }
      setModalType(null);
      onRefreshData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Error al guardar sección' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSeccion = async (idSeccion: number) => {
    if (!confirm('¿Seguro que desea eliminar esta sección? Los estudiantes vinculados quedarán sin sección asignada.')) return;
    try {
      await deleteSeccion(idSeccion);
      setMessage({ type: 'success', text: 'Sección eliminada' });
      onRefreshData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Error al eliminar sección' });
    }
  };

  const handleSaveMateria = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      if (editItem) {
        await updateMateria(editItem.idMateria, materiaForm.nombreMateria, materiaForm.idAno);
        setMessage({ type: 'success', text: 'Materia actualizada' });
      } else {
        await createMateria(materiaForm.idAno, materiaForm.nombreMateria);
        setMessage({ type: 'success', text: 'Materia creada exitosamente' });
      }
      setModalType(null);
      onRefreshData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Error al guardar materia' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMateria = async (idMateria: number) => {
    if (!confirm('¿Seguro que desea eliminar esta materia? Se eliminarán los registros de asistencia vinculados.')) return;
    try {
      await deleteMateria(idMateria);
      setMessage({ type: 'success', text: 'Materia eliminada' });
      onRefreshData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Error al eliminar materia' });
    }
  };

  const handleSaveBatchAsignacion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDocenteId) {
      setMessage({ type: 'error', text: 'Debe seleccionar un docente.' });
      return;
    }

    const targetDocente = staffUsers.find((u) => u.id === selectedDocenteId);
    if (!targetDocente || targetDocente.rol !== 'docente') {
      setMessage({
        type: 'error',
        text: 'Violación de regla RBAC: Solo se pueden asignar materias a usuarios con rol docente.',
      });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const currentAssignments = docenteMaterias.filter((dm) => dm.idUsuario === selectedDocenteId);
      const currentAssignedMateriaIds = currentAssignments.map((dm) => dm.idMateria);

      const materiasToAssign = selectedMateriaIds.filter((id) => !currentAssignedMateriaIds.includes(id));
      const assignmentsToRemove = currentAssignments.filter((dm) => !selectedMateriaIds.includes(dm.idMateria));

      for (const a of assignmentsToRemove) {
        await removeDocenteMateria(a.idAsignacion);
      }

      if (materiasToAssign.length > 0) {
        await assignDocenteMateriasBatch(selectedDocenteId, materiasToAssign);
      }

      setMessage({
        type: 'success',
        text: `Asignaciones actualizadas con éxito para el docente ${targetDocente.nombre} ${targetDocente.apellidos}. Total asignadas: ${selectedMateriaIds.length}.`,
      });
      setModalType(null);
      onRefreshData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Error al actualizar asignaciones del docente' });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveInstitutionalConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    setMessage(null);
    try {
      await Promise.all([
        updateConfiguracion('ano_lectivo', configAnoLectivo.trim(), 'Año lectivo escolar vigente'),
        updateConfiguracion('nombre_institucion', configNombrePlantel.trim(), 'Nombre oficial del plantel'),
      ]);

      setMessage({
        type: 'success',
        text: `Configuración institucional actualizada exitosamente (${configNombrePlantel} • ${configAnoLectivo}).`,
      });
      onRefreshData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Error al guardar configuración institucional' });
    } finally {
      setSavingConfig(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                Gestión Institucional & Académica
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200">
                Pensum Oficial MPPE
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Control de configuración institucional, años académicos, secciones y asignaciones docentes
            </p>
          </div>

          <div className="flex items-center space-x-2">
            {activeTab === 'anos' && (
              <button
                onClick={() => openCreateModal('ano')}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-purple-600 text-white hover:bg-purple-700 flex items-center space-x-1.5 shadow-sm shadow-purple-100 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Nuevo Año / Nivel</span>
              </button>
            )}
            {activeTab === 'secciones' && (
              <button
                onClick={() => openCreateModal('seccion')}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-purple-600 text-white hover:bg-purple-700 flex items-center space-x-1.5 shadow-sm shadow-purple-100 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Nueva Sección</span>
              </button>
            )}
            {activeTab === 'materias' && (
              <button
                onClick={() => openCreateModal('materia')}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-purple-600 text-white hover:bg-purple-700 flex items-center space-x-1.5 shadow-sm shadow-purple-100 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Nueva Materia</span>
              </button>
            )}
            {activeTab === 'asignaciones' && (
              <button
                onClick={() => openCreateModal('asignacion')}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-purple-600 text-white hover:bg-purple-700 flex items-center space-x-1.5 shadow-sm shadow-purple-100 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Asignar Docente</span>
              </button>
            )}
          </div>
        </div>

        {/* Tab Buttons with scroll fade */}
        <div className="relative border-t border-slate-100 dark:border-[#27272A] mt-5 pt-3">
          <div className="flex space-x-1 overflow-x-auto scrollbar-none pb-1">
          <button
            onClick={() => setActiveTab('configuracion')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors flex items-center space-x-1.5 cursor-pointer ${
              activeTab === 'configuracion'
                ? 'bg-purple-100 text-purple-900 shadow-2xs font-extrabold'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Settings className="w-3.5 h-3.5 text-purple-600" />
            <span>Configuración del Plantel</span>
          </button>

          <button
            onClick={() => setActiveTab('secciones')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors flex items-center space-x-1.5 cursor-pointer ${
              activeTab === 'secciones' ? 'bg-purple-100 text-purple-800' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Secciones ({secciones.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('materias')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors flex items-center space-x-1.5 cursor-pointer ${
              activeTab === 'materias' ? 'bg-purple-100 text-purple-800' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Materias ({materias.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('asignaciones')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors flex items-center space-x-1.5 cursor-pointer ${
              activeTab === 'asignaciones' ? 'bg-purple-100 text-purple-800' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>Asignación Docente-Materia ({docenteMaterias.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('anos')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors flex items-center space-x-1.5 cursor-pointer ${
              activeTab === 'anos' ? 'bg-purple-100 text-purple-800' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Building className="w-3.5 h-3.5" />
            <span>Años Escolares ({anos.length})</span>
          </button>
        </div>
        <div className="pointer-events-none absolute right-0 top-3 bottom-1 w-8 bg-gradient-to-l from-white dark:from-[#121212] to-transparent rounded-r-lg" />
      </div>
      </div>

      {/* Message feedback */}
      {message && (
        <div
          className={`p-3.5 rounded-xl text-xs font-semibold flex items-center justify-between ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          <div className="flex items-center space-x-2">
            {message.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-rose-600" />}
            <span>{message.text}</span>
          </div>
          <button onClick={() => setMessage(null)} className="cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 0. CONFIGURACIÓN INSTITUCIONAL (ROL EXCLUSIVO: DIRECTOR) */}
      {activeTab === 'configuracion' && (
        <div className="space-y-6">
          {/* Role Access Notice */}
          {!isDirector && (
            <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 flex items-start space-x-3 text-xs">
              <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-amber-900 dark:text-amber-200">
                  Modo de Solo Consulta (Rol actual: {currentUser?.rol || 'Personal'})
                </p>
                <p className="text-amber-800 dark:text-amber-300 mt-0.5">
                  La modificación de la configuración institucional general (año lectivo y nombre del plantel) está reservada estrictamente para el <strong>Director</strong> de la institución.
                </p>
              </div>
            </div>
          )}

          {/* Configuración Global del Plantel y Año Lectivo */}
          <div className="bg-white dark:bg-[#121212] rounded-2xl border border-slate-200 dark:border-[#27272A] overflow-hidden shadow-xs p-6 space-y-6">
            <div className="border-b border-slate-100 dark:border-[#27272A] pb-4">
              <h3 className="font-bold text-base text-slate-900 dark:text-[#F4F4F5]">
                Configuración Institucional General
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Nombre oficial del plantel educativo y año lectivo vigente reflejados en todos los reportes oficiales de asistencia
              </p>
            </div>

            <form onSubmit={handleSaveInstitutionalConfig} className="max-w-xl space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Año Lectivo Escolar:
                </label>
                <input
                  type="text"
                  required
                  disabled={!isDirector}
                  value={configAnoLectivo}
                  onChange={(e) => setConfigAnoLectivo(e.target.value)}
                  placeholder="Ej: 2025 - 2026"
                  className="w-full bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] rounded-xl px-3 py-2.5 text-xs font-bold text-slate-900 dark:text-[#F4F4F5] focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-60"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Nombre Oficial del Plantel Educativo:
                </label>
                <input
                  type="text"
                  required
                  disabled={!isDirector}
                  value={configNombrePlantel}
                  onChange={(e) => setConfigNombrePlantel(e.target.value)}
                  placeholder="Nombre del liceo o institución"
                  className="w-full bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] rounded-xl px-3 py-2.5 text-xs font-medium text-slate-900 dark:text-[#F4F4F5] focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-60"
                />
              </div>

              {isDirector && (
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={savingConfig}
                    className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-md shadow-purple-100 dark:shadow-none transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    <span>{savingConfig ? 'Guardando configuración...' : 'Guardar Datos del Plantel'}</span>
                  </button>
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      {/* 1. SECCIONES TAB */}
      {activeTab === 'secciones' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="p-4 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between">
            <span className="font-bold text-sm text-slate-800">
              Listado de Secciones por Año
            </span>
            <span className="text-xs text-slate-500">
              Permite agrupar a los estudiantes para el pase de lista y asignación docente
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider bg-slate-50/50">
                  <th className="py-3 px-4">Año / Nivel</th>
                  <th className="py-3 px-4 text-center w-36">Sección</th>
                  <th className="py-3 px-4 text-right w-36">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {secciones.map((sec) => (
                  <tr key={sec.idSeccion} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 font-semibold text-slate-900">{sec.nombreNivel}</td>
                    <td className="py-3 px-4 text-center">
                      <span className="inline-block px-3 py-1 rounded-lg text-xs font-black bg-purple-100 text-purple-800">
                        Sección {sec.nombreSeccion}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => openEditModal('seccion', sec)}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                          title="Editar Sección"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteSeccion(sec.idSeccion)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title="Eliminar Sección"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 2. MATERIAS TAB */}
      {activeTab === 'materias' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="p-4 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between">
            <span className="font-bold text-sm text-slate-800">
              Pensum Oficial de Asignaturas (Educación Media General)
            </span>
            <span className="text-xs text-slate-500 font-medium">
              Total materias registradas: {materias.length}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider bg-slate-50/50">
                  <th className="py-3 px-4">Asignatura</th>
                  <th className="py-3 px-4">Año Académico</th>
                  <th className="py-3 px-4">Docente Asignado</th>
                  <th className="py-3 px-4 text-right w-36">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {materias.map((mat) => {
                  const assignment = docenteMaterias.find((dm) => dm.idMateria === mat.idMateria);
                  return (
                    <tr key={mat.idMateria} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 font-bold text-slate-900">{mat.nombreMateria}</td>
                      <td className="py-3 px-4 text-xs text-slate-600 font-semibold">{mat.nombreNivel}</td>
                      <td className="py-3 px-4 text-xs">
                        {assignment ? (
                          <span className="font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                            {assignment.usuarioNombre} {assignment.usuarioApellidos}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Sin docente asignado</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => openEditModal('materia', mat)}
                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                            title="Editar Materia"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteMateria(mat.idMateria)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="Eliminar Materia"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. ASIGNACIONES TAB (VISTA CONSOLIDADA POR DOCENTE · OLED + TABLE-TO-CARD) */}
      {activeTab === 'asignaciones' && (
        <div className="bg-white dark:bg-[#000000] rounded-2xl border border-slate-200 dark:border-[#27272A] overflow-hidden shadow-xs">
          {/* Header & Toolbar */}
          <div className="p-4 sm:p-5 bg-slate-50/70 dark:bg-[#0A0A0A] border-b border-slate-200 dark:border-[#27272A] space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-sm sm:text-base text-slate-900 dark:text-[#F4F4F5]">
                    Carga Académica Consolidada por Docente
                  </span>
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/70">
                    {docentesCargaAgrupada.filter((d) => d.totalMaterias > 0).length} docentes activos · {docenteMaterias.length} materias
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                  Vista unificada de materias, años escolares y secciones asignadas a cada profesor
                </p>
              </div>
              <button
                type="button"
                onClick={() => openCreateModal('asignacion')}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white flex items-center justify-center space-x-1.5 shadow-sm shadow-purple-100 dark:shadow-none transition-colors cursor-pointer shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Asignar Múltiples Materias</span>
              </button>
            </div>

            {/* Search & Filter Controls */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={asignacionSearch}
                  onChange={(e) => setAsignacionSearch(e.target.value)}
                  placeholder="Buscar por docente, materia, año o sección..."
                  className="w-full pl-9 pr-8 py-2 rounded-xl bg-white dark:bg-[#121212] border border-slate-200 dark:border-[#27272A] text-xs font-medium text-slate-900 dark:text-[#F4F4F5] placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                {asignacionSearch && (
                  <button
                    type="button"
                    onClick={() => setAsignacionSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 cursor-pointer"
                    aria-label="Limpiar búsqueda"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="inline-flex items-center p-1 rounded-xl bg-slate-100 dark:bg-[#121212] border border-slate-200 dark:border-[#27272A] self-start md:self-auto">
                {[
                  {
                    id: 'con_carga' as const,
                    label: `Con carga (${docentesCargaAgrupada.filter((d) => d.totalMaterias > 0).length})`,
                  },
                  {
                    id: 'todos' as const,
                    label: `Todos (${docentesCargaAgrupada.length})`,
                  },
                  {
                    id: 'sin_carga' as const,
                    label: `Sin materias (${docentesCargaAgrupada.filter((d) => d.totalMaterias === 0).length})`,
                  },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setAsignacionFiltro(opt.id)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                      asignacionFiltro === opt.id
                        ? 'bg-white dark:bg-[#27272A] text-purple-700 dark:text-purple-300 shadow-2xs'
                        : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Empty State */}
          {docentesFiltrados.length === 0 ? (
            <div className="p-10 text-center bg-white dark:bg-[#000000]">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-[#121212] border border-slate-200 dark:border-[#27272A] flex items-center justify-center mx-auto mb-3 text-slate-400 dark:text-zinc-500">
                <UserCheck className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-slate-800 dark:text-[#F4F4F5]">
                No se encontraron docentes en esta vista
              </p>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 max-w-sm mx-auto">
                {asignacionSearch
                  ? 'Pruebe con otro término de búsqueda o limpie el filtro actual.'
                  : 'Asigne materias del pensum oficial para visualizar la carga académica consolidada por docente.'}
              </p>
              <button
                type="button"
                onClick={() => openCreateModal('asignacion')}
                className="mt-4 inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Asignar Materias a Docente</span>
              </button>
            </div>
          ) : (
            <>
              {/* DESKTOP VIEW: CONSOLIDATED TABLE (hidden on mobile/tablet) */}
              <div className="hidden lg:block overflow-x-auto bg-white dark:bg-[#000000]">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-[#27272A] text-[11px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider bg-slate-50/50 dark:bg-[#0A0A0A]">
                      <th className="py-3.5 px-4 w-64">Docente</th>
                      <th className="py-3.5 px-4">Materias Asignadas</th>
                      <th className="py-3.5 px-4 w-56">Años Escolares</th>
                      <th className="py-3.5 px-4 w-60">Secciones Asociadas</th>
                      <th className="py-3.5 px-4 text-right w-40">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-[#27272A]">
                    {docentesFiltrados.map((doc) => (
                      <tr
                        key={doc.idUsuario}
                        className="hover:bg-slate-50/70 dark:hover:bg-[#121212] transition-colors align-top"
                      >
                        {/* Docente Identity */}
                        <td className="py-4 px-4">
                          <div className="flex items-start space-x-3">
                            <div className="w-9 h-9 rounded-xl bg-purple-100 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-800/60 text-purple-700 dark:text-purple-300 font-black text-xs flex items-center justify-center shrink-0">
                              {doc.iniciales}
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-slate-900 dark:text-[#F4F4F5] leading-snug">
                                {doc.nombreCompleto}
                              </div>
                              {doc.email && (
                                <div className="text-[11px] text-slate-500 dark:text-zinc-400 truncate max-w-[180px]">
                                  {doc.email}
                                </div>
                              )}
                              <div className="mt-1.5 inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 dark:bg-[#181818] text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-[#27272A]">
                                <BookOpen className="w-3 h-3 text-purple-600 dark:text-purple-400" />
                                <span>
                                  {doc.totalMaterias}{' '}
                                  {doc.totalMaterias === 1 ? 'materia' : 'materias'}
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Materias Consolidadas */}
                        <td className="py-4 px-4">
                          {doc.asignaciones.length === 0 ? (
                            <span className="text-xs italic text-slate-400 dark:text-zinc-500">
                              Sin materias asignadas actualmente
                            </span>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {doc.asignaciones.map((asig) => {
                                const isConfirming = confirmRemoveAsignacionId === asig.idAsignacion;
                                const isRemoving = removingAsignacionId === asig.idAsignacion;
                                return (
                                  <div
                                    key={asig.idAsignacion}
                                    className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-lg bg-slate-100/90 dark:bg-[#121212] border border-slate-200 dark:border-[#27272A] text-xs group"
                                    title={`${asig.nombreMateria} — ${asig.nombreNivel}${
                                      asig.seccionesProgramadas.length > 0
                                        ? ` (Secciones: ${asig.seccionesProgramadas.join(', ')})`
                                        : ''
                                    }`}
                                  >
                                    <span className="font-bold text-slate-800 dark:text-[#F4F4F5]">
                                      {asig.nombreMateria}
                                    </span>
                                    <span className="text-[10px] font-semibold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 px-1.5 py-0.5 rounded border border-purple-200/80 dark:border-purple-800/50">
                                      {formatNivelCorto(asig.nombreNivel)}
                                    </span>

                                    {isConfirming ? (
                                      <span className="inline-flex items-center space-x-1 ml-0.5 pl-1 border-l border-slate-300 dark:border-[#27272A]">
                                        <button
                                          type="button"
                                          disabled={isRemoving}
                                          onClick={() =>
                                            handleQuickRemoveAsignacion(
                                              asig.idAsignacion,
                                              asig.nombreMateria
                                            )
                                          }
                                          className="px-1.5 py-0.5 rounded bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold cursor-pointer disabled:opacity-50"
                                          title="Confirmar eliminación"
                                        >
                                          {isRemoving ? '...' : 'Quitar'}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setConfirmRemoveAsignacionId(null)}
                                          className="p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 cursor-pointer"
                                          title="Cancelar"
                                        >
                                          <X className="w-3 h-3" />
                                        </button>
                                      </span>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setConfirmRemoveAsignacionId(asig.idAsignacion)
                                        }
                                        className="p-0.5 rounded text-slate-400 dark:text-zinc-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                                        title={`Remover ${asig.nombreMateria}`}
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </td>

                        {/* Años Escolares */}
                        <td className="py-4 px-4">
                          {doc.totalAnos === 0 ? (
                            <span className="text-xs text-slate-400 dark:text-zinc-500">—</span>
                          ) : (
                            <div className="space-y-1.5">
                              <div className="inline-flex items-center space-x-1 text-[11px] font-bold text-slate-700 dark:text-zinc-200">
                                <GraduationCap className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                                <span>
                                  {doc.totalAnos}{' '}
                                  {doc.totalAnos === 1 ? 'año escolar' : 'años escolares'}
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {doc.anosEscolares.map((ano) => (
                                  <span
                                    key={ano.idAno}
                                    className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-900/60"
                                    title={ano.nombreNivel}
                                  >
                                    {formatNivelCorto(ano.nombreNivel)}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </td>

                        {/* Secciones Asociadas */}
                        <td className="py-4 px-4">
                          {doc.secciones.length === 0 ? (
                            <span className="text-xs text-slate-400 dark:text-zinc-500">
                              Sin secciones
                            </span>
                          ) : (
                            <div className="space-y-1.5">
                              <div className="inline-flex items-center space-x-1 text-[11px] font-bold text-slate-700 dark:text-zinc-200">
                                <Layers className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                <span>
                                  {doc.totalSecciones}{' '}
                                  {doc.totalSecciones === 1 ? 'sección' : 'secciones'}
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {doc.secciones.map((sec) => (
                                  <span
                                    key={sec.idSeccion}
                                    title={
                                      sec.esProgramadaEnHorario
                                        ? `Sección ${sec.nombreSeccion} (${sec.nombreNivel}) — Confirmada en horario`
                                        : `Sección ${sec.nombreSeccion} (${sec.nombreNivel}) — Sección del nivel asignado`
                                    }
                                    className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${
                                      sec.esProgramadaEnHorario
                                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900/60'
                                        : 'bg-slate-50 dark:bg-[#121212] text-slate-600 dark:text-zinc-300 border-dashed border-slate-300 dark:border-[#3F3F46]'
                                    }`}
                                  >
                                    {formatNivelCorto(sec.nombreNivel)} &ldquo;{sec.nombreSeccion}&rdquo;
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </td>

                        {/* Acciones Rápidas por Docente */}
                        <td className="py-4 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => openEditDocenteAsignacionModal(doc.idUsuario)}
                            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-[#181818] hover:bg-purple-50 dark:hover:bg-purple-950/50 text-slate-700 dark:text-[#F4F4F5] hover:text-purple-700 dark:hover:text-purple-300 border border-slate-200 dark:border-[#27272A] hover:border-purple-300 dark:hover:border-purple-700/70 transition-colors cursor-pointer"
                            title="Editar, agregar o quitar materias de este docente"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            <span>{doc.totalMaterias > 0 ? 'Gestionar' : 'Asignar'}</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* MOBILE & TABLET VIEW: CONSOLIDATED OLED CARDS (shown below lg) */}
              <div className="block lg:hidden p-3 sm:p-4 space-y-3 bg-slate-50/40 dark:bg-[#000000]">
                {docentesFiltrados.map((doc) => (
                  <div
                    key={doc.idUsuario}
                    className="rounded-2xl bg-white dark:bg-[#0A0A0A] border border-slate-200 dark:border-[#27272A] p-4 space-y-3.5 shadow-2xs"
                  >
                    {/* Card Header: Teacher + Quick Action */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center space-x-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-800/60 text-purple-700 dark:text-purple-300 font-black text-xs flex items-center justify-center shrink-0">
                          {doc.iniciales}
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-bold text-sm text-slate-900 dark:text-[#F4F4F5] truncate">
                            {doc.nombreCompleto}
                          </h4>
                          {doc.email && (
                            <p className="text-[11px] text-slate-500 dark:text-zinc-400 truncate">
                              {doc.email}
                            </p>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => openEditDocenteAsignacionModal(doc.idUsuario)}
                        className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white shrink-0 cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span>{doc.totalMaterias > 0 ? 'Editar' : 'Asignar'}</span>
                      </button>
                    </div>

                    {/* Consolidated Load Summary Strip */}
                    <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-[#121212] border border-slate-200/80 dark:border-[#27272A] text-center">
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                          Materias
                        </div>
                        <div className="text-sm font-black text-purple-700 dark:text-purple-300">
                          {doc.totalMaterias}
                        </div>
                      </div>
                      <div className="border-x border-slate-200 dark:border-[#27272A]">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                          Años
                        </div>
                        <div className="text-sm font-black text-indigo-700 dark:text-indigo-300">
                          {doc.totalAnos}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                          Secciones
                        </div>
                        <div className="text-sm font-black text-emerald-700 dark:text-emerald-300">
                          {doc.totalSecciones}
                        </div>
                      </div>
                    </div>

                    {/* Materias Badges */}
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 flex items-center space-x-1.5">
                        <BookOpen className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                        <span>Materias Impartidas</span>
                      </div>
                      {doc.asignaciones.length === 0 ? (
                        <p className="text-xs italic text-slate-400 dark:text-zinc-500">
                          Sin materias asignadas
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {doc.asignaciones.map((asig) => {
                            const isConfirming = confirmRemoveAsignacionId === asig.idAsignacion;
                            const isRemoving = removingAsignacionId === asig.idAsignacion;
                            return (
                              <div
                                key={asig.idAsignacion}
                                className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-lg bg-slate-100 dark:bg-[#121212] border border-slate-200 dark:border-[#27272A] text-xs"
                              >
                                <span className="font-bold text-slate-800 dark:text-[#F4F4F5]">
                                  {asig.nombreMateria}
                                </span>
                                <span className="text-[10px] font-semibold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 px-1.5 py-0.5 rounded">
                                  {formatNivelCorto(asig.nombreNivel)}
                                </span>
                                {isConfirming ? (
                                  <span className="inline-flex items-center space-x-1 pl-1 border-l border-slate-300 dark:border-[#27272A]">
                                    <button
                                      type="button"
                                      disabled={isRemoving}
                                      onClick={() =>
                                        handleQuickRemoveAsignacion(
                                          asig.idAsignacion,
                                          asig.nombreMateria
                                        )
                                      }
                                      className="px-1.5 py-0.5 rounded bg-rose-600 text-white text-[10px] font-bold cursor-pointer"
                                    >
                                      {isRemoving ? '...' : 'Quitar'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmRemoveAsignacionId(null)}
                                      className="p-0.5 text-slate-400 cursor-pointer"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmRemoveAsignacionId(asig.idAsignacion)}
                                    className="p-0.5 rounded text-slate-400 dark:text-zinc-500 hover:text-rose-500 cursor-pointer"
                                    aria-label={`Remover ${asig.nombreMateria}`}
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Años & Secciones Details */}
                    {(doc.anosEscolares.length > 0 || doc.secciones.length > 0) && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100 dark:border-[#27272A]">
                        <div className="space-y-1">
                          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 flex items-center space-x-1">
                            <GraduationCap className="w-3.5 h-3.5 text-indigo-500" />
                            <span>Años Escolares</span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {doc.anosEscolares.map((ano) => (
                              <span
                                key={ano.idAno}
                                className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-900/60"
                              >
                                {formatNivelCorto(ano.nombreNivel)}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-1">
                          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 flex items-center space-x-1">
                            <Layers className="w-3.5 h-3.5 text-emerald-500" />
                            <span>Secciones</span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {doc.secciones.map((sec) => (
                              <span
                                key={sec.idSeccion}
                                className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${
                                  sec.esProgramadaEnHorario
                                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900/60'
                                    : 'bg-slate-50 dark:bg-[#121212] text-slate-600 dark:text-zinc-300 border-dashed border-slate-300 dark:border-[#3F3F46]'
                                }`}
                              >
                                {formatNivelCorto(sec.nombreNivel)} &ldquo;{sec.nombreSeccion}&rdquo;
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* 4. AÑOS ESCOLARES TAB */}
      {activeTab === 'anos' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="p-4 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between">
            <span className="font-bold text-sm text-slate-800">
              Años Escolares / Niveles
            </span>
            <span className="text-xs text-slate-500 font-medium">
              Estructura formal de la institución
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider bg-slate-50/50">
                  <th className="py-3 px-4">ID</th>
                  <th className="py-3 px-4">Nombre del Año / Nivel</th>
                  <th className="py-3 px-4">Estado</th>
                  <th className="py-3 px-4 text-right w-36">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {anos.map((ano) => (
                  <tr key={ano.idAno} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 font-mono text-xs text-slate-500">#{ano.idAno}</td>
                    <td className="py-3 px-4 font-bold text-slate-900">{ano.nombreNivel}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${ano.activo ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {ano.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => openEditModal('ano', ano)}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                          title="Editar Año"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteAno(ano.idAno)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title="Eliminar Año"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modals for Create/Edit */}
      {modalType === 'ano' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 p-6 shadow-xl">
            <h3 className="font-bold text-base text-slate-900 mb-4">
              {editItem ? 'Editar Año Escolar' : 'Crear Año Escolar'}
            </h3>
            <form onSubmit={handleSaveAno} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nombre del Nivel:</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: 1er Año - Educación Media General"
                  value={anoForm.nombreNivel}
                  onChange={(e) => setAnoForm({ ...anoForm, nombreNivel: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalType(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white shadow-sm cursor-pointer"
                >
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modalType === 'seccion' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 p-6 shadow-xl">
            <h3 className="font-bold text-base text-slate-900 mb-4">
              {editItem ? 'Editar Sección' : 'Crear Sección'}
            </h3>
            <form onSubmit={handleSaveSeccion} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Año Escolar:</label>
                <select
                  value={seccionForm.idAno}
                  onChange={(e) => setSeccionForm({ ...seccionForm, idAno: Number(e.target.value) })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer"
                >
                  {anos.map((a) => (
                    <option key={a.idAno} value={a.idAno}>
                      {a.nombreNivel}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nombre de la Sección:</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: A, B, C, U"
                  value={seccionForm.nombreSeccion}
                  onChange={(e) => setSeccionForm({ ...seccionForm, nombreSeccion: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalType(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white shadow-sm cursor-pointer"
                >
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modalType === 'materia' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 p-6 shadow-xl">
            <h3 className="font-bold text-base text-slate-900 mb-4">
              {editItem ? 'Editar Materia' : 'Crear Materia'}
            </h3>
            <form onSubmit={handleSaveMateria} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Año Escolar:</label>
                <select
                  value={materiaForm.idAno}
                  onChange={(e) => setMateriaForm({ ...materiaForm, idAno: Number(e.target.value) })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer"
                >
                  {anos.map((a) => (
                    <option key={a.idAno} value={a.idAno}>
                      {a.nombreNivel}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nombre de la Materia:</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Castellano, Matemáticas, Física..."
                  value={materiaForm.nombreMateria}
                  onChange={(e) => setMateriaForm({ ...materiaForm, nombreMateria: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalType(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white shadow-sm cursor-pointer"
                >
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Multiple Subject Assignment Modal */}
      {modalType === 'asignacion' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-[#0A0A0A] rounded-3xl max-w-xl w-full border border-slate-200 dark:border-[#27272A] p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-[#27272A] mb-4">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 rounded-xl border border-purple-200/70 dark:border-purple-800/50">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900 dark:text-[#F4F4F5]">
                    Gestión de Materias por Docente
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    Asigne o actualice simultáneamente las materias del pensum oficial para el profesor
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalType(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveBatchAsignacion} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wider mb-1.5">
                  Docente:
                </label>
                <select
                  value={selectedDocenteId}
                  onChange={(e) => handleDocenteChange(Number(e.target.value))}
                  className="w-full bg-slate-50 dark:bg-[#121212] border border-slate-200 dark:border-[#27272A] rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-900 dark:text-[#F4F4F5] focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer"
                >
                  {eligibleDocentes.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.nombre} {d.apellidos} ({d.email})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wider">
                    Materias a Asignar ({selectedMateriaIds.length} seleccionadas):
                  </label>
                  <div className="flex items-center space-x-2 text-xs">
                    <button
                      type="button"
                      onClick={selectAllMaterias}
                      className="text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300 font-bold hover:underline cursor-pointer"
                    >
                      Marcar todas
                    </button>
                    <span className="text-slate-300 dark:text-zinc-600">•</span>
                    <button
                      type="button"
                      onClick={deselectAllMaterias}
                      className="text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-200 font-bold hover:underline cursor-pointer"
                    >
                      Desmarcar
                    </button>
                  </div>
                </div>

                <div className="max-h-64 overflow-y-auto space-y-3 pr-1 border border-slate-200 dark:border-[#27272A] rounded-2xl p-3 bg-slate-50/50 dark:bg-[#000000]">
                  {anos.map((ano) => {
                    const materiasDelAno = materias.filter((m) => m.idAno === ano.idAno);
                    if (materiasDelAno.length === 0) return null;

                    return (
                      <div key={ano.idAno} className="space-y-1.5">
                        <div className="text-[11px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-wider px-1 pt-1">
                          {ano.nombreNivel}
                        </div>
                        <div className="space-y-1">
                          {materiasDelAno.map((materia) => {
                            const isSelected = selectedMateriaIds.includes(materia.idMateria);
                            const alreadyAssigned = docenteMaterias.some(
                              (dm) =>
                                dm.idUsuario === selectedDocenteId &&
                                dm.idMateria === materia.idMateria
                            );

                            return (
                              <label
                                key={materia.idMateria}
                                className={`flex items-center justify-between p-2 rounded-xl border text-xs cursor-pointer transition-all ${
                                  isSelected
                                    ? 'bg-purple-50/80 dark:bg-purple-950/40 border-purple-300 dark:border-purple-700 font-bold text-purple-950 dark:text-purple-200 shadow-2xs'
                                    : 'bg-white dark:bg-[#121212] border-slate-200 dark:border-[#27272A] hover:bg-slate-100 dark:hover:bg-[#181818] text-slate-700 dark:text-zinc-300'
                                }`}
                              >
                                <div className="flex items-center space-x-2.5">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggleMateriaSelection(materia.idMateria)}
                                    className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 border-slate-300 dark:border-zinc-600 cursor-pointer"
                                  />
                                  <span>{materia.nombreMateria}</span>
                                </div>
                                {alreadyAssigned && (
                                  <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800/60">
                                    Asignada
                                  </span>
                                )}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100 dark:border-[#27272A]">
                <button
                  type="button"
                  onClick={() => setModalType(null)}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-[#181818] transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving || eligibleDocentes.length === 0}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white shadow-md shadow-purple-100 dark:shadow-none transition-all disabled:opacity-50 cursor-pointer"
                >
                  {saving ? 'Guardando asignaciones...' : `Guardar Asignaciones (${selectedMateriaIds.length})`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
