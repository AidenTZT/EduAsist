import React from 'react';
import {
  GraduationCap,
  ShieldCheck,
  Clock,
  Database,
  ArrowRight,
  Users,
  CheckCircle2,
  CalendarCheck,
  FileDown,
  Lock,
  Compass,
} from 'lucide-react';

interface PortalGatewayProps {
  onSelectPortal: (portal: 'docente' | 'representante') => void;
  staffCount: number;
  representantesCount: number;
  estudiantesCount: number;
}

export const PortalGateway: React.FC<PortalGatewayProps> = ({
  onSelectPortal,
  staffCount,
  representantesCount,
  estudiantesCount,
}) => {
  return (
    <div className="py-6 sm:py-10 max-w-5xl mx-auto space-y-8 animate-in fade-in duration-300">
      {/* Hero Welcome Banner */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200">
          <Database className="w-3.5 h-3.5 text-indigo-600" />
          <span>EduAsist • Autenticación Local &amp; Base de Datos</span>
        </div>
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-slate-900 tracking-tight">
          Sistema de Control y Reporte de Asistencia Escolar
        </h1>
        <p className="text-sm sm:text-base text-slate-600 max-w-2xl mx-auto">
          Plataforma web con separación estricta de accesos independientes: panel institucional para el equipo docente y portal exclusivo para representantes.
        </p>
      </div>

      {/* Two Portal Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
        {/* Portal 1: Panel Institucional */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border-2 border-slate-200/80 hover:border-indigo-500 shadow-lg hover:shadow-xl transition-all flex flex-col justify-between group">
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div className="w-14 h-14 rounded-2xl bg-linear-to-tr from-indigo-600 to-blue-600 flex items-center justify-center text-white shadow-md shadow-indigo-200 group-hover:scale-105 transition-transform">
                <GraduationCap className="w-8 h-8" />
              </div>
              <span className="px-3 py-1 rounded-full text-[11px] font-extrabold uppercase bg-purple-50 text-purple-700 border border-purple-200">
                Directivos • Coordinadores • Docentes
              </span>
            </div>

            <div>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                Panel Institucional
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                Entorno de trabajo para la toma de asistencia diaria, reportes oficiales, horarios en tiempo real y administración escolar.
              </p>
            </div>

            <ul className="space-y-2.5 text-xs text-slate-600 border-t border-slate-100 pt-4">
              <li className="flex items-start space-x-2">
                <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Pase de Asistencia:</strong> Registro táctil por materia con hora automática del servidor.
                </span>
              </li>
              <li className="flex items-start space-x-2">
                <Compass className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Radar "En Clase Ahora":</strong> Detección dinámica de qué materia y aula cursa cada grupo en tiempo real.
                </span>
              </li>
              <li className="flex items-start space-x-2">
                <FileDown className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Reportes Oficiales PDF:</strong> Emisión de reportes individuales y generales de asistencia y justificaciones.
                </span>
              </li>
              <li className="flex items-start space-x-2">
                <Lock className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Seguridad Jerárquica RBAC:</strong> Permisos diferenciados para Director, Coordinador y Docente.
                </span>
              </li>
            </ul>
          </div>

          <div className="mt-8 pt-6 border-t border-slate-100">
            <button
              type="button"
              onClick={() => onSelectPortal('docente')}
              className="w-full py-3.5 px-5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-sm shadow-md shadow-indigo-100 flex items-center justify-center space-x-2 transition-all group-hover:gap-3 cursor-pointer"
            >
              <span>Acceder al Panel Institucional</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <p className="text-center text-[11px] text-slate-400 mt-2">
              Requiere usuario institucional / correo del personal
            </p>
          </div>
        </div>

        {/* Portal 2: Portal de Representantes */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border-2 border-slate-200/80 hover:border-emerald-500 shadow-lg hover:shadow-xl transition-all flex flex-col justify-between group">
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div className="w-14 h-14 rounded-2xl bg-linear-to-tr from-emerald-600 to-teal-600 flex items-center justify-center text-white shadow-md shadow-emerald-200 group-hover:scale-105 transition-transform">
                <ShieldCheck className="w-8 h-8" />
              </div>
              <span className="px-3 py-1 rounded-full text-[11px] font-extrabold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
                Padres • Madres • Tutores
              </span>
            </div>

            <div>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                Portal de Representantes
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                Consulta privada y transparente de asistencias, hora exacta de llegada, justificaciones y horarios escolares de sus hijos.
              </p>
            </div>

            <ul className="space-y-2.5 text-xs text-slate-600 border-t border-slate-100 pt-4">
              <li className="flex items-start space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Acceso por Credenciales:</strong> Ingreso seguro mediante usuario/correo y contraseña verificados en base de datos.
                </span>
              </li>
              <li className="flex items-start space-x-2">
                <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Auditoría de Puntualidad:</strong> Visualización de la hora exacta de entrada registrada por el profesor.
                </span>
              </li>
              <li className="flex items-start space-x-2">
                <CalendarCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Historial de Asistencias:</strong> Seguimiento de asistencias, tardanzas e inasistencias por asignatura y descarga en PDF.
                </span>
              </li>
              <li className="flex items-start space-x-2">
                <Users className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Privacidad Garantizada:</strong> Solo se visualizan los estudiantes asociados a la cédula del representante.
                </span>
              </li>
            </ul>
          </div>

          <div className="mt-8 pt-6 border-t border-slate-100">
            <button
              type="button"
              onClick={() => onSelectPortal('representante')}
              className="w-full py-3.5 px-5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm shadow-md shadow-emerald-100 flex items-center justify-center space-x-2 transition-all group-hover:gap-3 cursor-pointer"
            >
              <span>Acceder al Portal del Representante</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <p className="text-center text-[11px] text-slate-400 mt-2">
              Ingreso con usuario, correo o cédula y contraseña del representante
            </p>
          </div>
        </div>
      </div>

      {/* System Metrics Bar */}
      <div className="bg-slate-100/80 rounded-2xl p-4 border border-slate-200/90 flex flex-wrap items-center justify-around gap-4 text-center">
        <div>
          <p className="text-lg font-black text-slate-800">{staffCount}</p>
          <p className="text-[11px] font-semibold text-slate-500 uppercase">Personal Docente & Directivo</p>
        </div>
        <div className="h-8 w-px bg-slate-300 hidden sm:block"></div>
        <div>
          <p className="text-lg font-black text-slate-800">{estudiantesCount}</p>
          <p className="text-[11px] font-semibold text-slate-500 uppercase">Estudiantes Matriculados</p>
        </div>
        <div className="h-8 w-px bg-slate-300 hidden sm:block"></div>
        <div>
          <p className="text-lg font-black text-slate-800">{representantesCount}</p>
          <p className="text-[11px] font-semibold text-slate-500 uppercase">Representantes Registrados</p>
        </div>
        <div className="h-8 w-px bg-slate-300 hidden sm:block"></div>
        <div>
          <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-100/70 px-2.5 py-1 rounded-full border border-emerald-300">
            <Database className="w-3.5 h-3.5" />
            Base de Datos en Línea
          </span>
        </div>
      </div>
    </div>
  );
};
