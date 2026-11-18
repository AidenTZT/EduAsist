/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Database,
  RefreshCw,
  AlertCircle,
  Server,
  Layers,
  ShieldCheck,
  Building,
  UserCheck,
  Clock,
  GraduationCap,
  ArrowLeft,
  CalendarCheck,
  Users,
  Sliders,
  X,
  UserCog,
  LogOut,
  DatabaseBackup,
} from 'lucide-react';
import { Navbar } from './components/Navbar.tsx';
import { StaffLogin } from './components/StaffLogin.tsx';
import { AttendanceManager } from './components/AttendanceManager.tsx';
import { StudentsDirectory } from './components/StudentsDirectory.tsx';
import { AttendanceAudit } from './components/AttendanceAudit.tsx';
import { AcademicManager } from './components/AcademicManager.tsx';
import { StaffManager } from './components/StaffManager.tsx';
import { ScheduleManager } from './components/ScheduleManager.tsx';
import { ParentPortal } from './components/ParentPortal.tsx';
import { BackupRestoreManager } from './components/BackupRestoreManager.tsx';
import {
  fetchAnosEscolares,
  fetchSecciones,
  fetchMaterias,
  fetchDocenteMaterias,
  fetchRepresentantes,
  fetchEstudiantes,
  fetchUsers,
  fetchAuthMe,
  logoutSession,
} from './lib/api.ts';
import type {
  AnoEscolar,
  Seccion,
  Materia,
  DocenteMateria,
  Representante,
  Estudiante,
  Usuario,
  LoginResponse,
} from './types.ts';

