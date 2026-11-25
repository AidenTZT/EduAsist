import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  GraduationCap,
  Database,
  Users,
  ShieldCheck,
  Clock,
  BookOpen,
  CalendarCheck,
  Menu,
  X,
  UserCheck,
  Building,
  UserCog,
  LogOut,
  Sun,
  Moon,
  DatabaseBackup,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton.tsx';
import { InstallPWAButton } from './InstallPWAButton.tsx';
import type { Usuario, RolUsuario } from '../types.ts';

interface NavbarProps {
  currentView: 'portal-selector' | 'docente' | 'representante';
  onViewChange: (view: 'portal-selector' | 'docente' | 'representante') => void;
  activeDocenteTab: 'asistencia' | 'estudiantes' | 'horarios' | 'auditoria' | 'academico' | 'usuarios' | 'restauracion';
  onDocenteTabChange: (tab: 'asistencia' | 'estudiantes' | 'horarios' | 'auditoria' | 'academico' | 'usuarios' | 'restauracion') => void;
  activeUser: Usuario | null;
  allStaffUsers: Usuario[];
  onSelectStaffUser?: (user: Usuario) => void;
  representanteAuthed: boolean;
  onLogoutRepresentante: () => void;
  onLogoutStaff: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  onViewChange,
  activeDocenteTab,
  onDocenteTabChange,
  activeUser,
  representanteAuthed,
  onLogoutRepresentante,
  onLogoutStaff,
  theme,
  onToggleTheme,
}) => {
  const [serverTime, setServerTime] = useState<string>('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  const navCarouselRef = useRef<HTMLDivElement | null>(null);
  const [navScrollState, setNavScrollState] = useState<{
    canScrollLeft: boolean;
    canScrollRight: boolean;
    hasOverflow: boolean;
  }>({ canScrollLeft: false, canScrollRight: false, hasOverflow: false });

  const updateNavScrollState = useCallback(() => {
    const el = navCarouselRef.current;
    if (!el) return;
    const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
    const hasOverflow = maxScroll > 4;
    setNavScrollState({
      hasOverflow,
      canScrollLeft: el.scrollLeft > 4,
      canScrollRight: el.scrollLeft < maxScroll - 4,
    });
  }, []);

  useEffect(() => {
    updateNavScrollState();
    const el = navCarouselRef.current;
    let observer: ResizeObserver | null = null;
    if (el && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => updateNavScrollState());
      observer.observe(el);
    }
    window.addEventListener('resize', updateNavScrollState);

    const handleWheel = (e: WheelEvent) => {
      if (!el) return;
      const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
      if (maxScroll <= 4) return;
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        el.scrollLeft += e.deltaY;
        e.preventDefault();
      }
    };
    el?.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateNavScrollState);
      el?.removeEventListener('wheel', handleWheel);
    };
  }, [updateNavScrollState, currentView, activeUser?.rol, activeUser?.id]);

  useEffect(() => {
    const el = navCarouselRef.current;
    if (!el) return;
    const activeBtn = el.querySelector<HTMLButtonElement>('[aria-selected="true"]');
    if (activeBtn) {
      activeBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [activeDocenteTab]);

  const scrollNavBy = (direction: 'left' | 'right') => {
    const el = navCarouselRef.current;
    if (!el) return;
    const step = Math.max(220, Math.round(el.clientWidth * 0.65));
    el.scrollBy({
      left: direction === 'left' ? -step : step,
      behavior: 'smooth',
    });
  };

  const handleSelectNavTab = (
    tab: 'asistencia' | 'estudiantes' | 'horarios' | 'auditoria' | 'academico' | 'usuarios' | 'restauracion',
    targetEl?: HTMLButtonElement | null
  ) => {
    onDocenteTabChange(tab);
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  };

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setServerTime(now.toLocaleTimeString('es-VE', { hour12: false }));
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  const getRoleBadge = (rol: RolUsuario) => {
    switch (rol) {
      case 'director':
        return {
          label: 'Director General',
          bg: 'bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 border-purple-200 dark:border-purple-800',
          dot: 'bg-purple-600 dark:bg-purple-400',
        };
      case 'coordinador':
        return {
          label: 'Coordinador Académico',
          bg: 'bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800',
          dot: 'bg-blue-600 dark:bg-blue-400',
        };
      case 'docente':
      default:
        return {
          label: 'Docente de Aula',
          bg: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
          dot: 'bg-emerald-600 dark:bg-emerald-400',
        };
    }
  };

  const isAnyUserAuthenticated = !!activeUser || !!representanteAuthed;
  const currentRoleInfo = activeUser ? getRoleBadge(activeUser.rol) : null;

  return (
    <header className="sticky top-0 z-40 bg-white dark:bg-[#000000] border-b border-slate-200 dark:border-[#27272A] shadow-xs transition-colors">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-2 h-16">
          {/* Logo & Mobile Menu Trigger */}
          <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
            {/* Mobile menu trigger */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-1.5 sm:p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#181818] focus:outline-none transition-colors shrink-0"
              aria-label="Menú principal"
            >
              {mobileMenuOpen ? <X className="w-5 h-5 sm:w-6 sm:h-6" /> : <Menu className="w-5 h-5 sm:w-6 sm:h-6" />}
            </button>

            <button
              onClick={() => {
                // If staff is authenticated, clicking logo goes to default Horarios
                if (activeUser) {
                  onDocenteTabChange('horarios');
                  onViewChange('docente');
                } else if (representanteAuthed) {
                  onViewChange('representante');
                } else {
                  onViewChange('docente');
                }
              }}
              className="flex items-center space-x-2 sm:space-x-3 text-left focus:outline-none group cursor-pointer min-w-0"
              title="EduAsist"
            >
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-linear-to-tr from-indigo-600 to-blue-600 flex items-center justify-center text-white shadow-md shadow-indigo-100 dark:shadow-none shrink-0 group-hover:scale-105 transition-transform">
                <GraduationCap className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>

              <div className="min-w-0">
                <div className="flex items-center space-x-1.5 sm:space-x-2">
                  <span className="font-extrabold text-sm sm:text-lg tracking-tight text-slate-900 dark:text-[#F4F4F5] truncate">
                    EduAsist <span className="hidden sm:inline text-indigo-600 dark:text-indigo-400 font-black">Escolar</span>
                  </span>
                  <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                    <Database className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                    Base de Datos
                  </span>
                </div>
                <p className="hidden sm:block text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                  Control de Asistencia & RBAC Multi-Rol
                </p>
              </div>
            </button>
          </div>

          {/* Center: Portal Switcher (ONLY VISIBLE IN LOGIN SCENARIO - DISAPPEARS COMPLETELY ONCE ANY USER IS AUTHENTICATED) */}
          {!isAnyUserAuthenticated && (
            <div className="hidden sm:flex items-center bg-slate-100 dark:bg-[#181818] p-1 rounded-xl border border-slate-200/80 dark:border-[#27272A]">
              <button
                onClick={() => onViewChange('docente')}
                className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  currentView === 'docente'
                    ? 'bg-white dark:bg-[#121212] text-indigo-700 dark:text-indigo-400 shadow-xs border border-slate-200/60 dark:border-[#27272A]'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <BookOpen className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span>Panel Institucional</span>
              </button>
              <button
                onClick={() => onViewChange('representante')}
                className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  currentView === 'representante'
                    ? 'bg-white dark:bg-[#121212] text-emerald-700 dark:text-emerald-400 shadow-xs border border-slate-200/60 dark:border-[#27272A]'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Portal del Representante</span>
              </button>
            </div>
          )}

          {/* Right: Active Role, Clock, Theme & Logout */}
          <div className="flex items-center gap-1 sm:gap-2.5 shrink-0">
            {/* Live Server Clock */}
            <div className="hidden sm:flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] text-xs font-mono text-slate-700 dark:text-slate-300">
              <Clock className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
              <span className="font-bold">{serverTime || '--:--:--'}</span>
            </div>

            {/* Active User Identity Badge (Only when authenticated as Staff) */}
            {currentView === 'docente' && activeUser && (
              <div className="hidden sm:flex items-center space-x-2 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#181818] text-left">
                <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                  {activeUser.nombre[0]}
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-800 dark:text-[#F4F4F5] leading-tight">
                    {activeUser.nombre} {activeUser.apellidos}
                  </p>
                  <span
                    className={`inline-block px-1.5 py-0.2 rounded text-[10px] font-bold uppercase border ${
                      currentRoleInfo?.bg
                    }`}
                  >
                    {currentRoleInfo?.label}
                  </span>
                </div>
              </div>
            )}

            {/* PWA Install Button (Always visible on mobile, tablet & desktop) */}
            <PWAInstallButton />

            {/* OLED Dark Mode Toggle */}
            <button
              type="button"
              onClick={onToggleTheme}
              className="p-2 sm:p-2.5 rounded-xl text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-[#181818] hover:bg-slate-200 dark:hover:bg-[#27272A] border border-slate-200 dark:border-[#27272A] transition-colors cursor-pointer flex items-center justify-center min-w-[36px] min-h-[36px] sm:min-w-[38px] sm:min-h-[38px]"
              title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro OLED (Negro Puro #000000)'}
              aria-label="Alternar modo oscuro / claro"
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-slate-600" />
              )}
            </button>

            {/* Logout Buttons for Each Portal (Strict Session Control) */}
            {currentView === 'docente' && activeUser && (
              <button
                type="button"
                onClick={onLogoutStaff}
                className="text-[11px] sm:text-xs font-bold text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 px-2 sm:px-3 py-2 rounded-xl border border-rose-200 dark:border-rose-900 transition-colors flex items-center space-x-1 sm:space-x-1.5 cursor-pointer shadow-2xs"
                title="Cerrar sesión institucional y destruir credenciales"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Cerrar Sesión</span>
                <span className="sm:hidden">Salir</span>
              </button>
            )}

            {currentView === 'representante' && representanteAuthed && (
              <button
                type="button"
                onClick={onLogoutRepresentante}
                className="text-[11px] sm:text-xs font-bold text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 px-2 sm:px-3 py-2 rounded-xl border border-rose-200 dark:border-rose-900 transition-colors flex items-center space-x-1 sm:space-x-1.5 cursor-pointer shadow-2xs"
                title="Cerrar sesión de representante"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Cerrar Sesión</span>
                <span className="sm:hidden">Salir</span>
              </button>
            )}
          </div>
        </div>

        {/* Sub-nav Carousel for Desktop & Tablet Docente Tabs (ONLY shown when staff user is authenticated) */}
        {currentView === 'docente' && activeUser && (
          <div className="hidden md:block border-t border-slate-100 dark:border-[#27272A] py-2">
            <div className="flex items-center gap-1.5">
              {navScrollState.hasOverflow && (
                <button
                  type="button"
                  onClick={() => scrollNavBy('left')}
                  disabled={!navScrollState.canScrollLeft}
                  aria-label="Desplazar módulos a la izquierda"
                  className="shrink-0 w-8 h-8 rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#181818] text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-[#222226] disabled:opacity-35 disabled:cursor-not-allowed flex items-center justify-center transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}

              <div className="relative flex-1 min-w-0">
                {navScrollState.canScrollLeft && (
                  <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-5 z-10 bg-gradient-to-r from-white dark:from-[#000000] to-transparent" />
                )}

                <div
                  ref={navCarouselRef}
                  role="tablist"
                  aria-label="Módulos del Panel Institucional"
                  onScroll={updateNavScrollState}
                  className="flex items-center space-x-1.5 overflow-x-auto scrollbar-none scroll-smooth snap-x snap-mandatory py-0.5 px-0.5"
                >
                  {/* Primary Module: Horarios & En Clase Ahora */}
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeDocenteTab === 'horarios'}
                    onClick={(e) => handleSelectNavTab('horarios', e.currentTarget)}
                    className={`shrink-0 snap-start flex items-center space-x-1.5 px-3 py-1.5 min-h-[34px] rounded-lg text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                      activeDocenteTab === 'horarios'
                        ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-400 font-extrabold border border-indigo-200/60 dark:border-indigo-800'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#181818]'
                    }`}
                  >
                    <Clock className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>Horarios & En Clase Ahora</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                  </button>

                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeDocenteTab === 'asistencia'}
                    onClick={(e) => handleSelectNavTab('asistencia', e.currentTarget)}
                    className={`shrink-0 snap-start flex items-center space-x-1.5 px-3 py-1.5 min-h-[34px] rounded-lg text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                      activeDocenteTab === 'asistencia'
                        ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-400 font-extrabold border border-indigo-200/60 dark:border-indigo-800'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#181818]'
                    }`}
                  >
                    <CalendarCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                    <span>Pase de Asistencia</span>
                  </button>

                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeDocenteTab === 'estudiantes'}
                    onClick={(e) => handleSelectNavTab('estudiantes', e.currentTarget)}
                    className={`shrink-0 snap-start flex items-center space-x-1.5 px-3 py-1.5 min-h-[34px] rounded-lg text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                      activeDocenteTab === 'estudiantes'
                        ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-400 font-extrabold border border-indigo-200/60 dark:border-indigo-800'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#181818]'
                    }`}
                  >
                    <Users className="w-4 h-4 text-slate-600 dark:text-slate-400 shrink-0" />
                    <span>Estudiantes & Representantes</span>
                  </button>

                  {/* Asistencia General & Auditoría (ROL EXCLUSIVO: DIRECTOR Y COORDINADOR) */}
                  {(activeUser?.rol === 'director' || activeUser?.rol === 'coordinador') && (
                    <button
                      type="button"
                      role="tab"
                      aria-selected={activeDocenteTab === 'auditoria'}
                      onClick={(e) => handleSelectNavTab('auditoria', e.currentTarget)}
                      className={`shrink-0 snap-start flex items-center space-x-1.5 px-3 py-1.5 min-h-[34px] rounded-lg text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                        activeDocenteTab === 'auditoria'
                          ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-400 font-extrabold border border-indigo-200/60 dark:border-indigo-800'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#181818]'
                      }`}
                    >
                      <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                      <span>Asistencia General & Auditoría</span>
                    </button>
                  )}

                  {/* Admin Tabs: Academic Structure (Director AND Coordinador) */}
                  {(activeUser?.rol === 'director' || activeUser?.rol === 'coordinador') && (
                    <button
                      type="button"
                      role="tab"
                      aria-selected={activeDocenteTab === 'academico'}
                      onClick={(e) => handleSelectNavTab('academico', e.currentTarget)}
                      className={`shrink-0 snap-start flex items-center space-x-1.5 px-3 py-1.5 min-h-[34px] rounded-lg text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                        activeDocenteTab === 'academico'
                          ? 'bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 font-extrabold border border-purple-200/60 dark:border-purple-800'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#181818]'
                      }`}
                    >
                      <Building className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                      <span>Niveles, Secciones & Materias</span>
                    </button>
                  )}

                  {/* Strict RBAC: Staff & User Management for Director and Coordinador */}
                  {(activeUser?.rol === 'director' || activeUser?.rol === 'coordinador') && (
                    <button
                      type="button"
                      role="tab"
                      aria-selected={activeDocenteTab === 'usuarios'}
                      onClick={(e) => handleSelectNavTab('usuarios', e.currentTarget)}
                      className={`shrink-0 snap-start flex items-center space-x-1.5 px-3 py-1.5 min-h-[34px] rounded-lg text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                        activeDocenteTab === 'usuarios'
                          ? 'bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 font-extrabold border border-purple-200/60 dark:border-purple-800'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#181818]'
                      }`}
                    >
                      <UserCog className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                      <span>Gestión de Personal & Roles</span>
                    </button>
                  )}

                  {activeUser?.rol === 'director' && (
                    <button
                      type="button"
                      role="tab"
                      aria-selected={activeDocenteTab === 'restauracion'}
                      onClick={(e) => handleSelectNavTab('restauracion', e.currentTarget)}
                      className={`shrink-0 snap-start flex items-center space-x-1.5 px-3 py-1.5 min-h-[34px] rounded-lg text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                        activeDocenteTab === 'restauracion'
                          ? 'bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 font-extrabold border border-purple-200/60 dark:border-purple-800'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#181818]'
                      }`}
                    >
                      <DatabaseBackup className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                      <span>Respaldo & Restauración</span>
                    </button>
                  )}
                </div>

                {navScrollState.canScrollRight && (
                  <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-5 z-10 bg-gradient-to-l from-white dark:from-[#000000] to-transparent" />
                )}
              </div>

              {navScrollState.hasOverflow && (
                <button
                  type="button"
                  onClick={() => scrollNavBy('right')}
                  disabled={!navScrollState.canScrollRight}
                  aria-label="Desplazar módulos a la derecha"
                  className="shrink-0 w-8 h-8 rounded-lg border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#181818] text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-[#222226] disabled:opacity-35 disabled:cursor-not-allowed flex items-center justify-center transition-colors cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Mobile Drawer / Collapsible Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121212] px-4 pt-3 pb-6 space-y-4 shadow-xl animate-in slide-in-from-top duration-200">
          {/* Portal Switcher in Mobile Drawer (ONLY VISIBLE IN LOGIN SCENARIO - DISAPPEARS COMPLETELY ONCE ANY USER IS AUTHENTICATED) */}
          {!isAnyUserAuthenticated && (
            <div className="flex bg-slate-100 dark:bg-[#181818] p-1 rounded-xl border border-slate-200/60 dark:border-[#27272A]">
              <button
                onClick={() => {
                  onViewChange('docente');
                  setMobileMenuOpen(false);
                }}
                className={`flex-1 py-2 text-xs font-bold rounded-lg text-center transition-all ${
                  currentView === 'docente'
                    ? 'bg-white dark:bg-[#27272A] text-indigo-700 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Panel Institucional
              </button>
              <button
                onClick={() => {
                  onViewChange('representante');
                  setMobileMenuOpen(false);
                }}
                className={`flex-1 py-2 text-xs font-bold rounded-lg text-center transition-all ${
                  currentView === 'representante'
                    ? 'bg-white dark:bg-[#27272A] text-emerald-700 dark:text-emerald-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Portal Representante
              </button>
            </div>
          )}

          {/* CRITICAL SECURITY: Only show internal module links if activeUser is logged in */}
          {currentView === 'docente' && activeUser ? (
            <div className="space-y-1">
              <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-2">
                Módulos del Sistema
              </p>

              <button
                onClick={() => {
                  onDocenteTabChange('horarios');
                  setMobileMenuOpen(false);
                }}
                className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-semibold flex items-center space-x-2.5 ${
                  activeDocenteTab === 'horarios'
                    ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400 font-bold border border-indigo-200/60 dark:border-indigo-800'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#181818]'
                }`}
              >
                <Clock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Horarios & En Clase Ahora</span>
              </button>

              <button
                onClick={() => {
                  onDocenteTabChange('asistencia');
                  setMobileMenuOpen(false);
                }}
                className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-semibold flex items-center space-x-2.5 ${
                  activeDocenteTab === 'asistencia'
                    ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400 font-bold border border-indigo-200/60 dark:border-indigo-800'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#181818]'
                }`}
              >
                <CalendarCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span>Pase de Asistencia Rápido</span>
              </button>

              <button
                onClick={() => {
                  onDocenteTabChange('estudiantes');
                  setMobileMenuOpen(false);
                }}
                className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-semibold flex items-center space-x-2.5 ${
                  activeDocenteTab === 'estudiantes'
                    ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400 font-bold border border-indigo-200/60 dark:border-indigo-800'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#181818]'
                }`}
              >
                <Users className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                <span>Estudiantes & Representantes</span>
              </button>

              {(activeUser?.rol === 'director' || activeUser?.rol === 'coordinador') && (
                <>
                  <button
                    onClick={() => {
                      onDocenteTabChange('auditoria');
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-semibold flex items-center space-x-2.5 ${
                      activeDocenteTab === 'auditoria'
                        ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400 font-bold border border-indigo-200/60 dark:border-indigo-800'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#181818]'
                    }`}
                  >
                    <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    <span>Asistencia General & Auditoría</span>
                  </button>
                </>
              )}

              {(activeUser?.rol === 'director' || activeUser?.rol === 'coordinador') && (
                <>
                  <div className="pt-2 border-t border-slate-100 dark:border-[#27272A]">
                    <p className="text-[11px] font-bold text-purple-700 dark:text-purple-400 uppercase tracking-wider px-2">
                      Administración Institucional
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      onDocenteTabChange('academico');
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-semibold flex items-center space-x-2.5 ${
                      activeDocenteTab === 'academico'
                        ? 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 font-bold border border-purple-200/60 dark:border-purple-800'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#181818]'
                    }`}
                  >
                    <Building className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                    <span>Niveles, Secciones & Materias</span>
                  </button>
                </>
              )}

              {(activeUser?.rol === 'director' || activeUser?.rol === 'coordinador') && (
                <button
                  onClick={() => {
                    onDocenteTabChange('usuarios');
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-semibold flex items-center space-x-2.5 ${
                    activeDocenteTab === 'usuarios'
                      ? 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 font-bold border border-purple-200/60 dark:border-purple-800'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#181818]'
                  }`}
                >
                  <UserCog className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  <span>Gestión de Personal & Roles</span>
                </button>
              )}

              {activeUser?.rol === 'director' && (
                <button
                  onClick={() => {
                    onDocenteTabChange('restauracion');
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-semibold flex items-center space-x-2.5 ${
                    activeDocenteTab === 'restauracion'
                      ? 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 font-bold border border-purple-200/60 dark:border-purple-800'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#181818]'
                  }`}
                >
                  <DatabaseBackup className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  <span>Respaldo & Restauración</span>
                </button>
              )}
            </div>
          ) : representanteAuthed ? (
            <div className="py-2 space-y-3">
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs">
                <p className="font-bold text-emerald-800 dark:text-emerald-300">Sesión Activa</p>
                <p className="text-slate-600 dark:text-slate-400 text-[11px]">Portal del Representante Legal</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onLogoutRepresentante();
                }}
                className="w-full py-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 text-xs font-bold border border-rose-200 dark:border-rose-900 flex items-center justify-center space-x-1.5 cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>Cerrar Sesión de Representante</span>
              </button>
            </div>
          ) : (
            <div className="py-2 text-center text-xs text-slate-500 dark:text-slate-400">
              <p>Inicie sesión para acceder al panel institucional o al portal de representantes.</p>
            </div>
          )}

          {/* Acceso directo de descarga/instalación en menú móvil */}
          <div className="pt-2 border-t border-slate-100 dark:border-[#27272A]">
            <InstallPWAButton
              accent={currentView === 'representante' ? 'emerald' : 'indigo'}
              alwaysShow
            />
          </div>
        </div>
      )}
    </header>
  );
};
