import React, { useState } from 'react';
import {
  Users,
  UserPlus,
  Search,
  ArrowUpDown,
  Phone,
  Mail,
  CheckCircle2,
  AlertCircle,
  X,
  Edit2,
  Trash2,
  Shield,
  GraduationCap,
  ChevronRight,
  UserCheck,
  Key,
  FileDown,
  Lock,
  User,
  Eye,
  EyeOff,
  Check,
} from 'lucide-react';
import type {
  AnoEscolar,
  Seccion,
  Representante,
  Estudiante,
  Usuario,
} from '../types.ts';
import {
  createEstudiante,
  updateEstudiante,
  deleteEstudiante,
  createRepresentante,
  updateRepresentante,
  updateRepresentanteCredenciales,
  deleteRepresentante,
  fetchAsistencia,
  fetchConfiguracion,
} from '../lib/api.ts';
import { generateStudentAttendancePDF } from '../lib/pdfGenerator.ts';
import { formatCedula, sortStudentsByCedula } from '../lib/utils.ts';
import { validateNoNumbersInName } from '../lib/validation.ts';

interface StudentsDirectoryProps {
  anos: AnoEscolar[];
  secciones: Seccion[];
  representantes: Representante[];
  estudiantes: Estudiante[];
  currentUser: Usuario | null;
  onRefreshData: () => void;
}