export default function App() {
  // Navigation: 'staff' (institutional panel) or 'representante' (parent portal)
  const [portalMode, setPortalMode] = useState<'staff' | 'representante'>('staff');

  type DocenteTab =
    | 'asistencia'
    | 'estudiantes'
    | 'horarios'
    | 'auditoria'
    | 'academico'
    | 'usuarios'
    | 'restauracion';

  const VALID_TABS: DocenteTab[] = [
    'asistencia',
    'estudiantes',
    'horarios',
    'auditoria',
    'academico',
    'usuarios',
    'restauracion',
  ];

  // Staff Sub-tabs: Read initial tab from URL hash if valid, otherwise default to 'horarios'
  const [activeDocenteTab, setActiveDocenteTab] = useState<DocenteTab>(() => {
    try {
      if (typeof window !== 'undefined' && window.location.hash) {
        const hashTab = window.location.hash.replace('#', '').trim().toLowerCase() as DocenteTab;
        if (VALID_TABS.includes(hashTab)) {
          return hashTab;
        }
      }
    } catch (_) {}
    return 'horarios';
  });

  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const handleHashChange = () => {
          const hashTab = window.location.hash.replace('#', '').trim().toLowerCase() as DocenteTab;
          if (VALID_TABS.includes(hashTab)) {
            setActiveDocenteTab(hashTab);
          }
        };
        window.addEventListener('hashchange', handleHashChange);
        return () => window.removeEventListener('hashchange', handleHashChange);
      }
    } catch (_) {}
  }, []);

  // Datos maestros desde el servidor institucional EduAsist
  const [anos, setAnos] = useState<AnoEscolar[]>([]);
  const [secciones, setSecciones] = useState<Seccion[]>([]);
  const [materias, setMaterias] = useState<Materia[]>([]);
  const [docenteMaterias, setDocenteMaterias] = useState<DocenteMateria[]>([]);
  const [representantes, setRepresentantes] = useState<Representante[]>([]);
  const [estudiantes, setEstudiantes] = useState<Estudiante[]>([]);
  const [staffUsers, setStaffUsers] = useState<Usuario[]>([]);

  // Authenticated Staff User (Director, Coordinador, or Docente)
  const [activeStaffUser, setActiveStaffUser] = useState<Usuario | null>(null);

  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && activeStaffUser) {
        const targetHash = `#${activeDocenteTab}`;
        if (window.location.hash !== targetHash) {
          window.history.replaceState(null, '', targetHash);
        }
      }
    } catch (_) {}
  }, [activeDocenteTab, activeStaffUser]);

  // Authenticated representative for parent portal
  const [currentRepresentante, setCurrentRepresentante] = useState<Representante | null>(null);

  // Mobile Bottom Navigation "Más" Drawer State
  const [mobileMoreDrawerOpen, setMobileMoreDrawerOpen] = useState<boolean>(false);

  // Modern Slate Dark Mode with safe localStorage access (iframe & storage partition safe)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const saved = localStorage.getItem('educontrol_theme');
        if (saved === 'dark' || saved === 'light') return saved;
      }
      return typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    } catch (_) {
      return 'dark';
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    if (theme === 'dark') {
      root.classList.add('dark');
      root.setAttribute('data-theme', 'dark');
      if (body) {
        body.classList.add('dark');
        body.setAttribute('data-theme', 'dark');
      }
    } else {
      root.classList.remove('dark');
      root.setAttribute('data-theme', 'light');
      if (body) {
        body.classList.remove('dark');
        body.setAttribute('data-theme', 'light');
      }
    }
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('educontrol_theme', theme);
      }
    } catch (_) {}
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Architecture modal
  const [showArchModal, setShowArchModal] = useState<boolean>(false);

  const portalModeRef = React.useRef<'staff' | 'representante'>(portalMode);
  useEffect(() => {
    portalModeRef.current = portalMode;
  }, [portalMode]);

  const loadAllData = async () => {
    setError(null);
    try {
      const [
        anosData,
        seccionesData,
        materiasData,
        docenteMateriasData,
        repsData,
        estsData,
        usersData,
      ] = await Promise.all([
        fetchAnosEscolares(),
        fetchSecciones(),
        fetchMaterias(),
        fetchDocenteMaterias(),
        fetchRepresentantes(),
        fetchEstudiantes(),
        fetchUsers(),
      ]);

      setAnos(anosData);
      setSecciones(seccionesData);
      setMaterias(materiasData);
      setDocenteMaterias(docenteMateriasData);
      setRepresentantes(repsData);
      setEstudiantes(estsData);
      setStaffUsers(usersData);
    } catch (err: any) {
      console.error('Error loading master data:', err);
      setError(
        err.message || 'No se pudo conectar con el servidor institucional. Compruebe la conexión.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    async function restoreSession() {
      try {
        const currentAuth = await fetchAuthMe();
        if (!active) return;

        if (currentAuth.authenticated) {
          if (currentAuth.type === 'staff' && currentAuth.user) {
            setActiveStaffUser(currentAuth.user);
            setCurrentRepresentante(null);
            setPortalMode('staff');
            await loadAllData();
          } else if (currentAuth.type === 'representante' && currentAuth.representante) {
            setCurrentRepresentante(currentAuth.representante);
            setActiveStaffUser(null);
            setPortalMode('representante');
            setLoading(false);
          } else {
            setLoading(false);
          }
        } else {
          setActiveStaffUser(null);
          setCurrentRepresentante(null);
          setLoading(false);
        }
      } catch (err: any) {
        console.error('Error restoring local session:', err);
        if (active) setLoading(false);
      }
    }
    restoreSession();
    return () => {
      active = false;
    };
  }, []);

  // Autenticación estricta por portal: cada formulario solo admite su rol correspondiente
  const handleAuthSuccess = async (response: LoginResponse) => {
    if (portalMode === 'staff' && response.type !== 'staff') {
      return;
    }
    if (portalMode === 'representante' && response.type !== 'representante') {
      return;
    }

    if (response.type === 'staff' && response.user) {
      setActiveStaffUser(response.user);
      setCurrentRepresentante(null);
      setActiveDocenteTab('horarios');
      setPortalMode('staff');
      setLoading(true);
      await loadAllData();
    } else if (response.type === 'representante' && response.representante) {
      setCurrentRepresentante(response.representante);
      setActiveStaffUser(null);
      setAnos([]);
      setSecciones([]);
      setMaterias([]);
      setDocenteMaterias([]);
      setRepresentantes([]);
      setEstudiantes([]);
      setStaffUsers([]);
      setPortalMode('representante');
      setLoading(false);
    }
  };

  // Strict Logout Handler: Destroy token and reset state to pristine state
  const handleLogoutStaff = async () => {
    try {
      await logoutSession();
    } catch (_) {}
    setActiveStaffUser(null);
    setCurrentRepresentante(null);
    setAnos([]);
    setSecciones([]);
    setMaterias([]);
    setDocenteMaterias([]);
    setRepresentantes([]);
    setEstudiantes([]);
    setStaffUsers([]);
    setActiveDocenteTab('horarios');
    setMobileMoreDrawerOpen(false);
    setPortalMode('staff');
  };

  const handleLogoutRepresentante = async () => {
    try {
      await logoutSession();
    } catch (_) {}
    setCurrentRepresentante(null);
    setActiveStaffUser(null);
    setPortalMode('representante');
  };

  const [attendanceTarget, setAttendanceTarget] = useState<{
    idAno?: number;
    idSeccion?: number;
    idMateria?: number;
    timestamp: number;
  } | null>(null);

  const handleGoToAttendanceFromSchedule = (materiaId?: number, seccionId?: number) => {
    if (materiaId || seccionId) {
      const secObj = secciones.find((s) => s.idSeccion === seccionId);
      const matObj = materias.find((m) => m.idMateria === materiaId);
      setAttendanceTarget({
        idAno: secObj?.idAno || matObj?.idAno,
        idSeccion: seccionId,
        idMateria: materiaId,
        timestamp: Date.now(),
      });
    }
    setActiveDocenteTab('asistencia');
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#000000] flex flex-col font-sans text-slate-900 dark:text-[#F4F4F5] transition-colors">
      {/* Responsive Navigation Header */}
      <Navbar
        currentView={portalMode === 'staff' ? 'docente' : 'representante'}
        onViewChange={(view) => {
          // Si hay algún usuario autenticado, bloquear cambio de portal hasta que cierre sesión
          if (activeStaffUser || currentRepresentante) {
            return;
          }
          if (view === 'docente') {
            setPortalMode('staff');
          } else {
            setPortalMode('representante');
          }
        }}
        activeDocenteTab={activeDocenteTab}
        onDocenteTabChange={(t) => setActiveDocenteTab(t)}
        activeUser={activeStaffUser}
        allStaffUsers={staffUsers}
        representanteAuthed={!!currentRepresentante}
        onLogoutRepresentante={handleLogoutRepresentante}
        onLogoutStaff={handleLogoutStaff}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      {/* Main Responsive Content with bottom padding to avoid Mobile Tab Bar overlap */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-5 pb-24 md:pb-6">
        {/* Loading Spinner */}
        {loading && (
          <div className="bg-white dark:bg-[#121212] rounded-3xl p-12 text-center border border-slate-200/90 dark:border-[#27272A] shadow-xs my-8 max-w-lg mx-auto">
            <RefreshCw className="w-8 h-8 animate-spin text-indigo-600 dark:text-indigo-400 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-800 dark:text-[#F4F4F5]">
              Verificando sesión y cargando datos...
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Sincronizando años escolares, secciones, materias, estudiantes, horarios y permisos RBAC.
            </p>
          </div>
        )}

        {/* Error Banner */}
        {error && !loading && (
          <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 p-4 rounded-2xl mb-6 flex items-start space-x-3">
            <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-sm font-bold text-rose-900 dark:text-rose-200">Error de conexión</h4>
              <p className="text-xs text-rose-700 dark:text-rose-300 mt-0.5">{error}</p>
              <button
                onClick={() => loadAllData()}
                className="mt-2 text-xs font-bold text-rose-800 dark:text-rose-300 underline hover:text-rose-950 dark:hover:text-rose-100 cursor-pointer"
              >
                Reintentar sincronización
              </button>
            </div>
          </div>
        )}

        {/* Portal 1: Staff Institutional Panel */}
        {!loading && portalMode === 'staff' && (
          <>
            {!activeStaffUser ? (
              /* CRITICAL REQUIREMENT 1: Only Institutional Login Form + Link to Parent Portal */
              <StaffLogin
                onLoginSuccess={handleAuthSuccess}
                onSwitchToRepresentante={() => setPortalMode('representante')}
              />
            ) : (
              /* Authenticated Staff Workspace */
              <div className="transition-all space-y-6">
                {/* Active Role Quick Banner with Pure OLED Styling */}
                <div className="bg-white dark:bg-[#121212] rounded-2xl px-4 py-3 border border-slate-200/90 dark:border-[#27272A] flex flex-wrap items-center justify-between gap-3 shadow-2xs">
                  <div className="flex items-center space-x-2.5">
                    <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                      {activeStaffUser.nombre[0]}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-800 dark:text-[#F4F4F5]">
                        Sesión activa: {activeStaffUser.nombre} {activeStaffUser.apellidos}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Rol:{' '}
                        <span className="font-extrabold uppercase text-indigo-700 dark:text-indigo-400">
                          {activeStaffUser.rol}
                        </span>{' '}
                        • Permisos de{' '}
                        {activeStaffUser.rol === 'director'
                          ? 'Dirección General (Control Total)'
                          : activeStaffUser.rol === 'coordinador'
                          ? 'Coordinación Académica (Asistencia, Justificaciones, Materias & Horarios)'
                          : 'Docente de Aula (Materias Asignadas)'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={handleLogoutStaff}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-400 hover:text-rose-700 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-900 transition-colors cursor-pointer"
                    >
                      Cerrar Sesión
                    </button>
                  </div>
                </div>

                {/* Sub-Tabs Components */}
                {activeDocenteTab === 'horarios' && (
                  <ScheduleManager
                    anos={anos}
                    secciones={secciones}
                    materias={materias}
                    docenteMaterias={docenteMaterias}
                    staffUsers={staffUsers}
                    currentUser={activeStaffUser}
                    onGoToAttendance={handleGoToAttendanceFromSchedule}
                  />
                )}

                {activeDocenteTab === 'asistencia' && (
                  <AttendanceManager
                    anos={anos}
                    secciones={secciones}
                    materias={materias}
                    docenteMaterias={docenteMaterias}
                    estudiantes={estudiantes}
                    currentUser={activeStaffUser}
                    onRefreshData={loadAllData}
                    preselectedTarget={attendanceTarget}
                  />
                )}

                {activeDocenteTab === 'estudiantes' && (
                  <StudentsDirectory
                    anos={anos}
                    secciones={secciones}
                    representantes={representantes}
                    estudiantes={estudiantes}
                    currentUser={activeStaffUser}
                    onRefreshData={loadAllData}
                  />
                )}

                {activeDocenteTab === 'auditoria' && (
                  <AttendanceAudit
                    anos={anos}
                    secciones={secciones}
                    materias={materias}
                    currentUser={activeStaffUser}
                  />
                )}

                {activeDocenteTab === 'academico' && (
                  <AcademicManager
                    anos={anos}
                    secciones={secciones}
                    materias={materias}
                    docenteMaterias={docenteMaterias}
                    staffUsers={staffUsers}
                    currentUser={activeStaffUser}
                    onRefreshData={loadAllData}
                  />
                )}

                {activeDocenteTab === 'usuarios' && (
                  <StaffManager
                    currentUser={activeStaffUser}
                    staffUsers={staffUsers}
                    onRefreshData={loadAllData}
                  />
                )}

                {activeDocenteTab === 'restauracion' && activeStaffUser?.rol === 'director' && (
                  <BackupRestoreManager
                    currentUser={activeStaffUser}
                    onRefreshData={loadAllData}
                  />
                )}
              </div>
            )}
          </>
        )}

        {/* Portal 2: Parent Portal */}
        {!loading && portalMode === 'representante' && (
          <div className="transition-all">
            {!currentRepresentante && (
              <div className="mb-4">
                <button
                  type="button"
                  onClick={() => setPortalMode('staff')}
                  className="inline-flex items-center space-x-1.5 text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Volver a Acceso Institucional</span>
                </button>
              </div>
            )}

            <ParentPortal
              initialRepresentante={currentRepresentante}
              onAuthSuccess={handleAuthSuccess}
              onLogout={handleLogoutRepresentante}
              availableRepresentantes={representantes}
              onSwitchToStaff={() => {
                if (!currentRepresentante) {
                  setPortalMode('staff');
                }
              }}
            />
          </div>
        )}
      </main>

      {/* CRITICAL REQUIREMENT 5: Fixed Mobile Bottom Tab Bar (< md) for Authenticated Staff */}
      {!loading && portalMode === 'staff' && activeStaffUser && (
        <nav className="fixed bottom-0 inset-x-0 z-30 md:hidden bg-white/95 dark:bg-[#121212]/95 border-t border-slate-200 dark:border-[#27272A] backdrop-blur-md shadow-lg transition-colors">
          <div className="grid grid-cols-4 h-16 max-w-md mx-auto">
            {/* 1. Horarios */}
            <button
              type="button"
              onClick={() => setActiveDocenteTab('horarios')}
              className={`flex flex-col items-center justify-center py-1 transition-colors cursor-pointer ${
                activeDocenteTab === 'horarios'
                  ? 'text-indigo-600 dark:text-indigo-400 font-extrabold'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Clock className="w-5 h-5" />
              <span className="text-[10px] mt-1 leading-none">Horarios</span>
            </button>

            {/* 2. Asistencia */}
            <button
              type="button"
              onClick={() => setActiveDocenteTab('asistencia')}
              className={`flex flex-col items-center justify-center py-1 transition-colors cursor-pointer ${
                activeDocenteTab === 'asistencia'
                  ? 'text-indigo-600 dark:text-indigo-400 font-extrabold'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <CalendarCheck className="w-5 h-5" />
              <span className="text-[10px] mt-1 leading-none">Asistencia</span>
            </button>

            {/* 3. Estudiantes */}
            <button
              type="button"
              onClick={() => setActiveDocenteTab('estudiantes')}
              className={`flex flex-col items-center justify-center py-1 transition-colors cursor-pointer ${
                activeDocenteTab === 'estudiantes'
                  ? 'text-indigo-600 dark:text-indigo-400 font-extrabold'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Users className="w-5 h-5" />
              <span className="text-[10px] mt-1 leading-none">Alumnos</span>
            </button>

            {/* 5. Más / Opciones Administrativas */}
            <button
              type="button"
              onClick={() => setMobileMoreDrawerOpen(true)}
              className={`flex flex-col items-center justify-center py-1 transition-colors cursor-pointer ${
                ['auditoria', 'academico', 'usuarios', 'restauracion'].includes(activeDocenteTab)
                  ? 'text-purple-600 dark:text-purple-400 font-extrabold'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Sliders className="w-5 h-5" />
              <span className="text-[10px] mt-1 leading-none">Más</span>
            </button>
          </div>
        </nav>
      )}

      {/* Mobile "Más" Bottom Sheet / Action Drawer */}
      {mobileMoreDrawerOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white dark:bg-[#121212] w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border border-slate-200 dark:border-[#27272A] shadow-2xl p-5 space-y-4 animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-[#27272A]">
              <div className="flex items-center space-x-2">
                <div className="p-2 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-xl">
                  <Sliders className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-[#F4F4F5]">
                  Módulos y Opciones del Sistema
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setMobileMoreDrawerOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => {
                  setActiveDocenteTab('auditoria');
                  setMobileMoreDrawerOpen(false);
                }}
                className={`w-full text-left px-3.5 py-3 rounded-xl text-xs font-bold flex items-center space-x-2.5 transition-colors ${
                  activeDocenteTab === 'auditoria'
                    ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#181818]'
                }`}
              >
                <Clock className="w-4 h-4 text-amber-500" />
                <span>Auditoría de Horas de Entrada</span>
              </button>

              {(activeStaffUser?.rol === 'director' || activeStaffUser?.rol === 'coordinador') && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveDocenteTab('academico');
                    setMobileMoreDrawerOpen(false);
                  }}
                  className={`w-full text-left px-3.5 py-3 rounded-xl text-xs font-bold flex items-center space-x-2.5 transition-colors ${
                    activeDocenteTab === 'academico'
                      ? 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#181818]'
                  }`}
                >
                  <Building className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  <span>Niveles, Secciones & Materias</span>
                </button>
              )}

              {(activeStaffUser?.rol === 'director' || activeStaffUser?.rol === 'coordinador') && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveDocenteTab('usuarios');
                    setMobileMoreDrawerOpen(false);
                  }}
                  className={`w-full text-left px-3.5 py-3 rounded-xl text-xs font-bold flex items-center space-x-2.5 transition-colors ${
                    activeDocenteTab === 'usuarios'
                      ? 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#181818]'
                  }`}
                >
                  <UserCog className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  <span>Gestión de Personal & Roles</span>
                </button>
              )}

              {activeStaffUser?.rol === 'director' && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveDocenteTab('restauracion');
                    setMobileMoreDrawerOpen(false);
                  }}
                  className={`w-full text-left px-3.5 py-3 rounded-xl text-xs font-bold flex items-center space-x-2.5 transition-colors ${
                    activeDocenteTab === 'restauracion'
                      ? 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#181818]'
                  }`}
                >
                    <DatabaseBackup className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                    <span>Respaldo & Restauración BD</span>
                  </button>
              )}

              <div className="pt-2 border-t border-slate-100 dark:border-[#27272A] flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowArchModal(true);
                    setMobileMoreDrawerOpen(false);
                  }}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-slate-100 dark:bg-[#181818] text-slate-700 dark:text-slate-300 text-xs font-bold flex items-center justify-center space-x-1.5"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Arquitectura Cloud</span>
                </button>
                <button
                  type="button"
                  onClick={handleLogoutStaff}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 text-xs font-bold flex items-center justify-center space-x-1.5 border border-rose-200 dark:border-rose-900"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Cerrar Sesión</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Responsive Footer with Cloud Architecture & OLED Colors */}
      <footer className="bg-white dark:bg-[#000000] border-t border-slate-200 dark:border-[#27272A] mt-auto py-5 text-xs text-slate-500 dark:text-slate-400 transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-center sm:text-left">
            <span className="flex items-center space-x-1.5 font-semibold text-slate-700 dark:text-slate-300">
              <Database className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>EduAsist • Autenticación Local BD</span>
            </span>
            <span className="hidden sm:inline text-slate-300 dark:text-slate-700">•</span>
            <span className="font-medium">
              Portal Activo:{' '}
              <strong className="text-indigo-700 dark:text-indigo-400 uppercase">
                {portalMode === 'staff'
                  ? `Institucional (${activeStaffUser?.rol || 'No autenticado'})`
                  : 'Representantes'}
              </strong>
            </span>
            <span className="hidden sm:inline text-slate-300 dark:text-slate-700">•</span>
            <span className="text-emerald-700 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
              Sesión Segura Bcrypt + JWT
            </span>
          </div>

          <div className="flex items-center space-x-4">
            <span className="text-slate-400 dark:text-slate-600">EduAsist © 2026</span>
          </div>
        </div>
      </footer>

      {/* Cloud Architecture & Relational Schema Modal */}
      {showArchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-[#121212] rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200 dark:border-[#27272A] max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-[#27272A] pb-4 mb-4">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-xl">
                  <Server className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900 dark:text-[#F4F4F5]">
                    Esquema de Base de Datos &amp; Reglas de Seguridad RBAC
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Autenticación local por credenciales con Bcrypt, cookies HttpOnly JWT, jerarquía RBAC y validaciones estrictas
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowArchModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm font-bold px-2 py-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="bg-slate-900 dark:bg-[#0a0a0a] text-slate-100 p-4 rounded-2xl font-mono text-[11px] overflow-x-auto border border-slate-800 dark:border-[#27272A]">
                <p className="text-emerald-400">// Entidades Principales del Sistema EduAsist:</p>
                <p className="mt-1">1. anos_escolares (idAno, nombreNivel, activo)</p>
                <p>2. secciones (idSeccion, idAno, nombreSeccion)</p>
                <p>3. materias (idMateria, idAno, nombreMateria) [Pensum MPPE 1er-5to Año]</p>
                <p>4. docente_materias (idAsignacion, idUsuario, idMateria)</p>
                <p>5. representantes (idRepresentante, usuario, cedula, nombres, apellidos, telefono, email, passwordHash, activo)</p>
                <p>6. estudiantes (idEstudiante, cedula, nombres, apellidos, idAnoActual, idSeccion, idRepresentante)</p>
                <p>7. asistencia (idAsistencia, idEstudiante, idMateria, fecha, horaEntrada, estado)</p>
                <p>8. users (id, uid, usuario, email, passwordHash, rol [&apos;director&apos;, &apos;coordinador&apos;, &apos;docente&apos;], activo, nombre, apellidos)</p>
                <p>9. horarios (idHorario, idAno, idSeccion, idMateria, diaSemana, horaInicio, horaFin, aula)</p>
                <p className="text-amber-400 font-bold mt-1">10. recesos_institucionales (idReceso, nombre, horaInicio, horaFin, activo)</p>
              </div>

              <div className="bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900 p-3.5 rounded-2xl text-indigo-950 dark:text-indigo-200">
                <h4 className="font-bold flex items-center space-x-1.5 mb-1 text-xs">
                  <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>Redefinición Estricta de Permisos y Roles (RBAC)</span>
                </h4>
                <ul className="list-disc list-inside space-y-1 text-[11px] text-indigo-900 dark:text-indigo-300">
                  <li>
                    <strong>Director:</strong> Control total del sistema, configuración institucional, auditoría de asistencia y gestión de personal.
                  </li>
                  <li>
                    <strong>Coordinador:</strong> Pase de asistencia, justificaciones y reposos médicos, gestión académica (materias, secciones, horarios) y representantes.
                  </li>
                  <li>
                    <strong>Docente:</strong> Pase de lista y control de asistencia restringido a sus materias asignadas.
                  </li>
                  <li>
                    <strong>Representante:</strong> Portal dedicado para seguimiento en tiempo real del historial de asistencia y horarios escolares.
                  </li>
                </ul>
              </div>

              <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 p-3.5 rounded-2xl text-emerald-950 dark:text-emerald-200">
                <h4 className="font-bold flex items-center space-x-1.5 mb-1 text-xs">
                  <Clock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Módulo de Horarios & Radar "En Clase Ahora"</span>
                </h4>
                <p className="text-[11px] text-emerald-900 dark:text-emerald-300">
                  Malla horaria con resolución automática de colisiones y detección de actividad escolar en tiempo real.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
