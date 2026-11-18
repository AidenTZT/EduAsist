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
} from 'lucide-react';
import type { Usuario, RolUsuario } from '../types.ts';
import { createUser, updateUser, deleteUser, fetchUsers } from '../lib/api.ts';
import { validateNoNumbersInName } from '../lib/validation.ts';
import { formatCedula } from '../lib/utils.ts';

interface StaffManagerProps {
  currentUser: Usuario | null;
  staffUsers: Usuario[];
  onRefreshData: () => void;
}

export const StaffManager: React.FC<StaffManagerProps> = ({
  currentUser,
  staffUsers,
  onRefreshData,
}) => {
  const [localUsers, setLocalUsers] = useState<Usuario[]>(staffUsers);
  const [loadingLocal, setLoadingLocal] = useState<boolean>(false);

  React.useEffect(() => {
    if (staffUsers && staffUsers.length > 0) {
      setLocalUsers(staffUsers);
    }
  }, [staffUsers]);

  React.useEffect(() => {
    if (!staffUsers || staffUsers.length === 0) {
      setLoadingLocal(true);
      fetchUsers()
        .then((data) => {
          if (data && data.length > 0) {
            setLocalUsers(data);
          }
        })
        .catch(() => {})
        .finally(() => setLoadingLocal(false));
    }
  }, [staffUsers]);

  const activeUsersList = localUsers.length > 0 ? localUsers : staffUsers;

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
    password: '',
    activo: true,
  });
  const [showPassword, setShowPassword] = useState<boolean>(false);

  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<boolean>(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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

    if (!nombreCheck.valid || !apellidosCheck.valid || usuarioErr || passwordErr) {
      setValidationErrors({
        nombre: nombreCheck.error || '',
        apellidos: apellidosCheck.error || '',
        usuario: usuarioErr,
        password: passwordErr,
      });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      if (editItem) {
        await updateUser(editItem.id, {
          usuario: usuarioTrim || null,
          nombre: form.nombre.trim(),
          apellidos: form.apellidos.trim(),
          email: form.email.trim(),
          cedula: form.cedula.trim() || null,
          telefono: form.telefono.trim() || null,
          rol: form.rol,
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
          password: form.password.trim(),
          activo: form.activo,
        });
        setMessage({ type: 'success', text: 'Personal registrado exitosamente en la base de datos local' });
      }
      setModalOpen(false);
      onRefreshData();
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
      onRefreshData();
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
                Control jerárquico estricto: Directores, Coordinadores y Docentes de aula
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
              <option value="coordinador">Coordinadores</option>
              <option value="docente">Docentes</option>
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
                if (u.rol === 'director') roleColor = 'bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 border-purple-200 dark:border-purple-800 font-black';
                if (u.rol === 'coordinador') roleColor = 'bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800 font-bold';
                if (u.rol === 'docente') roleColor = 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 font-bold';

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
                      <span className={`inline-block px-3 py-0.5 rounded-full text-xs uppercase border ${roleColor}`}>
                        {u.rol}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {currentUser?.rol === 'director' ? (
                        <div className="space-x-1 inline-flex items-center">
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
                  onChange={(e) => setForm({ ...form, rol: e.target.value as RolUsuario })}
                  className="w-full bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-[#F4F4F5] rounded-xl px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="docente">Docente de Aula (Acceso solo a sus materias)</option>
                  <option value="coordinador">Coordinador (Gestión de docentes, materias y alumnos)</option>
                  {currentUser?.rol === 'director' && (
                    <option value="director">Director (Control total institucional)</option>
                  )}
                </select>
              </div>

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
    </div>
  );
};