export const StudentsDirectory: React.FC<StudentsDirectoryProps> = ({
  anos,
  secciones,
  representantes,
  estudiantes,
  currentUser,
  onRefreshData,
}) => {
  // Sub-tab: Estudiantes vs Representantes
  const [directoryTab, setDirectoryTab] = useState<'estudiantes' | 'representantes'>('estudiantes');

  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterAnoId, setFilterAnoId] = useState<number>(0);
  const [filterSeccionId, setFilterSeccionId] = useState<number>(0);

  // Modals state
  const [studentModalOpen, setStudentModalOpen] = useState<boolean>(false);
  const [repModalOpen, setRepModalOpen] = useState<boolean>(false);
  const [editingStudent, setEditingStudent] = useState<Estudiante | null>(null);
  const [editingRep, setEditingRep] = useState<Representante | null>(null);

  // Form states with validation
  const [studentForm, setStudentForm] = useState({
    cedula: '',
    nombres: '',
    apellidos: '',
    idAnoActual: anos[0]?.idAno || 1,
    idSeccion: secciones[0]?.idSeccion || 1,
    idRepresentante: representantes[0]?.idRepresentante || 1,
  });

  const [repForm, setRepForm] = useState({
    usuario: '',
    cedula: '',
    nombres: '',
    apellidos: '',
    telefono: '',
    email: '',
    password: '',
    activo: true,
  });
  const [showRepPassword, setShowRepPassword] = useState<boolean>(false);

  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 2-step inline delete confirmations
  const [confirmDeleteStudentId, setConfirmDeleteStudentId] = useState<number | null>(null);
  const [deletingStudentId, setDeletingStudentId] = useState<number | null>(null);

  const [confirmDeleteRepId, setConfirmDeleteRepId] = useState<number | null>(null);
  const [deletingRepId, setDeletingRepId] = useState<number | null>(null);

  // Modal de Credenciales de Acceso para Representantes (Director y Coordinador autorizados)
  const [credModalOpen, setCredModalOpen] = useState<boolean>(false);
  const [credRep, setCredRep] = useState<Representante | null>(null);
  const [credForm, setCredForm] = useState({
    email: '',
    usuario: '',
    password: '',
    activo: true,
  });
  const [showCredPassword, setShowCredPassword] = useState<boolean>(false);
  const [savingCred, setSavingCred] = useState<boolean>(false);
  const [downloadingPdfStudentId, setDownloadingPdfStudentId] = useState<number | null>(null);

  const canEdit = currentUser?.rol === 'director' || currentUser?.rol === 'coordinador';

  const handleDownloadStudentAttendancePDF = async (st: Estudiante) => {
    setDownloadingPdfStudentId(st.idEstudiante);
    try {
      const [records, cfg] = await Promise.all([
        fetchAsistencia({ idEstudiante: st.idEstudiante }),
        fetchConfiguracion().catch(() => ({ nombreInstitucion: undefined, anoLectivo: undefined })),
      ]);
      const rep = representantes.find((r) => r.idRepresentante === st.idRepresentante) || null;
      const ano = anos.find((a) => a.idAno === st.idAnoActual);
      const sec = secciones.find((s) => s.idSeccion === st.idSeccion);

      generateStudentAttendancePDF({
        estudiante: st,
        representante: rep,
        nombreAno:
          st.estadoAcademico === 'EGRESADO'
            ? 'Egresado'
            : ano
            ? ano.nombreNivel
            : st.nombreNivel || 'Año Escolar',
        nombreSeccion: st.estadoAcademico === 'EGRESADO' ? '--' : sec ? sec.nombreSeccion : st.nombreSeccion || 'A',
        registros: records,
        config: {
          nombrePlantel: cfg.nombreInstitucion,
          anoLectivo: cfg.anoLectivo,
        },
      });
    } catch (err) {
      console.error('Error al exportar asistencia individual:', err);
    } finally {
      setDownloadingPdfStudentId(null);
    }
  };

  const openCredModal = (rep: Representante) => {
    setCredRep(rep);
    setCredForm({
      email: rep.email,
      usuario: rep.usuario || '',
      password: '',
      activo: rep.activo !== false,
    });
    setShowCredPassword(false);
    setFeedback(null);
    setCredModalOpen(true);
  };

  const handleSaveCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!credRep) return;

    if (!credForm.email.trim()) {
      setFeedback({ type: 'error', text: 'El correo electrónico es obligatorio.' });
      return;
    }
    if (credForm.usuario.trim().length > 0 && credForm.usuario.trim().length < 3) {
      setFeedback({ type: 'error', text: 'El usuario debe tener al menos 3 caracteres.' });
      return;
    }
    if (credForm.password.trim().length > 0 && credForm.password.trim().length < 6) {
      setFeedback({ type: 'error', text: 'La nueva contraseña debe tener al menos 6 caracteres.' });
      return;
    }

    setSavingCred(true);
    setFeedback(null);
    try {
      await updateRepresentanteCredenciales(credRep.idRepresentante, {
        email: credForm.email.trim(),
        usuario: credForm.usuario.trim() || null,
        activo: credForm.activo,
        ...(credForm.password.trim() ? { password: credForm.password.trim() } : {}),
      });
      setFeedback({
        type: 'success',
        text: `Credenciales locales de ${credRep.nombres} ${credRep.apellidos} actualizadas correctamente.`,
      });
      setCredModalOpen(false);
      onRefreshData();
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Error al actualizar credenciales de acceso' });
    } finally {
      setSavingCred(false);
    }
  };

  // Live validation on typing
  const handleStudentNameChange = (field: 'nombres' | 'apellidos', value: string) => {
    setStudentForm((prev) => ({ ...prev, [field]: value }));
    const check = validateNoNumbersInName(value, field === 'nombres' ? 'Nombres' : 'Apellidos');
    setValidationErrors((prev) => ({
      ...prev,
      [field]: check.valid ? '' : check.error || '',
    }));
  };

  const handleRepNameChange = (field: 'nombres' | 'apellidos', value: string) => {
    setRepForm((prev) => ({ ...prev, [field]: value }));
    const check = validateNoNumbersInName(value, field === 'nombres' ? 'Nombres' : 'Apellidos');
    setValidationErrors((prev) => ({
      ...prev,
      [`rep_${field}`]: check.valid ? '' : check.error || '',
    }));
  };

  const openStudentModal = (student?: Estudiante) => {
    setValidationErrors({});
    setFeedback(null);
    if (student) {
      setEditingStudent(student);
      setStudentForm({
        cedula: student.cedula,
        nombres: student.nombres,
        apellidos: student.apellidos,
        idAnoActual: student.idAnoActual ?? (anos[0]?.idAno || 1),
        idSeccion: student.idSeccion || secciones[0]?.idSeccion || 1,
        idRepresentante: student.idRepresentante,
      });
    } else {
      setEditingStudent(null);
      setStudentForm({
        cedula: '',
        nombres: '',
        apellidos: '',
        idAnoActual: anos[0]?.idAno || 1,
        idSeccion: secciones.find((s) => s.idAno === (anos[0]?.idAno || 1))?.idSeccion || 1,
        idRepresentante: representantes[0]?.idRepresentante || 1,
      });
    }
    setStudentModalOpen(true);
  };

  const openRepModal = (rep?: Representante) => {
    setValidationErrors({});
    setFeedback(null);
    setShowRepPassword(false);
    if (rep) {
      setEditingRep(rep);
      setRepForm({
        usuario: rep.usuario || '',
        cedula: rep.cedula,
        nombres: rep.nombres,
        apellidos: rep.apellidos,
        telefono: rep.telefono || '',
        email: rep.email,
        password: '',
        activo: rep.activo !== false,
      });
    } else {
      setEditingRep(null);
      setRepForm({
        usuario: '',
        cedula: '',
        nombres: '',
        apellidos: '',
        telefono: '',
        email: '',
        password: '',
        activo: true,
      });
    }
    setRepModalOpen(true);
  };

  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();

    const nCheck = validateNoNumbersInName(studentForm.nombres, 'Nombres');
    const aCheck = validateNoNumbersInName(studentForm.apellidos, 'Apellidos');
    if (!nCheck.valid || !aCheck.valid) {
      setValidationErrors({
        nombres: nCheck.error || '',
        apellidos: aCheck.error || '',
      });
      return;
    }

    setSaving(true);
    setFeedback(null);
    try {
      if (editingStudent) {
        await updateEstudiante(editingStudent.idEstudiante, studentForm);
        setFeedback({ type: 'success', text: 'Datos del estudiante actualizados correctamente' });
      } else {
        await createEstudiante(studentForm);
        setFeedback({ type: 'success', text: 'Estudiante inscrito exitosamente' });
      }
      setStudentModalOpen(false);
      onRefreshData();
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Error al guardar estudiante' });
    } finally {
      setSaving(false);
    }
  };

  const executeDeleteStudent = async (student: Estudiante) => {
    setDeletingStudentId(student.idEstudiante);
    try {
      await deleteEstudiante(student.idEstudiante);
      setConfirmDeleteStudentId(null);
      setFeedback({
        type: 'success',
        text: `Estudiante ${student.nombres} ${student.apellidos} eliminado exitosamente.`,
      });
      onRefreshData();
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Error al eliminar estudiante' });
    } finally {
      setDeletingStudentId(null);
    }
  };

  const handleSaveRep = async (e: React.FormEvent) => {
    e.preventDefault();

    const nCheck = validateNoNumbersInName(repForm.nombres, 'Nombres');
    const aCheck = validateNoNumbersInName(repForm.apellidos, 'Apellidos');
    const usuarioTrim = repForm.usuario.trim();
    const usuarioErr =
      usuarioTrim.length > 0 && usuarioTrim.length < 3
        ? 'El usuario debe tener al menos 3 caracteres.'
        : '';
    const passwordErr =
      !editingRep && repForm.password.trim().length > 0 && repForm.password.trim().length < 6
        ? 'La contraseña debe tener al menos 6 caracteres.'
        : editingRep && repForm.password.trim().length > 0 && repForm.password.trim().length < 6
        ? 'La nueva contraseña debe tener al menos 6 caracteres.'
        : '';

    if (!nCheck.valid || !aCheck.valid || usuarioErr || passwordErr) {
      setValidationErrors({
        rep_nombres: nCheck.error || '',
        rep_apellidos: aCheck.error || '',
        rep_usuario: usuarioErr,
        rep_password: passwordErr,
      });
      return;
    }

    setSaving(true);
    setFeedback(null);
    try {
      if (editingRep) {
        await updateRepresentante(editingRep.idRepresentante, {
          usuario: usuarioTrim || null,
          cedula: repForm.cedula.trim(),
          nombres: repForm.nombres.trim(),
          apellidos: repForm.apellidos.trim(),
          telefono: repForm.telefono.trim() || null,
          email: repForm.email.trim(),
          activo: repForm.activo,
          ...(repForm.password.trim() ? { password: repForm.password.trim() } : {}),
        });
        setFeedback({ type: 'success', text: 'Datos del representante actualizados' });
      } else {
        await createRepresentante({
          usuario: usuarioTrim || undefined,
          cedula: repForm.cedula.trim(),
          nombres: repForm.nombres.trim(),
          apellidos: repForm.apellidos.trim(),
          telefono: repForm.telefono.trim() || undefined,
          email: repForm.email.trim(),
          activo: repForm.activo,
          ...(repForm.password.trim() ? { password: repForm.password.trim() } : {}),
        });
        setFeedback({ type: 'success', text: 'Representante registrado exitosamente' });
      }
      setRepModalOpen(false);
      onRefreshData();
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Error al guardar representante' });
    } finally {
      setSaving(false);
    }
  };

  const executeDeleteRep = async (rep: Representante) => {
    const linked = estudiantes.filter((e) => e.idRepresentante === rep.idRepresentante);
    if (linked.length > 0) {
      setFeedback({
        type: 'error',
        text: `No se puede eliminar a ${rep.nombres} ${rep.apellidos}: tiene ${linked.length} estudiante(s) vinculado(s). Reasigne o desvincule los alumnos primero.`,
      });
      setConfirmDeleteRepId(null);
      return;
    }

    setDeletingRepId(rep.idRepresentante);
    try {
      await deleteRepresentante(rep.idRepresentante);
      setConfirmDeleteRepId(null);
      setFeedback({
        type: 'success',
        text: `Representante ${rep.nombres} ${rep.apellidos} eliminado exitosamente.`,
      });
      onRefreshData();
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Error al eliminar representante' });
    } finally {
      setDeletingRepId(null);
    }
  };

  // Filter sections by selected year for modal dropdown
  const modalAvailableSections = secciones.filter((s) => s.idAno === studentForm.idAnoActual);

  // STRICT NUMERIC SORTING BY CÉDULA
  const sortedStudents = sortStudentsByCedula(estudiantes);

  const filteredStudents = sortedStudents.filter((st) => {
    const matchesAno =
      filterAnoId === 0
        ? true
        : filterAnoId === -1
        ? st.estadoAcademico === 'EGRESADO'
        : st.estadoAcademico !== 'EGRESADO' && st.idAnoActual === filterAnoId;
    const matchesSec = filterSeccionId === 0 || st.idSeccion === filterSeccionId;
    const term = searchTerm.toLowerCase();
    const fullName = `${st.nombres} ${st.apellidos}`.toLowerCase();
    const repName = `${st.representanteNombres || ''} ${st.representanteApellidos || ''}`.toLowerCase();
    const matchesSearch =
      fullName.includes(term) ||
      st.cedula.toLowerCase().includes(term) ||
      repName.includes(term);

    return matchesAno && matchesSec && matchesSearch;
  });

  const filteredRepresentantes = representantes.filter((rep) => {
    const term = searchTerm.toLowerCase();
    const fullName = `${rep.nombres} ${rep.apellidos}`.toLowerCase();
    const cedula = rep.cedula.toLowerCase();
    const email = (rep.email || '').toLowerCase();
    const telefono = (rep.telefono || '').toLowerCase();
    return fullName.includes(term) || cedula.includes(term) || email.includes(term) || telefono.includes(term);
  });

  return (
    <div className="space-y-6">
      {/* Top Banner with Action Buttons and Sub-tab Switcher */}
      <div className="bg-white dark:bg-[#121212] p-5 rounded-2xl border border-slate-200 dark:border-[#27272A] shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-xl">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-[#F4F4F5]">
                Nómina Escolar & Directorio
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Gestión de alumnos, asignación a secciones y vinculación de representantes
              </p>
            </div>
          </div>

          {/* Sub-tab Switcher & Actions */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Segmented Control */}
            <div className="p-1 bg-slate-100 dark:bg-[#181818] rounded-xl border border-slate-200 dark:border-[#27272A] flex items-center space-x-1">
              <button
                type="button"
                onClick={() => setDirectoryTab('estudiantes')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer ${
                  directoryTab === 'estudiantes'
                    ? 'bg-white dark:bg-[#27272A] text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-[#F4F4F5]'
                }`}
              >
                <GraduationCap className="w-3.5 h-3.5" />
                <span>Estudiantes ({filteredStudents.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setDirectoryTab('representantes')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer ${
                  directoryTab === 'representantes'
                    ? 'bg-white dark:bg-[#27272A] text-emerald-600 dark:text-emerald-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-[#F4F4F5]'
                }`}
              >
                <Shield className="w-3.5 h-3.5" />
                <span>Representantes ({filteredRepresentantes.length})</span>
              </button>
            </div>

            {canEdit && (
              <div className="flex flex-wrap items-center gap-2">
                {directoryTab === 'estudiantes' ? (
                  <button
                    onClick={() => openStudentModal()}
                    className="px-3.5 py-2 min-h-[44px] rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 flex items-center space-x-1.5 shadow-sm shadow-indigo-100 dark:shadow-none cursor-pointer"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Inscribir Estudiante</span>
                  </button>
                ) : (
                  <button
                    onClick={() => openRepModal()}
                    className="px-3.5 py-2 min-h-[44px] rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 flex items-center space-x-1.5 shadow-sm shadow-emerald-100 dark:shadow-none cursor-pointer"
                  >
                    <Shield className="w-4 h-4" />
                    <span>Registrar Representante</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-slate-100 dark:border-[#27272A]">
          <div className={`${directoryTab === 'estudiantes' ? 'sm:col-span-2' : 'sm:col-span-4'} relative`}>
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder={
                directoryTab === 'estudiantes'
                  ? 'Buscar por cédula, nombre o representante...'
                  : 'Buscar por cédula, nombre, teléfono o correo...'
              }
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-[#F4F4F5] rounded-xl pl-9 pr-3 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {directoryTab === 'estudiantes' && (
            <>
              <div>
                <select
                  value={filterAnoId}
                  onChange={(e) => {
                    setFilterAnoId(Number(e.target.value));
                    setFilterSeccionId(0);
                  }}
                  className="w-full bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] text-slate-800 dark:text-[#F4F4F5] rounded-xl px-3 py-2.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value={0}>Todos los Años</option>
                  {anos.map((ano) => (
                    <option key={ano.idAno} value={ano.idAno}>
                      {ano.nombreNivel}
                    </option>
                  ))}
                  <option value={-1}>Egresados</option>
                </select>
              </div>

              <div>
                <select
                  value={filterSeccionId}
                  onChange={(e) => setFilterSeccionId(Number(e.target.value))}
                  className="w-full bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] text-slate-800 dark:text-[#F4F4F5] rounded-xl px-3 py-2.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value={0}>Todas las Secciones</option>
                  {secciones
                    .filter((s) => filterAnoId === 0 || s.idAno === filterAnoId)
                    .map((sec) => (
                      <option key={sec.idSeccion} value={sec.idSeccion}>
                        Sección {sec.nombreSeccion} ({sec.nombreNivel})
                      </option>
                    ))}
                </select>
              </div>
            </>
          )}
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-xl text-xs font-semibold flex items-center justify-between ${
            feedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/60'
              : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60'
          }`}
        >
          <div className="flex items-center space-x-2">
            {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{feedback.text}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ============================================================== */}
      {/* SUB-TAB 1: ESTUDIANTES */}
      {/* ============================================================== */}
      {directoryTab === 'estudiantes' && (
        <>
          {/* Header Info */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <div className="flex items-center space-x-2">
              <span className="font-bold text-sm text-slate-800 dark:text-[#F4F4F5]">
                Matrícula de Estudiantes ({filteredStudents.length})
              </span>
              <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-900/60">
                <ArrowUpDown className="w-3 h-3 mr-1" />
                Orden numérico por Cédula
              </span>
            </div>
          </div>

          {/* MOBILE & TABLET VIEW (< lg): Responsive Tactile Cards (NO HORIZONTAL OVERFLOW) */}
          <div className="block lg:hidden space-y-3">
            {filteredStudents.length === 0 ? (
              <div className="p-8 text-center bg-white dark:bg-[#121212] rounded-2xl border border-slate-200 dark:border-[#27272A]">
                <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs text-slate-500 dark:text-slate-400">No se encontraron estudiantes con los filtros seleccionados.</p>
              </div>
            ) : (
              filteredStudents.map((st, idx) => (
                <div
                  key={st.idEstudiante}
                  className="bg-white dark:bg-[#121212] rounded-2xl border border-slate-200 dark:border-[#27272A] p-4 shadow-xs space-y-3"
                >
                  {/* Top: Avatar + Name + Cedula */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-100 dark:border-indigo-900/60 flex items-center justify-center font-bold text-xs text-indigo-600 dark:text-indigo-400 shrink-0">
                        {st.nombres[0]}
                        {st.apellidos[0]}
                      </div>
                      <div>
                        <div className="font-bold text-sm text-slate-900 dark:text-[#F4F4F5] leading-snug">
                          {st.apellidos}, {st.nombres}
                        </div>
                        <div className="font-mono text-xs font-semibold text-slate-500 dark:text-slate-400 mt-0.5">
                          {formatCedula(st.cedula)}
                        </div>
                      </div>
                    </div>
                    <span className="font-mono text-xs font-bold text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-[#181818] px-2 py-0.5 rounded-md border border-slate-200 dark:border-[#27272A]">
                      #{idx + 1}
                    </span>
                  </div>

                  {/* Nivel & Sección Badges */}
                  <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100 dark:border-[#27272A]/70 text-xs">
                    {st.estadoAcademico === 'EGRESADO' ? (
                      <span className="px-2.5 py-1 rounded-lg font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                        Egresado
                      </span>
                    ) : (
                      <>
                        <span className="px-2.5 py-1 rounded-lg font-semibold bg-slate-100 dark:bg-[#181818] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#27272A]">
                          {st.nombreNivel}
                        </span>
                        <span className="px-2.5 py-1 rounded-lg font-mono font-bold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-900/60">
                          {st.nombreSeccion ? `Sección ${st.nombreSeccion}` : 'Sin Sección'}
                        </span>
                      </>
                    )}
                  </div>

                  {/* Legal Guardian Info */}
                  <div className="p-2.5 bg-slate-50 dark:bg-[#181818] rounded-xl border border-slate-100 dark:border-[#27272A] flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-2">
                      <Shield className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <div>
                        <div className="font-medium text-slate-800 dark:text-slate-200 text-xs">
                          {st.representanteNombres} {st.representanteApellidos}
                        </div>
                        <div className="font-mono text-[11px] text-slate-400 dark:text-slate-500">
                          {formatCedula(st.representanteCedula || '')}
                        </div>
                      </div>
                    </div>
                    {st.representanteTelefono && (
                      <a
                        href={`tel:${st.representanteTelefono}`}
                        className="p-2 rounded-lg bg-emerald-100/60 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200/60 transition-colors"
                        title="Llamar al representante"
                      >
                        <Phone className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>

                  {/* Action Buttons for Mobile & Tablet */}
                  <div className="pt-2 border-t border-slate-100 dark:border-[#27272A] flex items-center gap-2">
                    {canEdit && confirmDeleteStudentId === st.idEstudiante ? (
                      <div className="w-full flex items-center justify-between p-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 gap-2">
                        <span className="text-xs font-bold text-rose-700 dark:text-rose-400">¿Eliminar alumno?</span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => executeDeleteStudent(st)}
                            disabled={deletingStudentId === st.idEstudiante}
                            className="px-3 py-2 min-h-[44px] rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white cursor-pointer shadow-xs disabled:opacity-50"
                          >
                            {deletingStudentId === st.idEstudiante ? 'Borrando...' : 'Sí, borrar'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteStudentId(null)}
                            className="px-3 py-2 min-h-[44px] rounded-lg text-xs font-bold bg-slate-200 hover:bg-slate-300 dark:bg-[#27272A] dark:hover:bg-[#333338] text-slate-700 dark:text-slate-300 cursor-pointer"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className={`w-full grid gap-2 ${canEdit ? 'grid-cols-3' : 'grid-cols-1'}`}>
                        <button
                          type="button"
                          onClick={() => handleDownloadStudentAttendancePDF(st)}
                          disabled={downloadingPdfStudentId === st.idEstudiante}
                          className="flex items-center justify-center space-x-1.5 py-2.5 min-h-[44px] rounded-xl text-xs font-bold bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 transition-colors cursor-pointer disabled:opacity-50"
                          title="Exportar Reporte de Asistencia en PDF"
                        >
                          <FileDown className="w-3.5 h-3.5 shrink-0" />
                          <span>{downloadingPdfStudentId === st.idEstudiante ? 'Generando...' : 'Descargar PDF'}</span>
                        </button>
                        {canEdit && (
                          <>
                            <button
                              type="button"
                              onClick={() => openStudentModal(st)}
                              className="flex items-center justify-center space-x-1 py-2.5 min-h-[44px] rounded-xl text-xs font-bold bg-slate-100 dark:bg-[#181818] hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 border border-slate-200 dark:border-[#27272A] transition-colors cursor-pointer"
                            >
                              <Edit2 className="w-3.5 h-3.5 shrink-0" />
                              <span>Editar</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteStudentId(st.idEstudiante)}
                              className="flex items-center justify-center space-x-1 py-2.5 min-h-[44px] rounded-xl text-xs font-bold bg-slate-100 dark:bg-[#181818] hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-700 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 border border-slate-200 dark:border-[#27272A] transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5 shrink-0" />
                              <span>Eliminar</span>
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* DESKTOP VIEW (>= lg): Full Structured Table with Sticky Header & Sticky Student Column */}
          <div className="hidden lg:block bg-white dark:bg-[#121212] rounded-2xl border border-slate-200 dark:border-[#27272A] shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-[#27272A] text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider bg-slate-50/70 dark:bg-[#181818]">
                    <th className="py-3 px-4 w-12 text-center">#</th>
                    <th className="sticky left-0 z-20 bg-slate-50 dark:bg-[#181818] py-3 px-4 min-w-[220px] border-r border-slate-200 dark:border-[#27272A] shadow-[4px_0_6px_-2px_rgba(0,0,0,0.06)] dark:shadow-[4px_0_6px_-2px_rgba(0,0,0,0.5)]">
                      Estudiante / Cédula
                    </th>
                    <th className="py-3 px-4">Año / Nivel</th>
                    <th className="py-3 px-4 text-center">Sección</th>
                    <th className="py-3 px-4">Representante Legal</th>
                    <th className="py-3 px-4 text-right min-w-[140px]">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#27272A]">
                  {filteredStudents.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400 text-xs">
                        No se encontraron estudiantes con los filtros aplicados.
                      </td>
                    </tr>
                  ) : (
                    filteredStudents.map((st, index) => (
                      <tr key={st.idEstudiante} className="hover:bg-slate-50/70 dark:hover:bg-[#181818]/70 transition-colors">
                        <td className="py-3 px-4 text-center font-mono text-xs text-slate-400 dark:text-slate-500 font-bold">
                          {index + 1}
                        </td>
                        <td className="sticky left-0 z-10 bg-white dark:bg-[#121212] py-3 px-4 min-w-[220px] border-r border-slate-100 dark:border-[#27272A] shadow-[4px_0_6px_-2px_rgba(0,0,0,0.06)] dark:shadow-[4px_0_6px_-2px_rgba(0,0,0,0.5)]">
                          <div className="font-bold text-slate-900 dark:text-[#F4F4F5]">
                            {st.apellidos}, {st.nombres}
                          </div>
                          <div className="font-mono text-xs font-bold text-slate-500 dark:text-slate-400 mt-0.5">
                            {formatCedula(st.cedula)}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-xs font-semibold text-slate-700 dark:text-slate-300">
                          {st.estadoAcademico === 'EGRESADO' ? (
                            <span className="inline-block px-2.5 py-0.5 rounded-md font-bold text-xs bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                              Egresado
                            </span>
                          ) : (
                            st.nombreNivel
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="inline-block px-2.5 py-0.5 rounded-md font-mono font-bold text-xs bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-900/60">
                            {st.estadoAcademico === 'EGRESADO'
                              ? '--'
                              : st.nombreSeccion
                              ? `Sec. ${st.nombreSeccion}`
                              : 'Sin Sección'}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-800 dark:text-slate-200 text-xs">
                            {st.representanteNombres} {st.representanteApellidos}
                          </div>
                          <div className="font-mono text-[11px] text-slate-400 dark:text-slate-500">
                            {formatCedula(st.representanteCedula || '')}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right">
                          {canEdit && confirmDeleteStudentId === st.idEstudiante ? (
                            <div className="inline-flex items-center gap-1.5 p-1 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 animate-in fade-in duration-150">
                              <span className="text-[10px] font-bold text-rose-700 dark:text-rose-400">¿Eliminar?</span>
                              <button
                                type="button"
                                onClick={() => executeDeleteStudent(st)}
                                disabled={deletingStudentId === st.idEstudiante}
                                className="px-2 py-1 rounded-lg text-[10px] font-bold bg-rose-600 hover:bg-rose-700 text-white cursor-pointer shadow-xs disabled:opacity-50"
                              >
                                {deletingStudentId === st.idEstudiante ? '...' : 'Sí, borrar'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteStudentId(null)}
                                className="px-2 py-1 rounded-lg text-[10px] font-bold bg-slate-200 hover:bg-slate-300 dark:bg-[#27272A] dark:hover:bg-[#333338] text-slate-700 dark:text-slate-300 cursor-pointer"
                              >
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end space-x-1">
                              <button
                                type="button"
                                onClick={() => handleDownloadStudentAttendancePDF(st)}
                                disabled={downloadingPdfStudentId === st.idEstudiante}
                                className="p-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                                title="Exportar Reporte de Asistencia en PDF"
                              >
                                <FileDown className="w-3.5 h-3.5" />
                              </button>
                              {canEdit && (
                                <>
                                  <button
                                    onClick={() => openStudentModal(st)}
                                    className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-indigo-400 dark:hover:bg-[#181818] rounded-lg transition-colors cursor-pointer"
                                    title="Editar Estudiante"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => setConfirmDeleteStudentId(st.idEstudiante)}
                                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
                                    title="Eliminar Estudiante"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ============================================================== */}
      {/* SUB-TAB 2: REPRESENTANTES */}
      {/* ============================================================== */}
      {directoryTab === 'representantes' && (
        <>
          {/* Header Info */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <div className="flex items-center space-x-2">
              <span className="font-bold text-sm text-slate-800 dark:text-[#F4F4F5]">
                Directorio de Representantes Legales ({filteredRepresentantes.length})
              </span>
              <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/60">
                <UserCheck className="w-3 h-3 mr-1" />
                Acceso al Portal del Representante
              </span>
            </div>
          </div>

          {/* MOBILE VIEW (< md): Tactile Representative Profile Cards */}
          <div className="block md:hidden space-y-3">
            {filteredRepresentantes.length === 0 ? (
              <div className="p-8 text-center bg-white dark:bg-[#121212] rounded-2xl border border-slate-200 dark:border-[#27272A]">
                <Shield className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs text-slate-500 dark:text-slate-400">No se encontraron representantes con el término de búsqueda.</p>
              </div>
            ) : (
              filteredRepresentantes.map((rep) => {
                const linkedStudents = estudiantes.filter((e) => e.idRepresentante === rep.idRepresentante);
                return (
                  <div
                    key={rep.idRepresentante}
                    className="bg-white dark:bg-[#121212] rounded-2xl border border-slate-200 dark:border-[#27272A] p-4 shadow-xs space-y-3"
                  >
                    {/* Top: Avatar + Name + Cedula */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-100 dark:border-emerald-900/60 flex items-center justify-center font-bold text-xs text-emerald-600 dark:text-emerald-400 shrink-0">
                          {rep.nombres[0]}
                          {rep.apellidos[0]}
                        </div>
                        <div>
                          <div className="font-bold text-sm text-slate-900 dark:text-[#F4F4F5] leading-snug">
                            {rep.apellidos}, {rep.nombres}
                          </div>
                          <div className="font-mono text-xs font-semibold text-slate-500 dark:text-slate-400 mt-0.5">
                            {formatCedula(rep.cedula)}
                          </div>
                        </div>
                      </div>
                      <span className="font-mono text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-900/60">
                        {linkedStudents.length} {linkedStudents.length === 1 ? 'Alumno' : 'Alumnos'}
                      </span>
                    </div>

                    {/* Contact details with quick action links */}
                    <div className="grid grid-cols-1 gap-2 pt-2 border-t border-slate-100 dark:border-[#27272A]/70 text-xs">
                      {rep.telefono && (
                        <a
                          href={`tel:${rep.telefono}`}
                          className="flex items-center space-x-2 p-2 rounded-xl bg-slate-50 dark:bg-[#181818] border border-slate-100 dark:border-[#27272A] text-slate-700 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400"
                        >
                          <Phone className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <span className="font-mono">{rep.telefono}</span>
                        </a>
                      )}
                      {rep.email && (
                        <a
                          href={`mailto:${rep.email}`}
                          className="flex items-center space-x-2 p-2 rounded-xl bg-slate-50 dark:bg-[#181818] border border-slate-100 dark:border-[#27272A] text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 truncate"
                        >
                          <Mail className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                          <span className="truncate">{rep.email}</span>
                        </a>
                      )}
                    </div>

                    {/* Linked Students List */}
                    <div className="p-3 bg-slate-50 dark:bg-[#181818] rounded-xl border border-slate-100 dark:border-[#27272A]">
                      <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                        <GraduationCap className="w-3.5 h-3.5 text-indigo-500" />
                        <span>Alumnos vinculados ({linkedStudents.length}):</span>
                      </div>
                      {linkedStudents.length === 0 ? (
                        <p className="text-xs text-slate-400 italic">Sin estudiantes vinculados actualmente</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {linkedStudents.map((child) => (
                            <span
                              key={child.idEstudiante}
                              className="inline-flex items-center px-2 py-1 rounded-lg text-xs font-semibold bg-white dark:bg-[#121212] text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-[#27272A]"
                            >
                              {child.nombres} {child.apellidos} ({child.nombreNivel}{child.nombreSeccion ? ` - Sec ${child.nombreSeccion}` : ''})
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Action buttons for Mobile */}
                    {canEdit && (
                      <div className="pt-2 border-t border-slate-100 dark:border-[#27272A]">
                        {confirmDeleteRepId === rep.idRepresentante ? (
                          <div className="w-full flex items-center justify-between p-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 gap-2">
                            <span className="text-xs font-bold text-rose-700 dark:text-rose-400">¿Eliminar representante?</span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => executeDeleteRep(rep)}
                                disabled={deletingRepId === rep.idRepresentante}
                                className="px-3 py-2 min-h-[44px] rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white cursor-pointer shadow-xs disabled:opacity-50"
                              >
                                {deletingRepId === rep.idRepresentante ? 'Borrando...' : 'Sí, borrar'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteRepId(null)}
                                className="px-3 py-2 min-h-[44px] rounded-lg text-xs font-bold bg-slate-200 hover:bg-slate-300 dark:bg-[#27272A] dark:hover:bg-[#333338] text-slate-700 dark:text-slate-300 cursor-pointer"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="grid grid-cols-3 gap-1.5">
                            <button
                              type="button"
                              onClick={() => openCredModal(rep)}
                              className="flex items-center justify-center space-x-1 py-2.5 min-h-[44px] rounded-xl text-xs font-bold bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/50 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-900/60 transition-colors cursor-pointer"
                              title="Modificar Credenciales de Acceso (Usuario y Contraseña)"
                            >
                              <Key className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">Claves</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => openRepModal(rep)}
                              className="flex items-center justify-center space-x-1 py-2.5 min-h-[44px] rounded-xl text-xs font-bold bg-slate-100 dark:bg-[#181818] hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-slate-700 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 border border-slate-200 dark:border-[#27272A] transition-colors cursor-pointer"
                            >
                              <Edit2 className="w-3.5 h-3.5 shrink-0" />
                              <span>Editar</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (linkedStudents.length > 0) {
                                  setFeedback({
                                    type: 'error',
                                    text: `No se puede eliminar: tiene ${linkedStudents.length} alumno(s) vinculado(s). Reasígnelos primero.`,
                                  });
                                } else {
                                  setConfirmDeleteRepId(rep.idRepresentante);
                                }
                              }}
                              className={`flex items-center justify-center space-x-1 py-2.5 min-h-[44px] rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                                linkedStudents.length > 0
                                  ? 'bg-slate-50 dark:bg-[#181818] text-slate-400 dark:text-slate-600 border-slate-200 dark:border-[#27272A] opacity-60'
                                  : 'bg-slate-100 dark:bg-[#181818] hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-700 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 border-slate-200 dark:border-[#27272A]'
                              }`}
                              title={
                                linkedStudents.length > 0
                                  ? 'No puede eliminarse mientras tenga alumnos asignados'
                                  : 'Eliminar representante'
                              }
                            >
                              <Trash2 className="w-3.5 h-3.5 shrink-0" />
                              <span>Borrar</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* DESKTOP VIEW (>= md): Full Structured Table for Representantes */}
          <div className="hidden md:block bg-white dark:bg-[#121212] rounded-2xl border border-slate-200 dark:border-[#27272A] shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-[#27272A] text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider bg-slate-50/70 dark:bg-[#181818]">
                    <th className="py-3 px-4 w-12 text-center">#</th>
                    <th className="sticky left-0 z-20 bg-slate-50 dark:bg-[#181818] py-3 px-4 min-w-[220px] border-r border-slate-200 dark:border-[#27272A] shadow-[4px_0_6px_-2px_rgba(0,0,0,0.06)] dark:shadow-[4px_0_6px_-2px_rgba(0,0,0,0.5)]">
                      Representante / Cédula
                    </th>
                    <th className="py-3 px-4">Teléfono</th>
                    <th className="py-3 px-4">Correo Electrónico</th>
                    <th className="py-3 px-4">Alumnos a su Cargo</th>
                    {canEdit && <th className="py-3 px-4 text-right min-w-[140px]">Acciones</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#27272A]">
                  {filteredRepresentantes.length === 0 ? (
                    <tr>
                      <td colSpan={canEdit ? 6 : 5} className="py-8 text-center text-slate-400 text-xs">
                        No se encontraron representantes registrados.
                      </td>
                    </tr>
                  ) : (
                    filteredRepresentantes.map((rep, index) => {
                      const linkedStudents = estudiantes.filter((e) => e.idRepresentante === rep.idRepresentante);
                      return (
                        <tr key={rep.idRepresentante} className="hover:bg-slate-50/70 dark:hover:bg-[#181818]/70 transition-colors">
                          <td className="py-3 px-4 text-center font-mono text-xs text-slate-400 dark:text-slate-500 font-bold">
                            {index + 1}
                          </td>
                          <td className="sticky left-0 z-10 bg-white dark:bg-[#121212] py-3 px-4 min-w-[220px] border-r border-slate-100 dark:border-[#27272A] shadow-[4px_0_6px_-2px_rgba(0,0,0,0.06)] dark:shadow-[4px_0_6px_-2px_rgba(0,0,0,0.5)]">
                            <div className="font-bold text-slate-900 dark:text-[#F4F4F5] flex items-center flex-wrap gap-1.5">
                              <span>
                                {rep.apellidos}, {rep.nombres}
                              </span>
                              {rep.activo === false && (
                                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                                  Inactivo
                                </span>
                              )}
                            </div>
                            <div className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400 mt-0.5 flex items-center flex-wrap gap-x-2">
                              <span>{formatCedula(rep.cedula)}</span>
                              {rep.usuario && (
                                <span className="text-[11px] text-indigo-600 dark:text-indigo-400">
                                  @{rep.usuario}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-xs font-mono text-slate-700 dark:text-slate-300">
                            {rep.telefono ? (
                              <a href={`tel:${rep.telefono}`} className="hover:text-emerald-600 underline">
                                {rep.telefono}
                              </a>
                            ) : (
                              <span className="text-slate-400 italic">No registrado</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-700 dark:text-slate-300">
                            <a href={`mailto:${rep.email}`} className="hover:text-indigo-600 underline">
                              {rep.email}
                            </a>
                          </td>
                          <td className="py-3 px-4">
                            {linkedStudents.length === 0 ? (
                              <span className="text-xs text-slate-400 italic">0 alumnos</span>
                            ) : (
                              <div className="flex flex-wrap gap-1 max-w-xs">
                                {linkedStudents.map((child) => (
                                  <span
                                    key={child.idEstudiante}
                                    className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-900/60"
                                  >
                                    {child.nombres} ({child.nombreNivel})
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          {canEdit && (
                            <td className="py-3 px-4 text-right">
                              {confirmDeleteRepId === rep.idRepresentante ? (
                                <div className="inline-flex items-center gap-1.5 p-1 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 animate-in fade-in duration-150">
                                  <span className="text-[10px] font-bold text-rose-700 dark:text-rose-400">¿Eliminar?</span>
                                  <button
                                    type="button"
                                    onClick={() => executeDeleteRep(rep)}
                                    disabled={deletingRepId === rep.idRepresentante}
                                    className="px-2 py-1 rounded-lg text-[10px] font-bold bg-rose-600 hover:bg-rose-700 text-white cursor-pointer shadow-xs disabled:opacity-50"
                                  >
                                    {deletingRepId === rep.idRepresentante ? '...' : 'Sí, borrar'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteRepId(null)}
                                    className="px-2 py-1 rounded-lg text-[10px] font-bold bg-slate-200 hover:bg-slate-300 dark:bg-[#27272A] dark:hover:bg-[#333338] text-slate-700 dark:text-slate-300 cursor-pointer"
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-end space-x-1">
                                  <button
                                    onClick={() => openCredModal(rep)}
                                    className="p-1.5 text-slate-600 hover:text-amber-600 hover:bg-amber-50 dark:text-slate-400 dark:hover:text-amber-400 dark:hover:bg-amber-950/40 rounded-lg transition-colors cursor-pointer"
                                    title="Modificar Credenciales de Acceso (Usuario y Contraseña)"
                                  >
                                    <Key className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => openRepModal(rep)}
                                    className="p-1.5 text-slate-600 hover:text-emerald-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-emerald-400 dark:hover:bg-[#181818] rounded-lg transition-colors cursor-pointer"
                                    title="Editar Representante"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      if (linkedStudents.length > 0) {
                                        setFeedback({
                                          type: 'error',
                                          text: `No se puede eliminar: tiene ${linkedStudents.length} alumno(s) vinculado(s).`,
                                        });
                                      } else {
                                        setConfirmDeleteRepId(rep.idRepresentante);
                                      }
                                    }}
                                    className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                      linkedStudents.length > 0
                                        ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
                                        : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40'
                                    }`}
                                    title={
                                      linkedStudents.length > 0
                                        ? 'No se puede eliminar con alumnos asignados'
                                        : 'Eliminar Representante'
                                    }
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Modal: Inscribir / Editar Estudiante */}
      {studentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-[#121212] rounded-3xl max-w-md w-full shadow-2xl border border-slate-200 dark:border-[#27272A] overflow-hidden">
            <div className="p-4 bg-slate-50 dark:bg-[#181818] border-b border-slate-200 dark:border-[#27272A] flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <UserPlus className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                <h3 className="font-bold text-base text-slate-900 dark:text-[#F4F4F5]">
                  {editingStudent ? 'Editar Estudiante' : 'Inscribir Estudiante'}
                </h3>
              </div>
              <button onClick={() => setStudentModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveStudent} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Cédula</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: V-32104550"
                  value={studentForm.cedula}
                  onChange={(e) => setStudentForm({ ...studentForm, cedula: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-[#F4F4F5] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Nombres con validación sin números */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nombres (Estrictamente sin números)
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Sofía Valentina"
                  value={studentForm.nombres}
                  onChange={(e) => handleStudentNameChange('nombres', e.target.value)}
                  className={`w-full bg-slate-50 dark:bg-[#181818] border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                    validationErrors.nombres
                      ? 'border-rose-400 bg-rose-50 text-rose-900 dark:bg-rose-950/40 dark:text-rose-200 focus:ring-rose-400'
                      : 'border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-[#F4F4F5] focus:ring-indigo-500'
                  }`}
                />
                {validationErrors.nombres && (
                  <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-1 font-semibold flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{validationErrors.nombres}</span>
                  </p>
                )}
              </div>

              {/* Apellidos con validación sin números */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Apellidos (Estrictamente sin números)
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Mendoza Silva"
                  value={studentForm.apellidos}
                  onChange={(e) => handleStudentNameChange('apellidos', e.target.value)}
                  className={`w-full bg-slate-50 dark:bg-[#181818] border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                    validationErrors.apellidos
                      ? 'border-rose-400 bg-rose-50 text-rose-900 dark:bg-rose-950/40 dark:text-rose-200 focus:ring-rose-400'
                      : 'border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-[#F4F4F5] focus:ring-indigo-500'
                  }`}
                />
                {validationErrors.apellidos && (
                  <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-1 font-semibold flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{validationErrors.apellidos}</span>
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Año Escolar</label>
                  <select
                    value={studentForm.idAnoActual}
                    onChange={(e) => {
                      const newAno = Number(e.target.value);
                      const matchingSec = secciones.find((s) => s.idAno === newAno);
                      setStudentForm({
                        ...studentForm,
                        idAnoActual: newAno,
                        idSeccion: matchingSec ? matchingSec.idSeccion : studentForm.idSeccion,
                      });
                    }}
                    className="w-full bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-[#F4F4F5] rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {anos.map((ano) => (
                      <option key={ano.idAno} value={ano.idAno}>
                        {ano.nombreNivel}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Sección</label>
                  <select
                    value={studentForm.idSeccion}
                    onChange={(e) =>
                      setStudentForm({ ...studentForm, idSeccion: Number(e.target.value) })
                    }
                    className="w-full bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-[#F4F4F5] rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {modalAvailableSections.length === 0 ? (
                      <option value={0}>Sin secciones</option>
                    ) : (
                      modalAvailableSections.map((sec) => (
                        <option key={sec.idSeccion} value={sec.idSeccion}>
                          Sección {sec.nombreSeccion}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Representante Asignado
                </label>
                <select
                  value={studentForm.idRepresentante}
                  onChange={(e) =>
                    setStudentForm({ ...studentForm, idRepresentante: Number(e.target.value) })
                  }
                  className="w-full bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-[#F4F4F5] rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {representantes.map((rep) => (
                    <option key={rep.idRepresentante} value={rep.idRepresentante}>
                      {rep.apellidos}, {rep.nombres} ({formatCedula(rep.cedula)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100 dark:border-[#27272A]">
                <button
                  type="button"
                  onClick={() => setStudentModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#181818] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving || !!validationErrors.nombres || !!validationErrors.apellidos}
                  className="px-5 py-2 min-h-[44px] rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
                >
                  {saving ? 'Guardando...' : 'Guardar Estudiante'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Registrar / Editar Representante */}
      {repModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-[#121212] rounded-3xl max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200 dark:border-[#27272A]">
            <div className="p-4 bg-slate-50 dark:bg-[#181818] border-b border-slate-200 dark:border-[#27272A] flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Shield className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                <h3 className="font-bold text-base text-slate-900 dark:text-[#F4F4F5]">
                  {editingRep ? 'Editar Representante' : 'Registrar Representante'}
                </h3>
              </div>
              <button onClick={() => setRepModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveRep} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Cédula</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: V-14589230"
                  value={repForm.cedula}
                  onChange={(e) => setRepForm({ ...repForm, cedula: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-[#F4F4F5] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nombres (Estrictamente sin números)
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Carlos Alberto"
                  value={repForm.nombres}
                  onChange={(e) => handleRepNameChange('nombres', e.target.value)}
                  className={`w-full bg-slate-50 dark:bg-[#181818] border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                    validationErrors.rep_nombres
                      ? 'border-rose-400 bg-rose-50 text-rose-900 dark:bg-rose-950/40 dark:text-rose-200'
                      : 'border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-[#F4F4F5] focus:ring-emerald-500'
                  }`}
                />
                {validationErrors.rep_nombres && (
                  <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-1 font-semibold">
                    {validationErrors.rep_nombres}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Apellidos (Estrictamente sin números)
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Mendoza Ramos"
                  value={repForm.apellidos}
                  onChange={(e) => handleRepNameChange('apellidos', e.target.value)}
                  className={`w-full bg-slate-50 dark:bg-[#181818] border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                    validationErrors.rep_apellidos
                      ? 'border-rose-400 bg-rose-50 text-rose-900 dark:bg-rose-950/40 dark:text-rose-200'
                      : 'border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-[#F4F4F5] focus:ring-emerald-500'
                  }`}
                />
                {validationErrors.rep_apellidos && (
                  <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-1 font-semibold">
                    {validationErrors.rep_apellidos}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Teléfono</label>
                  <input
                    type="text"
                    placeholder="Ej: +58 414 1234567"
                    value={repForm.telefono}
                    onChange={(e) => setRepForm({ ...repForm, telefono: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-[#F4F4F5] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Correo Electrónico</label>
                  <input
                    type="email"
                    required
                    placeholder="carlos@email.com"
                    value={repForm.email}
                    onChange={(e) => setRepForm({ ...repForm, email: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-[#F4F4F5] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Usuario de Acceso (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: cmendoza"
                    value={repForm.usuario}
                    onChange={(e) => {
                      setRepForm({ ...repForm, usuario: e.target.value });
                      setValidationErrors((prev) => ({ ...prev, rep_usuario: '' }));
                    }}
                    className="w-full bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-[#F4F4F5] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  {validationErrors.rep_usuario && (
                    <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-1 font-semibold">
                      {validationErrors.rep_usuario}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {editingRep ? 'Nueva Contraseña (Opcional)' : 'Contraseña (Opcional)'}
                  </label>
                  <div className="relative">
                    <input
                      type={showRepPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder={editingRep ? 'Conservar actual' : 'Mín. 6 chars (def. rep123)'}
                      value={repForm.password}
                      onChange={(e) => {
                        setRepForm({ ...repForm, password: e.target.value });
                        setValidationErrors((prev) => ({ ...prev, rep_password: '' }));
                      }}
                      className="w-full bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-[#F4F4F5] rounded-xl pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRepPassword((prev) => !prev)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                      aria-label={showRepPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                    >
                      {showRepPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {validationErrors.rep_password && (
                    <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-1 font-semibold">
                      {validationErrors.rep_password}
                    </p>
                  )}
                </div>
              </div>

              <label className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] cursor-pointer">
                <div>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                    Acceso Activo
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Permitir inicio de sesión al Portal de Representantes
                  </span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={repForm.activo}
                  onClick={() => setRepForm((prev) => ({ ...prev, activo: !prev.activo }))}
                  className={`w-10 h-6 rounded-full transition-colors flex items-center px-0.5 cursor-pointer ${
                    repForm.activo ? 'bg-emerald-600 justify-end' : 'bg-slate-300 dark:bg-slate-700 justify-start'
                  }`}
                >
                  <span className="w-5 h-5 rounded-full bg-white shadow-xs flex items-center justify-center">
                    {repForm.activo && <Check className="w-3 h-3 text-emerald-600" />}
                  </span>
                </button>
              </label>

              <div className="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-900 text-[11px] text-emerald-900 dark:text-emerald-200 leading-relaxed">
                El representante accederá al Portal de Padres usando su <strong>usuario, correo o cédula</strong> y su contraseña almacenada con hash seguro <strong>bcrypt</strong> en la base de datos.
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100 dark:border-[#27272A]">
                <button
                  type="button"
                  onClick={() => setRepModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#181818] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving || !!validationErrors.rep_nombres || !!validationErrors.rep_apellidos}
                  className="px-5 py-2 min-h-[44px] rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
                >
                  {saving ? 'Guardando...' : 'Guardar Representante'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Gestión de Credenciales de Acceso (Director y Coordinador) */}
      {credModalOpen && credRep && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#121212] rounded-3xl max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200 dark:border-[#27272A]">
            <div className="p-4 bg-amber-500/10 dark:bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="p-2 rounded-xl bg-amber-500 text-slate-950 font-black shadow-xs">
                  <Key className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-[#F4F4F5] text-base leading-tight">
                    Credenciales del Representante
                  </h3>
                  <p className="text-[11px] text-amber-700 dark:text-amber-400 font-medium">
                    Gestión autorizada para Director y Coordinador
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCredModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-[#181818] transition-colors cursor-pointer"
                aria-label="Cerrar modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCredentials} className="p-5 space-y-4">
              {/* Representative Mini Card */}
              <div className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A]">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-600 to-amber-400 text-slate-950 font-black flex items-center justify-center text-sm shadow-xs shrink-0">
                  {credRep.nombres.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-900 dark:text-[#F4F4F5] truncate">
                    {credRep.nombres} {credRep.apellidos}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                    C.I. {credRep.cedula}
                  </p>
                </div>
              </div>

              {/* Email field */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  Correo Electrónico de Acceso
                </label>
                <input
                  type="email"
                  required
                  value={credForm.email}
                  onChange={(e) => setCredForm({ ...credForm, email: e.target.value })}
                  placeholder="ejemplo@correo.com"
                  className="w-full bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-[#F4F4F5] rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
                />
              </div>

              {/* Username field */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  Usuario Personalizado (Opcional)
                </label>
                <input
                  type="text"
                  value={credForm.usuario}
                  onChange={(e) => setCredForm({ ...credForm, usuario: e.target.value })}
                  placeholder="Ej: cmendoza"
                  className="w-full bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-[#F4F4F5] rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
                />
              </div>

              {/* Password reset field */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-slate-400" />
                  Nueva Contraseña (dejar vacío para mantener la actual)
                </label>
                <div className="relative">
                  <input
                    type={showCredPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={credForm.password}
                    onChange={(e) => setCredForm({ ...credForm, password: e.target.value })}
                    placeholder="Mínimo 6 caracteres"
                    className="w-full bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-[#F4F4F5] rounded-xl pl-3.5 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCredPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
                    aria-label={showCredPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                  >
                    {showCredPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Active account toggle */}
              <label className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] cursor-pointer">
                <div>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                    Cuenta de Representante Activa
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Desactivar bloquea el acceso sin eliminar el historial escolar
                  </span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={credForm.activo}
                  onClick={() => setCredForm((prev) => ({ ...prev, activo: !prev.activo }))}
                  className={`w-10 h-6 rounded-full transition-colors flex items-center px-0.5 cursor-pointer ${
                    credForm.activo ? 'bg-emerald-600 justify-end' : 'bg-slate-300 dark:bg-slate-700 justify-start'
                  }`}
                >
                  <span className="w-5 h-5 rounded-full bg-white shadow-xs flex items-center justify-center">
                    {credForm.activo && <Check className="w-3 h-3 text-emerald-600" />}
                  </span>
                </button>
              </label>

              {/* Security info box */}
              <div className="p-3 rounded-xl bg-slate-100 dark:bg-[#181818] border border-slate-200/80 dark:border-[#27272A] flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-400">
                <Shield className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <p className="leading-relaxed text-[11px]">
                  El acceso al Portal del Representante se valida directamente contra la base de datos local mediante <strong>hash bcrypt</strong> y sesiones <strong>JWT HttpOnly</strong>. Solo el representante activo podrá consultar el historial y reportes de asistencias de sus representados.
                </p>
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100 dark:border-[#27272A]">
                <button
                  type="button"
                  onClick={() => setCredModalOpen(false)}
                  disabled={savingCred}
                  className="px-4 py-2.5 min-h-[44px] rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#181818] cursor-pointer transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingCred}
                  className="px-5 py-2.5 min-h-[44px] rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-slate-950 flex items-center gap-2 cursor-pointer shadow-sm transition-all disabled:opacity-50"
                >
                  {savingCred ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <>
                      <Key className="w-4 h-4" />
                      <span>Actualizar Credenciales</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
