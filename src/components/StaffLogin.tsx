import React, { useState } from 'react';
import {
  GraduationCap,
  ArrowRight,
  AlertCircle,
  ShieldCheck,
  User,
  Lock,
  Eye,
  EyeOff,
  Loader2,
} from 'lucide-react';
import type { LoginResponse } from '../types.ts';
import { loginWithCredentials } from '../lib/api.ts';
import { InstallPWAButton } from './InstallPWAButton.tsx';

interface StaffLoginProps {
  onLoginSuccess: (response: LoginResponse) => void;
  onSwitchToRepresentante: () => void;
}

export const StaffLogin: React.FC<StaffLoginProps> = ({
  onLoginSuccess,
  onSwitchToRepresentante,
}) => {
  const [usuario, setUsuario] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [portalMismatch, setPortalMismatch] = useState<boolean>(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanUser = usuario.trim();
    if (!cleanUser) {
      setError('Debe ingresar su usuario, correo institucional o cédula.');
      return;
    }
    if (!password) {
      setError('Debe ingresar su contraseña.');
      return;
    }

    setLoading(true);
    setPortalMismatch(false);
    try {
      const response = await loginWithCredentials(cleanUser, password, 'staff');
      if (response.type !== 'staff' || !response.user) {
        setPortalMismatch(true);
        setError(
          'Las cuentas de representantes deben ingresar exclusivamente a través del Portal de Representantes.'
        );
        return;
      }
      onLoginSuccess(response);
    } catch (err: any) {
      if (err?.code === 'PORTAL_MISMATCH') {
        setPortalMismatch(true);
      }
      setError(
        err?.message ||
          'No se pudo iniciar sesión. Verifique sus credenciales e intente nuevamente.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto my-6 sm:my-10 animate-in fade-in duration-200 px-3">
      {/* Institutional Login Card with Pure OLED Colors */}
      <div className="bg-white dark:bg-[#121212] rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-[#27272A] shadow-xl">
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-linear-to-tr from-indigo-600 to-blue-600 text-white flex items-center justify-center mx-auto mb-3 shadow-md shadow-indigo-100 dark:shadow-none">
            <GraduationCap className="w-8 h-8" />
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-extrabold uppercase bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
            Panel Institucional
          </span>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-[#F4F4F5] mt-2.5 tracking-tight">
            Acceso Personal Docente &amp; Directivo
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Ingrese con su usuario o correo institucional y contraseña registrados en la base de datos
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="p-3.5 mb-5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-xs font-semibold text-rose-800 dark:text-rose-300 space-y-2.5"
          >
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
            {portalMismatch && (
              <button
                type="button"
                onClick={onSwitchToRepresentante}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold transition-colors cursor-pointer"
              >
                <span>Ir al Portal de Representantes</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label
              htmlFor="staff-login-usuario"
              className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Usuario, Correo Institucional o Cédula
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="staff-login-usuario"
                type="text"
                autoComplete="username"
                placeholder="Ej: admin o correo@educontrol.edu"
                value={usuario}
                onChange={(e) => {
                  setUsuario(e.target.value);
                  if (error) setError(null);
                }}
                disabled={loading}
                className="w-full bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-[#F4F4F5] rounded-xl pl-10 pr-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors disabled:opacity-60"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="staff-login-password"
              className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Contraseña
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="staff-login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Ingrese su contraseña"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(null);
                }}
                disabled={loading}
                className="w-full bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-[#F4F4F5] rounded-xl pl-10 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
                aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs sm:text-sm shadow-md shadow-indigo-100 dark:shadow-none flex items-center justify-center space-x-2 transition-all cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Verificando credenciales...</span>
              </>
            ) : (
              <>
                <span>Ingresar al Sistema</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          <p className="text-[11px] text-center text-slate-500 dark:text-slate-400 leading-relaxed">
            Acceso exclusivo para el personal institucional autorizado (Director, Coordinador y Docente).
          </p>
        </form>

        <div className="mt-6 pt-5 border-t border-slate-100 dark:border-[#27272A] space-y-3">
          <div className="p-3.5 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-900 flex items-center justify-between gap-3">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-emerald-950 dark:text-emerald-200">
                  ¿Eres Padre o Representante?
                </p>
                <p className="text-[11px] text-emerald-800 dark:text-emerald-300/80">
                  Consulta asistencias y horarios de tus hijos
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onSwitchToRepresentante}
              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center space-x-1 shrink-0 cursor-pointer shadow-xs transition-colors"
            >
              <span>Ir al Portal</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <InstallPWAButton accent="indigo" />

          <div className="flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500 pt-1">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              Autenticación Local Bcrypt + JWT
            </span>
            <span>Control RBAC Activo</span>
          </div>
        </div>
      </div>
    </div>
  );
};
