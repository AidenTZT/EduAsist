import React, { useState } from 'react';
import {
  UserCog,
  UserPlus,
  ShieldAlert,
  ShieldCheck,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  X,
  Search,
  Phone,
  Mail,
  Lock,
  User,
  Eye,
  EyeOff,
  Check,
  RefreshCw,
  Calendar,
  Plus,
} from 'lucide-react';
import type {
  Usuario,
  RolUsuario,
  AnoEscolar,
  Seccion,
  Materia,
  DocenteMateria,
  SuplenciaDocente,
} from '../types.ts';
import {
  createUser,
  updateUser,
  deleteUser,
  fetchUsers,
  createSuplencia,
  toggleSuplencia,
  deleteSuplencia,
} from '../lib/api.ts';
import { validateNoNumbersInName } from '../lib/validation.ts';
import { formatCedula } from '../lib/utils.ts';

interface StaffManagerProps {
  currentUser: Usuario | null;
  staffUsers: Usuario[];
  anos?: AnoEscolar[];
  secciones?: Seccion[];
  materias?: Materia[];
  docenteMaterias?: DocenteMateria[];
  suplencias?: SuplenciaDocente[];
  onRefreshData: () => Promise<void> | void;
}

export const StaffManager: React.FC<StaffManagerProps> = ({
  currentUser,
  staffUsers,
  anos = [],
  secciones = [],
  materias = [],
  docenteMaterias = [],
  suplencias = [],
  onRefreshData,
}) => {
  const [localUsers, setLocalUsers] = useState<Usuario[]>(staffUsers);
  const [loadingLocal, setLoadingLocal] = useState<boolean>(false);

  React.useEffect(() => {
    setLocalUsers(staffUsers);
  }, [staffUsers]);

  const activeUsersList = localUsers;

  const [filterRole, setFilterRole] = useState<string>('todos');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [editItem, setEditItem] = useState<Usuario | null>(null);

  const [form, setForm] = useState({
    usuario: '',
    nombre: '',
    apellidos: '',
    email: '',
    cedula: '',
    telefono: '',
    rol: 'docente' as RolUsuario,
    anosAsignados: [] as number[],
    password: '',
    activo: true,
  });
  const [showPassword, setShowPassword] = useState<boolean>(false);

  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<boolean>(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modal de Suplencias rápido desde la ficha del Docente Suplente
  const [suplenciasModalUser, setSuplenciasModalUser] = useState<Usuario | null>(null);
  const [suplenciaForm, setSuplenciaForm] = useState({
    idDocenteTitular: 0,
    alcanceCompleto: true,
    idMateria: 0,
    idSeccion: 0,
    fechaInicio: '',
    fechaFin: '',
    motivo: '',
  });
  const [savingSuplencia, setSavingSuplencia] = useState<boolean>(false);
  const [suplenciaModalMsg, setSuplenciaModalMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const canManageSuplencias =
    currentUser?.rol === 'director' || currentUser?.rol === 'coordinador';

  const openSuplenciasModal = (user: Usuario) => {
    const firstTitular = activeUsersList.find((u) => u.rol === 'docente' && u.activo !== false);
    const titularMats = firstTitular
      ? docenteMaterias.filter((dm) => dm.idUsuario === firstTitular.id)
      : [];
    const firstMateriaId = titularMats[0]?.idMateria || materias[0]?.idMateria || 0;
    setSuplenciasModalUser(user);
    setSuplenciaModalMsg(null);
    setSuplenciaForm({
      idDocenteTitular: firstTitular?.id || 0,
      alcanceCompleto: titularMats.length > 0,
      idMateria: firstMateriaId,
      idSeccion: 0,
      fechaInicio: '',
      fechaFin: '',
      motivo: '',
    });
  };

  const handleSaveQuickSuplencia = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!suplenciasModalUser) return;
    if (!suplenciaForm.idDocenteTitular) {
      setSuplenciaModalMsg({
        type: 'error',
        text: 'Debe seleccionar el docente titular a sustituir.',
      });
      return;
    }
    const titularAssignedMats = docenteMaterias.filter(
      (dm) => dm.idUsuario === suplenciaForm.idDocenteTitular
    );
    if (suplenciaForm.alcanceCompleto && titularAssignedMats.length === 0) {
      setSuplenciaModalMsg({
        type: 'error',
        text: 'El docente titular seleccionado no tiene materias asignadas aún.',
      });
      return;
    }
    if (!suplenciaForm.alcanceCompleto && !suplenciaForm.idMateria) {
      setSuplenciaModalMsg({
        type: 'error',
        text: 'Debe seleccionar la materia específica a sustituir.',
      });
      return;
    }
    if (
      suplenciaForm.fechaInicio &&
      suplenciaForm.fechaFin &&
      suplenciaForm.fechaInicio > suplenciaForm.fechaFin
    ) {
      setSuplenciaModalMsg({
        type: 'error',
        text: 'La fecha de inicio no puede ser posterior a la fecha de fin.',
      });
      return;
    }

    setSavingSuplencia(true);
    setSuplenciaModalMsg(null);
    try {
      const matchedDm = !suplenciaForm.alcanceCompleto
        ? docenteMaterias.find(
            (dm) =>
              dm.idUsuario === suplenciaForm.idDocenteTitular &&
              dm.idMateria === suplenciaForm.idMateria
          )
        : null;
      await createSuplencia({
        idSuplente: suplenciasModalUser.id,
        idDocenteTitular: suplenciaForm.idDocenteTitular,
        alcanceCompleto: suplenciaForm.alcanceCompleto,
        idDocenteMateria: matchedDm?.idAsignacion || null,
        idMateria: suplenciaForm.alcanceCompleto ? null : suplenciaForm.idMateria,
        idSeccion: suplenciaForm.idSeccion > 0 ? suplenciaForm.idSeccion : null,
        activo: true,
        fechaInicio: suplenciaForm.fechaInicio.trim() || null,
        fechaFin: suplenciaForm.fechaFin.trim() || null,
        motivo: suplenciaForm.motivo.trim() || null,
      });
      setSuplenciaModalMsg({
        type: 'success',
        text: 'Suplencia asignada exitosamente.',
      });
      setSuplenciaForm((prev) => ({ ...prev, motivo: '' }));
      await onRefreshData();
    } catch (err: any) {
      setSuplenciaModalMsg({
        type: 'error',
        text: err.message || 'No se pudo asignar la suplencia.',
      });
    } finally {
      setSavingSuplencia(false);
    }
  };

  const handleToggleQuickSuplencia = async (idSuplencia: number) => {
    setSuplenciaModalMsg(null);
    try {
      await toggleSuplencia(idSuplencia);
      await onRefreshData();
    } catch (err: any) {
      setSuplenciaModalMsg({
        type: 'error',
        text: err.message || 'No se pudo cambiar el estado de la suplencia.',
      });
    }
  };

  const handleDeleteQuickSuplencia = async (idSuplencia: number) => {
    setSuplenciaModalMsg(null);
    try {
      await deleteSuplencia(idSuplencia);
      setSuplenciaModalMsg({ type: 'success', text: 'Suplencia eliminada.' });
      await onRefreshData();
    } catch (err: any) {
      setSuplenciaModalMsg({
        type: 'error',
        text: err.message || 'No se pudo eliminar la suplencia.',
      });
    }
  };

  const openModal = (userToEdit?: Usuario) => {
    setMessage(null);
    setValidationErrors({});
    setShowPassword(false);
    if (userToEdit) {
      const isMasterAdmin =
        userToEdit.nombre.trim().toLowerCase() === 'admin' ||
        userToEdit.email.toLowerCase() === 'admin@eduasist.edu' ||
        userToEdit.email.toLowerCase() === 'admin@educontrol.edu' ||
        userToEdit.email.toLowerCase() === 'adrian0424344@gmail.com' ||
        userToEdit.cedula?.toLowerCase() === 'admin';
      const otherDirectorsCount = activeUsersList.filter(
        (u) => u.rol === 'director' && u.activo !== false && u.id !== userToEdit.id
      ).length;

      if (isMasterAdmin && otherDirectorsCount === 0) {
        setMessage({
          type: 'error',
          text: 'Operación denegada: El usuario maestro Admin solo puede ser editado si ya se ha registrado y activado previamente al menos otro usuario con el rol de Director en la institución.',
        });
        return;
      }

      setEditItem(userToEdit);
      setForm({
        usuario: userToEdit.usuario || '',
        nombre: userToEdit.nombre,
        apellidos: userToEdit.apellidos,
        email: userToEdit.email,
        cedula: userToEdit.cedula || '',
        telefono: userToEdit.telefono || '',
        rol: userToEdit.rol,
        anosAsignados: Array.isArray(userToEdit.anosAsignados) ? [...userToEdit.anosAsignados] : [],
        password: '',
        activo: userToEdit.activo !== false,
      });
    } else {
      setEditItem(null);
      setForm({
        usuario: '',
        nombre: '',
        apellidos: '',
        email: '',
        cedula: '',
        telefono: '',
        rol: 'docente',
        anosAsignados: [],
        password: '',
        activo: true,
      });
    }
    setModalOpen(true);
  };

  const handleNameChange = (field: 'nombre' | 'apellidos', value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    const result = validateNoNumbersInName(value, field === 'nombre' ? 'Nombre' : 'Apellidos');
    setValidationErrors((prev) => ({
      ...prev,
      [field]: result.valid ? '' : result.error || '',
    }));
  };

  const [confirmDeleteUserId, setConfirmDeleteUserId] = useState<number | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const nombreCheck = validateNoNumbersInName(form.nombre, 'Nombre');
    const apellidosCheck = validateNoNumbersInName(form.apellidos, 'Apellidos');
    const usuarioTrim = form.usuario.trim();
    const usuarioErr =
      usuarioTrim.length > 0 && usuarioTrim.length < 3
        ? 'El usuario debe tener al menos 3 caracteres.'
        : '';
    const passwordErr =
      !editItem && form.password.trim().length < 6
        ? 'Debe asignar una contraseña inicial de al menos 6 caracteres.'
        : editItem && form.password.trim().length > 0 && form.password.trim().length < 6
        ? 'La nueva contraseña debe tener al menos 6 caracteres.'
        : '';

    const anosErr =
      form.rol === 'coordinador_seccional' && form.anosAsignados.length === 0
        ? 'Debe asignar al menos un año escolar al Coordinador Seccional.'
        : '';

    if (!nombreCheck.valid || !apellidosCheck.valid || usuarioErr || passwordErr || anosErr) {
      setValidationErrors({
        nombre: nombreCheck.error || '',
        apellidos: apellidosCheck.error || '',
        usuario: usuarioErr,
        password: passwordErr,
        anosAsignados: anosErr,
      });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const scopedAnos = form.rol === 'coordinador_seccional' ? form.anosAsignados : [];
      if (editItem) {
        await updateUser(editItem.id, {
          usuario: usuarioTrim || null,
          nombre: form.nombre.trim(),
          apellidos: form.apellidos.trim(),
          email: form.email.trim(),
          cedula: form.cedula.trim() || null,
          telefono: form.telefono.trim() || null,
          rol: form.rol,
          anosAsignados: scopedAnos,
          activo: form.activo,
          ...(form.password.trim() ? { password: form.password.trim() } : {}),
        });
        setMessage({ type: 'success', text: 'Datos y credenciales del personal actualizados con éxito' });
      } else {
        await createUser({
          usuario: usuarioTrim || undefined,
          nombre: form.nombre.trim(),
          apellidos: form.apellidos.trim(),
          email: form.email.trim(),
          cedula: form.cedula.trim() || undefined,
          telefono: form.telefono.trim() || undefined,
          rol: form.rol,
          anosAsignados: form.rol === 'coordinador_seccional' ? scopedAnos : undefined,
          password: form.password.trim(),
          activo: form.activo,
        });
        setMessage({ type: 'success', text: 'Personal registrado exitosamente en la base de datos local' });
      }
      setModalOpen(false);
      await onRefreshData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Error al guardar usuario' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (user: Usuario) => {
    if (currentUser?.rol !== 'director') {
      setMessage({
        type: 'error',
        text: 'Permiso denegado: Solo el rol de Director puede eliminar usuarios del personal.',
      });
      return;
    }

    const isMasterAdmin =
      user.nombre.trim().toLowerCase() === 'admin' ||
      user.email.toLowerCase() === 'admin@eduasist.edu' ||
      user.email.toLowerCase() === 'admin@educontrol.edu' ||
      user.email.toLowerCase() === 'adrian0424344@gmail.com' ||
      user.cedula?.toLowerCase() === 'admin';
    const otherDirectorsCount = activeUsersList.filter(
      (u) => u.rol === 'director' && u.id !== user.id
    ).length;

    if (isMasterAdmin && otherDirectorsCount === 0) {
      setMessage({
        type: 'error',
        text: 'Operación denegada: El usuario maestro Admin solo puede ser eliminado si ya se ha registrado y activado previamente al menos otro usuario con el rol de Director en la institución.',
      });
      return;
    }

    if (user.rol === 'director' && otherDirectorsCount === 0) {
      setMessage({
        type: 'error',
        text: 'Operación denegada: No se puede eliminar al único Director activo en la institución. Registre previamente otro Director para evitar que el sistema quede sin administración.',
      });
      return;
    }

    if (confirmDeleteUserId !== user.id) {
      setConfirmDeleteUserId(user.id);
      return;
    }

    try {
      await deleteUser(user.id);
      setConfirmDeleteUserId(null);
      setMessage({ type: 'success', text: `Usuario ${user.nombre} ${user.apellidos} eliminado con éxito` });
      await onRefreshData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Error al eliminar usuario' });
    }
  };

  const filteredUsers = activeUsersList.filter((u) => {
    const matchesRole = filterRole === 'todos' || u.rol === filterRole;
    const term = searchTerm.toLowerCase();
    const fullName = `${u.nombre} ${u.apellidos}`.toLowerCase();
    const matchesSearch =
      fullName.includes(term) ||
      u.email.toLowerCase().includes(term) ||
      (u.usuario || '').toLowerCase().includes(term);
    return matchesRole && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-white dark:bg-[#121212] p-5 rounded-2xl border border-slate-200 dark:border-[#27272A] shadow-xs transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-xl">
              <UserCog className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-[#F4F4F5]">Gestión de Personal & Roles (RBAC)</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Control jerárquico estricto: Directores, Coordinadores, Coordinadores Seccionales, Docentes y Suplentes
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {currentUser?.rol === 'director' ? (
              <button
                onClick={() => openModal()}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 flex items-center space-x-1.5 shadow-sm shadow-indigo-100 dark:shadow-none self-start sm:self-auto cursor-pointer transition-colors"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Registrar Personal</span>
              </button>
            ) : (
              <span className="px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-400 border border-amber-200 dark:border-amber-800 flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span>Gestión Exclusiva del Director</span>
              </span>
            )}
          </div>
        </div>

        {currentUser?.rol !== 'director' && (
          <div className="mt-4 p-3.5 rounded-2xl bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-900 dark:text-amber-300 flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Acceso de Solo Consulta (RBAC)</p>
              <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
                De acuerdo con la nueva jerarquía de roles, la capacidad de crear, editar o eliminar usuarios del personal institucional (Directores, Coordinadores y Docentes) está reservada exclusivamente para el <strong>Director General</strong>.
              </p>
            </div>
          </div>
        )}

        {/* Filter bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5 pt-4 border-t border-slate-100 dark:border-[#27272A]">
          <div className="sm:col-span-2 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Buscar por nombre, apellido o correo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-[#F4F4F5] rounded-xl pl-9 pr-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
            />
          </div>

          <div>
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              className="w-full bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-[#F4F4F5] rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
            >
              <option value="todos">Todos los Roles</option>
              <option value="director">Directores</option>
              <option value="coordinador">Coordinadores Generales</option>
              <option value="coordinador_seccional">Coordinadores Seccionales</option>
              <option value="docente">Docentes Titulares</option>
              <option value="docente_suplente">Docentes Suplentes</option>
            </select>
          </div>
        </div>
      </div>

      {message && (
        <div
          className={`p-3.5 rounded-xl text-xs font-semibold flex items-center justify-between ${
            message.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
              : 'bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
          }`}
        >
          <div className="flex items-center space-x-2">
            {message.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            <span>{message.text}</span>
          </div>
          <button onClick={() => setMessage(null)} className="cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Staff Table */}
      <div className="bg-white dark:bg-[#121212] rounded-2xl border border-slate-200 dark:border-[#27272A] overflow-hidden shadow-xs transition-colors">
        <div className="p-4 bg-slate-50/70 dark:bg-[#181818] border-b border-slate-200 dark:border-[#27272A] flex items-center justify-between">
          <span className="font-bold text-sm text-slate-800 dark:text-[#F4F4F5]">
            Personal Registrado ({filteredUsers.length})
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Validación activa: Nombres estrictamente sin números
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-[#27272A] text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider bg-slate-50/50 dark:bg-[#181818]/60">
                <th className="py-3 px-4">Nombre y Apellidos</th>
                <th className="py-3 px-4">Cédula</th>
                <th className="py-3 px-4">Contacto</th>
                <th className="py-3 px-4 text-center">Rol Jerárquico</th>
                <th className="py-3 px-4 text-right w-36">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#27272A]">
              {filteredUsers.map((u) => {
                let roleColor = 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700';
                let roleLabel: string = u.rol;
                if (u.rol === 'director') {
                  roleColor = 'bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 border-purple-200 dark:border-purple-800 font-black';
                  roleLabel = 'Director';
                }
                if (u.rol === 'coordinador') {
                  roleColor = 'bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800 font-bold';
                  roleLabel = 'Coordinador';
                }
                if (u.rol === 'coordinador_seccional') {
                  roleColor = 'bg-cyan-100 dark:bg-cyan-950/60 text-cyan-800 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800 font-bold';
                  roleLabel = 'Coord. Seccional';
                }
                if (u.rol === 'docente') {
                  roleColor = 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 font-bold';
                  roleLabel = 'Docente';
                }
                if (u.rol === 'docente_suplente') {
                  roleColor = 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800 font-bold';
                  roleLabel = 'Docente Suplente';
                }

                const activeUserSuplencias =
                  u.rol === 'docente_suplente'
                    ? suplencias.filter((s) => s.idSuplente === u.id && s.activo)
                    : [];

                const assignedAnoChips =
                  u.rol === 'coordinador_seccional' && Array.isArray(u.anosAsignados)
                    ? u.anosAsignados
                        .map((id) => anos.find((a) => a.idAno === id)?.nombreNivel.split(' - ')[0] || `Año #${id}`)
                    : [];

                const otherDirectors = activeUsersList.filter((user) => user.rol === 'director' && user.id !== u.id);
                const isMasterAdmin =
                  u.nombre.trim().toLowerCase() === 'admin' ||
                  u.email.toLowerCase() === 'admin@eduasist.edu' ||
                  u.email.toLowerCase() === 'admin@educontrol.edu' ||
                  u.email.toLowerCase() === 'adrian0424344@gmail.com' ||
                  u.cedula?.toLowerCase() === 'admin';
                const isProtectedDirector = u.rol === 'director' && otherDirectors.length === 0;

                return (
                  <tr key={u.id} className="hover:bg-slate-50/70 dark:hover:bg-[#181818]/60 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center flex-wrap gap-2">
                        <span className="font-bold text-slate-900 dark:text-[#F4F4F5]">
                          {u.nombre} {u.apellidos}
                        </span>
                        {isMasterAdmin && (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-400 border border-amber-300 dark:border-amber-700/60"
                            title="Usuario Maestro inicial del sistema"
                          >
                            <ShieldCheck className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                            Maestro
                          </span>
                        )}
                        {u.activo === false && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                            Inactivo
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 dark:text-slate-500 font-mono flex items-center flex-wrap gap-x-2">
                        <span>{u.email}</span>
                        {u.usuario && (
                          <span className="text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold">
                            @{u.usuario}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {u.cedula ? formatCedula(u.cedula) : '--'}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-400">
                      {u.telefono || 'Sin teléfono'}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className={`inline-block px-3 py-0.5 rounded-full text-xs uppercase border ${roleColor}`}>
                          {roleLabel}
                        </span>
                        {assignedAnoChips.length > 0 && (
                          <div className="flex flex-wrap justify-center gap-1 mt-0.5">
                            {assignedAnoChips.map((chip, cIdx) => (
                              <span
                                key={cIdx}
                                className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-cyan-50 dark:bg-cyan-950/40 text-cyan-800 dark:text-cyan-300 border border-cyan-200/80 dark:border-cyan-800/60"
                              >
                                {chip}
                              </span>
                            ))}
                          </div>
                        )}
                        {u.rol === 'docente_suplente' && (
                          <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                            {activeUserSuplencias.length} suplencia(s) activa(s)
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {currentUser?.rol === 'director' ? (
                        <div className="space-x-1 inline-flex items-center">
                          {u.rol === 'docente_suplente' && (
                            <button
                              type="button"
                              onClick={() => openSuplenciasModal(u)}
                              className="px-2 py-1 text-[11px] font-bold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/50 border border-amber-200 dark:border-amber-800 rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1"
                              title="Asignar o gestionar suplencias de este docente"
                            >
                              <RefreshCw className="w-3 h-3" />
                              <span>Suplencias</span>
                            </button>
                          )}
                          {isProtectedDirector ? (
                            <div
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] text-slate-500 dark:text-slate-400 text-xs font-medium cursor-help"
                              title={
                                isMasterAdmin
                                  ? 'Usuario Maestro Protegido: Solo puede ser editado o eliminado si ya se ha registrado previamente al menos otro Director en la institución.'
                                  : 'Único Director Activo: Protegido contra eliminación/edición para evitar que el sistema quede sin Director.'
                              }
                            >
                              <Lock className="w-3 h-3 text-amber-500 dark:text-amber-400 shrink-0" />
                              <span className="text-[11px] font-semibold">Protegido</span>
                            </div>
                          ) : confirmDeleteUserId === u.id ? (
                            <div className="inline-flex items-center space-x-1">
                              <button
                                onClick={() => handleDelete(u)}
                                className="px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[11px] font-bold cursor-pointer transition-colors"
                              >
                                ¿Confirmar?
                              </button>
                              <button
                                onClick={() => setConfirmDeleteUserId(null)}
                                className="px-1.5 py-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-[#27272A] rounded-lg text-xs font-bold cursor-pointer"
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <>
                              <button
                                onClick={() => openModal(u)}
                                className="p-1.5 text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-[#27272A] rounded-lg transition-colors cursor-pointer"
                                title="Editar"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDelete(u)}
                                className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
                                title="Eliminar"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      ) : canManageSuplencias && u.rol === 'docente_suplente' ? (
                        <button
                          type="button"
                          onClick={() => openSuplenciasModal(u)}
                          className="px-2.5 py-1 text-[11px] font-bold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/50 border border-amber-200 dark:border-amber-800 rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>Suplencias</span>
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-400 dark:text-slate-500 italic">Solo lectura</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Crear / Editar Personal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-[#121212] rounded-3xl max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200 dark:border-[#27272A] transition-colors">
            <div className="p-4 bg-slate-50 dark:bg-[#181818] border-b border-slate-200 dark:border-[#27272A] flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <UserCog className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                <h3 className="font-bold text-base text-slate-900 dark:text-[#F4F4F5]">
                  {editItem ? 'Editar Personal' : 'Nuevo Usuario del Sistema'}
                </h3>
              </div>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {/* Nombres with strict validation */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nombres (Estrictamente sin números)
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Fernando José"
                  value={form.nombre}
                  onChange={(e) => handleNameChange('nombre', e.target.value)}
                  className={`w-full bg-slate-50 dark:bg-[#181818] border text-slate-900 dark:text-[#F4F4F5] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                    validationErrors.nombre
                      ? 'border-rose-400 bg-rose-50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200 focus:ring-rose-400'
                      : 'border-slate-200 dark:border-[#27272A] focus:ring-indigo-500 focus:bg-white dark:focus:bg-[#181818]'
                  }`}
                />
                {validationErrors.nombre && (
                  <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-1 font-semibold flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{validationErrors.nombre}</span>
                  </p>
                )}
              </div>

              {/* Apellidos with strict validation */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Apellidos (Estrictamente sin números)
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Valbuena Martínez"
                  value={form.apellidos}
                  onChange={(e) => handleNameChange('apellidos', e.target.value)}
                  className={`w-full bg-slate-50 dark:bg-[#181818] border text-slate-900 dark:text-[#F4F4F5] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                    validationErrors.apellidos
                      ? 'border-rose-400 bg-rose-50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200 focus:ring-rose-400'
                      : 'border-slate-200 dark:border-[#27272A] focus:ring-indigo-500 focus:bg-white dark:focus:bg-[#181818]'
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
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Cédula</label>
                  <input
                    type="text"
                    placeholder="Ej: V-11234567"
                    value={form.cedula}
                    onChange={(e) => setForm({ ...form, cedula: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-[#F4F4F5] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Teléfono</label>
                  <input
                    type="text"
                    placeholder="Ej: +58 414 1112233"
                    value={form.telefono}
                    onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-[#F4F4F5] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Correo Institucional
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="correo@eduasist.edu"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-[#F4F4F5] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Usuario de Acceso (Opcional)
                  </label>
                  <div className="relative">
                    <User className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Ej: fvalbuena"
                      value={form.usuario}
                      onChange={(e) => {
                        setForm({ ...form, usuario: e.target.value });
                        setValidationErrors((prev) => ({ ...prev, usuario: '' }));
                      }}
                      className="w-full bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-[#F4F4F5] rounded-xl pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  {validationErrors.usuario && (
                    <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-1 font-semibold">
                      {validationErrors.usuario}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {editItem ? 'Nueva Contraseña (dejar vacía para conservar actual)' : 'Contraseña Inicial (Mín. 6 caracteres)'}
                </label>
                <div className="relative">
                  <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required={!editItem}
                    autoComplete="new-password"
                    placeholder={editItem ? 'Dejar vacío para mantener contraseña actual' : 'Mínimo 6 caracteres'}
                    value={form.password}
                    onChange={(e) => {
                      setForm({ ...form, password: e.target.value });
                      setValidationErrors((prev) => ({ ...prev, password: '' }));
                    }}
                    className={`w-full bg-slate-50 dark:bg-[#181818] border rounded-xl pl-8 pr-9 py-2 text-sm text-slate-900 dark:text-[#F4F4F5] focus:outline-none focus:ring-2 ${
                      validationErrors.password
                        ? 'border-rose-400 focus:ring-rose-400'
                        : 'border-slate-200 dark:border-[#27272A] focus:ring-indigo-500'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {validationErrors.password && (
                  <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-1 font-semibold flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{validationErrors.password}</span>
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Rol Jerárquico (RBAC)</label>
                <select
                  value={form.rol}
                  onChange={(e) => {
                    const nextRol = e.target.value as RolUsuario;
                    setForm((prev) => ({
                      ...prev,
                      rol: nextRol,
                      anosAsignados: nextRol === 'coordinador_seccional' ? prev.anosAsignados : [],
                    }));
                    setValidationErrors((prev) => ({ ...prev, anosAsignados: '' }));
                  }}
                  className="w-full bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-[#F4F4F5] rounded-xl px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="docente">Docente Titular de Aula (Acceso solo a sus materias)</option>
                  <option value="docente_suplente">Docente Suplente (Sustituye materias asignadas)</option>
                  <option value="coordinador_seccional">Coordinador Seccional (Gestión por años asignados)</option>
                  <option value="coordinador">Coordinador General (Gestión de docentes, materias y alumnos)</option>
                  {currentUser?.rol === 'director' && (
                    <option value="director">Director (Control total institucional)</option>
                  )}
                </select>
              </div>

              {form.rol === 'coordinador_seccional' && (
                <div className="p-3.5 rounded-2xl bg-cyan-50/70 dark:bg-cyan-950/25 border border-cyan-200 dark:border-cyan-800/60 space-y-2.5">
                  <div>
                    <p className="text-xs font-bold text-cyan-900 dark:text-cyan-200">
                      Años Escolares Asignados (Obligatorio)
                    </p>
                    <p className="text-[11px] text-cyan-700 dark:text-cyan-400">
                      El Coordinador Seccional solo podrá visualizar y gestionar secciones, materias, estudiantes, horarios y asistencias de los años marcados.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {anos.map((ano) => {
                      const checked = form.anosAsignados.includes(ano.idAno);
                      return (
                        <label
                          key={ano.idAno}
                          className={`flex items-center gap-2 p-2 rounded-xl border text-xs cursor-pointer transition-colors ${
                            checked
                              ? 'bg-cyan-100/90 dark:bg-cyan-900/50 border-cyan-400 dark:border-cyan-700 font-bold text-cyan-950 dark:text-cyan-100'
                              : 'bg-white dark:bg-[#121212] border-slate-200 dark:border-[#27272A] text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setForm((prev) => ({
                                ...prev,
                                anosAsignados: checked
                                  ? prev.anosAsignados.filter((id) => id !== ano.idAno)
                                  : [...prev.anosAsignados, ano.idAno],
                              }));
                              setValidationErrors((prev) => ({ ...prev, anosAsignados: '' }));
                            }}
                            className="rounded text-cyan-600 focus:ring-cyan-500 cursor-pointer"
                          />
                          <span className="truncate">{ano.nombreNivel.split(' - ')[0]}</span>
                        </label>
                      );
                    })}
                  </div>
                  {validationErrors.anosAsignados && (
                    <p className="text-[11px] text-rose-600 dark:text-rose-400 font-semibold flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{validationErrors.anosAsignados}</span>
                    </p>
                  )}
                </div>
              )}

              {form.rol === 'docente_suplente' && (
                <div className="p-3 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-[11px] text-amber-900 dark:text-amber-200 leading-relaxed">
                  <strong>Docente Suplente:</strong> No requiere asignación previa en <em>Docente-Materia</em> para registrarse ni operar. Se le asigna directamente el docente titular al que sustituye desde el <strong>Panel de Suplencias</strong> o el botón <strong>Suplencias</strong>.
                </div>
              )}

              <label className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] cursor-pointer">
                <div>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                    Cuenta Activa
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Los usuarios inactivos no pueden iniciar sesión en EduAsist
                  </span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.activo}
                  onClick={() => setForm((prev) => ({ ...prev, activo: !prev.activo }))}
                  className={`w-10 h-6 rounded-full transition-colors flex items-center px-0.5 cursor-pointer ${
                    form.activo ? 'bg-emerald-600 justify-end' : 'bg-slate-300 dark:bg-slate-700 justify-start'
                  }`}
                >
                  <span className="w-5 h-5 rounded-full bg-white shadow-xs flex items-center justify-center">
                    {form.activo && <Check className="w-3 h-3 text-emerald-600" />}
                  </span>
                </button>
              </label>

              <div className="p-3 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200/80 dark:border-indigo-900 text-[11px] text-indigo-900 dark:text-indigo-200 leading-relaxed">
                El personal ingresa mediante <strong>usuario, correo o cédula</strong> junto con su contraseña cifrada con <strong>bcrypt</strong> en nuestra base de datos.
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100 dark:border-[#27272A]">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#181818] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving || !!validationErrors.nombre || !!validationErrors.apellidos}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  {saving ? 'Guardando...' : 'Guardar Personal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Modal: Gestión Rápida de Suplencias del Docente Suplente */}
      {suplenciasModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-[#121212] rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200 dark:border-[#27272A] transition-colors">
            <div className="p-4 bg-amber-50/80 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-900/50 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300">
                  <RefreshCw className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900 dark:text-[#F4F4F5]">
                    Suplencias de {suplenciasModalUser.nombre} {suplenciasModalUser.apellidos}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Asignar materias y docente titular al que sustituye para el pase de asistencia
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSuplenciasModalUser(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {suplenciaModalMsg && (
                <div
                  className={`p-3 rounded-xl text-xs font-semibold flex items-center justify-between border ${
                    suplenciaModalMsg.type === 'success'
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                      : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
                  }`}
                >
                  <span>{suplenciaModalMsg.text}</span>
                  <button
                    type="button"
                    onClick={() => setSuplenciaModalMsg(null)}
                    className="cursor-pointer ml-2"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Existing suplencias for this substitute */}
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Suplencias registradas ({suplencias.filter((s) => s.idSuplente === suplenciasModalUser.id).length})
                </p>
                {suplencias.filter((s) => s.idSuplente === suplenciasModalUser.id).length === 0 ? (
                  <div className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-[#27272A] text-center text-xs text-slate-400">
                    Este docente suplente aún no tiene suplencias asignadas.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                    {suplencias
                      .filter((s) => s.idSuplente === suplenciasModalUser.id)
                      .map((sup) => (
                        <div
                          key={sup.idSuplencia}
                          className="p-3 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#181818] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                        >
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-bold text-slate-900 dark:text-[#F4F4F5]">
                                {sup.nombreMateria}
                              </span>
                              {sup.alcanceCompleto && (
                                <span className="px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-[10px] font-bold border border-amber-200 dark:border-amber-800">
                                  Suplencia total al titular
                                </span>
                              )}
                              {sup.nombreNivel && (
                                <span className="px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold">
                                  {sup.nombreNivel.split(' - ')[0]}
                                </span>
                              )}
                              <span className="px-2 py-0.5 rounded bg-slate-200 dark:bg-[#27272A] text-slate-700 dark:text-slate-300 text-[10px] font-bold">
                                {sup.nombreSeccion ? `Sección ${sup.nombreSeccion}` : 'Todas las secciones'}
                              </span>
                            </div>
                            {sup.alcanceCompleto && sup.materiasTitularResumen && sup.materiasTitularResumen.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {sup.materiasTitularResumen.map((m) => (
                                  <span
                                    key={`quick-sup-${sup.idSuplencia}-${m.idMateria}`}
                                    className="px-1.5 py-0.5 rounded bg-white dark:bg-[#121212] border border-slate-200 dark:border-[#27272A] text-[10px] font-medium text-slate-600 dark:text-slate-300"
                                  >
                                    {m.nombreMateria}
                                  </span>
                                ))}
                              </div>
                            )}
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                              Supliendo a: <strong>{sup.titularNombre} {sup.titularApellidos}</strong>
                              {(sup.fechaInicio || sup.fechaFin) && (
                                <span className="ml-2 font-mono">
                                  ({sup.fechaInicio || '...'} → {sup.fechaFin || '...'})
                                </span>
                              )}
                            </p>
                            {sup.motivo && (
                              <p className="text-[11px] text-slate-400 italic">Motivo: {sup.motivo}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 self-end sm:self-center">
                            <button
                              type="button"
                              onClick={() => handleToggleQuickSuplencia(sup.idSuplencia)}
                              className={`px-2 py-1 rounded-lg text-[10px] font-bold border cursor-pointer ${
                                sup.activo
                                  ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                                  : 'bg-slate-200 dark:bg-[#27272A] text-slate-600 dark:text-slate-400 border-slate-300 dark:border-[#3F3F46]'
                              }`}
                            >
                              {sup.activo ? 'Activa' : 'Inactiva'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteQuickSuplencia(sup.idSuplencia)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                              title="Eliminar suplencia"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>

              {/* Assign new suplencia form */}
              <form
                onSubmit={handleSaveQuickSuplencia}
                className="p-4 rounded-2xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] space-y-3"
              >
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5 text-amber-600" />
                  <span>Asignar Nueva Suplencia</span>
                </p>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Docente Titular a Sustituir
                  </label>
                  <select
                    value={suplenciaForm.idDocenteTitular}
                    onChange={(e) => {
                      const titularId = Number(e.target.value);
                      const titularMats = docenteMaterias.filter((dm) => dm.idUsuario === titularId);
                      const nextMatId = titularMats[0]?.idMateria || materias[0]?.idMateria || 0;
                      setSuplenciaForm((prev) => ({
                        ...prev,
                        idDocenteTitular: titularId,
                        alcanceCompleto: titularMats.length > 0,
                        idMateria: nextMatId,
                        idSeccion: 0,
                      }));
                    }}
                    className="w-full bg-white dark:bg-[#121212] border border-slate-200 dark:border-[#27272A] rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 dark:text-[#F4F4F5]"
                  >
                    <option value={0}>Seleccione docente titular...</option>
                    {activeUsersList
                      .filter((u) => u.rol === 'docente')
                      .map((doc) => (
                        <option key={doc.id} value={doc.id}>
                          {doc.nombre} {doc.apellidos}
                        </option>
                      ))}
                  </select>
                </div>

                {/* Alcance de la Suplencia */}
                <div className="space-y-2">
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                    Alcance de la Suplencia
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setSuplenciaForm((prev) => ({
                          ...prev,
                          alcanceCompleto: true,
                          idSeccion: 0,
                        }))
                      }
                      className={`p-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                        suplenciaForm.alcanceCompleto
                          ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-400 dark:border-amber-700 text-amber-900 dark:text-amber-200'
                          : 'bg-white dark:bg-[#121212] border-slate-200 dark:border-[#27272A] text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <span className="block text-[11px] font-bold">Todas las materias del titular</span>
                      <span className="block text-[10px] opacity-80">
                        Cubre automáticamente toda la carga académica asignada al titular
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setSuplenciaForm((prev) => ({
                          ...prev,
                          alcanceCompleto: false,
                          idSeccion: 0,
                        }))
                      }
                      className={`p-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                        !suplenciaForm.alcanceCompleto
                          ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-400 dark:border-amber-700 text-amber-900 dark:text-amber-200'
                          : 'bg-white dark:bg-[#121212] border-slate-200 dark:border-[#27272A] text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <span className="block text-[11px] font-bold">Materia específica</span>
                      <span className="block text-[10px] opacity-80">
                        Sustituye únicamente una asignatura seleccionada
                      </span>
                    </button>
                  </div>
                </div>

                {!suplenciaForm.alcanceCompleto && (
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Materia a Suplir
                    </label>
                    <select
                      value={suplenciaForm.idMateria}
                      onChange={(e) =>
                        setSuplenciaForm((prev) => ({
                          ...prev,
                          idMateria: Number(e.target.value),
                          idSeccion: 0,
                        }))
                      }
                      className="w-full bg-white dark:bg-[#121212] border border-slate-200 dark:border-[#27272A] rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 dark:text-[#F4F4F5]"
                    >
                      <option value={0}>Seleccione materia...</option>
                      {(() => {
                        const titularMatIds = new Set(
                          docenteMaterias
                            .filter((dm) => dm.idUsuario === suplenciaForm.idDocenteTitular)
                            .map((dm) => dm.idMateria)
                        );
                        const list =
                          titularMatIds.size > 0
                            ? materias.filter((m) => titularMatIds.has(m.idMateria))
                            : materias;
                        return list.map((m) => (
                          <option key={m.idMateria} value={m.idMateria}>
                            {m.nombreMateria} ({m.nombreNivel?.split(' - ')[0]})
                          </option>
                        ));
                      })()}
                    </select>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Sección (Opcional)
                    </label>
                    <select
                      value={suplenciaForm.idSeccion}
                      onChange={(e) =>
                        setSuplenciaForm((prev) => ({ ...prev, idSeccion: Number(e.target.value) }))
                      }
                      className="w-full bg-white dark:bg-[#121212] border border-slate-200 dark:border-[#27272A] rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 dark:text-[#F4F4F5]"
                    >
                      <option value={0}>Todas las secciones</option>
                      {(() => {
                        if (suplenciaForm.alcanceCompleto) {
                          const titularAnoIds = new Set(
                            docenteMaterias
                              .filter((dm) => dm.idUsuario === suplenciaForm.idDocenteTitular)
                              .map((dm) => materias.find((m) => m.idMateria === dm.idMateria)?.idAno ?? dm.idAno)
                              .filter((id): id is number => Boolean(id))
                          );
                          return secciones
                            .filter((s) => titularAnoIds.size === 0 || titularAnoIds.has(s.idAno))
                            .map((s) => (
                              <option key={s.idSeccion} value={s.idSeccion}>
                                {s.nombreNivel ? `${s.nombreNivel.split(' - ')[0]} - ` : ''}Sección {s.nombreSeccion}
                              </option>
                            ));
                        }
                        const selectedMat = materias.find(
                          (m) => m.idMateria === suplenciaForm.idMateria
                        );
                        return secciones
                          .filter((s) => !selectedMat || s.idAno === selectedMat.idAno)
                          .map((s) => (
                            <option key={s.idSeccion} value={s.idSeccion}>
                              Sección {s.nombreSeccion}
                            </option>
                          ));
                      })()}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Desde (Opcional)
                    </label>
                    <input
                      type="date"
                      value={suplenciaForm.fechaInicio}
                      onChange={(e) =>
                        setSuplenciaForm((prev) => ({ ...prev, fechaInicio: e.target.value }))
                      }
                      className="w-full bg-white dark:bg-[#121212] border border-slate-200 dark:border-[#27272A] rounded-xl px-3 py-2 text-xs font-mono text-slate-900 dark:text-[#F4F4F5]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Hasta (Opcional)
                    </label>
                    <input
                      type="date"
                      value={suplenciaForm.fechaFin}
                      onChange={(e) =>
                        setSuplenciaForm((prev) => ({ ...prev, fechaFin: e.target.value }))
                      }
                      className="w-full bg-white dark:bg-[#121212] border border-slate-200 dark:border-[#27272A] rounded-xl px-3 py-2 text-xs font-mono text-slate-900 dark:text-[#F4F4F5]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Motivo / Observación (Opcional)
                  </label>
                  <input
                    type="text"
                    maxLength={250}
                    placeholder="Ej: Reposo médico del docente titular por 5 días"
                    value={suplenciaForm.motivo}
                    onChange={(e) =>
                      setSuplenciaForm((prev) => ({ ...prev, motivo: e.target.value }))
                    }
                    className="w-full bg-white dark:bg-[#121212] border border-slate-200 dark:border-[#27272A] rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-[#F4F4F5]"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setSuplenciasModalUser(null)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#27272A] cursor-pointer"
                  >
                    Cerrar
                  </button>
                  <button
                    type="submit"
                    disabled={savingSuplencia}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{savingSuplencia ? 'Guardando...' : 'Asignar Suplencia'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
