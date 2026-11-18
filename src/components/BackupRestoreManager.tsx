import React, { useState, useEffect } from 'react';
import {
  Database,
  Download,
  Upload,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  FileJson,
  RotateCcw,
  Server,
  Users,
  Calendar,
  Layers,
  Clock,
  Key,
} from 'lucide-react';
import type { Usuario } from '../types.ts';
import {
  fetchBackupStats,
  exportDatabaseBackup,
  restoreDatabaseBackup,
  resetDatabaseToMaster,
} from '../lib/api.ts';

interface BackupRestoreManagerProps {
  currentUser: Usuario | null;
  onRefreshData?: () => void;
}

export const BackupRestoreManager: React.FC<BackupRestoreManagerProps> = ({
  currentUser,
  onRefreshData,
}) => {
  const isDirector = currentUser?.rol === 'director';

  const [stats, setStats] = useState<{
    anosEscolares: number;
    secciones: number;
    materias: number;
    estudiantes: number;
    representantes: number;
    asistencias: number;
    horarios: number;
    usuariosPersonal: number;
    logsAuditoria: number;
  } | null>(null);

  const [loadingStats, setLoadingStats] = useState<boolean>(false);
  const [exporting, setExporting] = useState<boolean>(false);
  const [restoring, setRestoring] = useState<boolean>(false);
  const [resetting, setResetting] = useState<boolean>(false);

  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  // File upload state for restore
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileContent, setFileContent] = useState<any>(null);
  const [showRestoreModal, setShowRestoreModal] = useState<boolean>(false);

  // Reset seed confirmation state
  const [showResetModal, setShowResetModal] = useState<boolean>(false);
  const [resetConfirmText, setResetConfirmText] = useState<string>('');

  const loadStats = async () => {
    if (!currentUser || currentUser.rol !== 'director') return;
    setLoadingStats(true);
    try {
      const data = await fetchBackupStats();
      setStats(data);
    } catch (err: any) {
      console.warn('Notice loading backup stats:', err?.message);
      if (err?.message?.includes('no encontrado') || err?.message?.includes('autenticado')) {
        setStatusMessage({
          type: 'error',
          text: 'Sesión no válida o desincronizada. Por favor, vuelva a identificarse como Director para gestionar respaldos.',
        });
        if (onRefreshData) {
          onRefreshData();
        }
      } else {
        setStatusMessage({
          type: 'error',
          text: err.message || 'Error al conectar con el servicio de estadísticas.',
        });
      }
    } finally {
      setLoadingStats(false);
    }
  };

  useEffect(() => {
    if (isDirector) {
      loadStats();
    }
  }, [isDirector]);

  // Si no es director, denegar acceso inmediatamente
  if (!isDirector) {
    return (
      <div className="bg-white dark:bg-[#121212] p-8 rounded-3xl border border-rose-200 dark:border-rose-900 shadow-sm text-center max-w-2xl mx-auto my-8 space-y-4">
        <div className="w-14 h-14 bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 rounded-2xl flex items-center justify-center mx-auto">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-black text-rose-900 dark:text-rose-200">
          Acceso Restringido (403 Forbidden)
        </h3>
        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
          El módulo de <strong>Copia de Seguridad y Restauración de Base de Datos</strong> es de uso
          estricto y exclusivo para la <strong>Dirección General</strong> del plantel educativo.
          Cualquier intento de acceso o ejecución no autorizada es registrado en la bitácora de auditoría.
        </p>
      </div>
    );
  }

  // 1. Exportar Respaldo
  const handleExportBackup = async () => {
    setExporting(true);
    setStatusMessage(null);
    try {
      const backupData = await exportDatabaseBackup();
      const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
        JSON.stringify(backupData, null, 2)
      )}`;
      const downloadAnchor = document.createElement('a');
      const filename = `backup_eduasist_${new Date().toISOString().split('T')[0]}_${Date.now()}.json`;
      downloadAnchor.setAttribute('href', jsonString);
      downloadAnchor.setAttribute('download', filename);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      setStatusMessage({
        type: 'success',
        text: `Copia de seguridad oficial descargada con éxito (${filename}).`,
      });
      loadStats();
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'Error al exportar copia de seguridad.',
      });
    } finally {
      setExporting(false);
    }
  };

  // 2. Manejo de archivo seleccionado para restauración
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.json')) {
      setStatusMessage({
        type: 'error',
        text: 'Por favor seleccione un archivo de respaldo en formato JSON válido.',
      });
      return;
    }

    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (!parsed || !parsed.data) {
          throw new Error('Estructura de respaldo inválida. Falta el nodo principal "data".');
        }
        setFileContent(parsed);
        setShowRestoreModal(true);
      } catch (err: any) {
        setStatusMessage({
          type: 'error',
          text: 'El archivo seleccionado no contiene un JSON de respaldo válido: ' + err.message,
        });
        setSelectedFile(null);
        setFileContent(null);
      }
    };
    reader.readAsText(file);
  };

  // 3. Ejecutar Restauración
  const handleConfirmRestore = async () => {
    if (!fileContent) return;
    setRestoring(true);
    setStatusMessage(null);
    try {
      const result = await restoreDatabaseBackup(fileContent);
      setStatusMessage({
        type: 'success',
        text: `Restauración exitosa: ${result.mensaje} (${result.tablasRestauradas} tablas sincronizadas).`,
      });
      setShowRestoreModal(false);
      setSelectedFile(null);
      setFileContent(null);
      loadStats();
      if (onRefreshData) onRefreshData();
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'Error durante la restauración de la base de datos.',
      });
    } finally {
      setRestoring(false);
    }
  };

  // 4. Reiniciar a Semilla Maestra
  const handleResetToMasterSeed = async () => {
    if (resetConfirmText.trim().toUpperCase() !== 'CONFIRMAR') {
      setStatusMessage({
        type: 'error',
        text: 'Debe escribir la palabra CONFIRMAR exactamente para proceder con el reinicio.',
      });
      return;
    }

    setResetting(true);
    setStatusMessage(null);
    try {
      const result = await resetDatabaseToMaster();
      setStatusMessage({
        type: 'success',
        text: result.mensaje + ' Acceso principal garantizado para el Director maestro (usuario: admin / correo: admin@eduasist.edu).',
      });
      setShowResetModal(false);
      setResetConfirmText('');
      loadStats();
      if (onRefreshData) onRefreshData();
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'Error al reiniciar la base de datos a la semilla maestra.',
      });
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white dark:bg-[#121212] p-6 rounded-2xl border border-slate-200 dark:border-[#27272A] shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start space-x-3.5">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-xl font-bold text-slate-900 dark:text-[#F4F4F5] tracking-tight">
                Módulo de Respaldo & Restauración de Base de Datos
              </h2>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-900">
                <ShieldCheck className="w-3.5 h-3.5 text-rose-500" />
                Rol Exclusivo: Director
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Exportación de snapshots JSON completos, restauración controlada y gestión del usuario maestro inicial.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={loadStats}
          disabled={loadingStats}
          className="self-start md:self-auto px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-[#181818] hover:bg-slate-200 dark:hover:bg-[#202024] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#27272A] flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loadingStats ? 'animate-spin' : ''}`} />
          <span>Actualizar Métricas</span>
        </button>
      </div>

      {/* Status Alert Banner */}
      {statusMessage && (
        <div
          className={`p-4 rounded-xl text-xs font-semibold flex items-center space-x-2.5 ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
              : statusMessage.type === 'error'
              ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-900'
              : 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Database Statistics Card */}
      <div className="bg-white dark:bg-[#121212] p-5 rounded-2xl border border-slate-200 dark:border-[#27272A] shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-[#27272A]">
          <div className="flex items-center space-x-2">
            <Server className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <h3 className="font-bold text-xs uppercase tracking-wider text-slate-700 dark:text-[#F4F4F5]">
              Estado y Conteos en Tiempo Real (Base de Datos Institucional)
            </h3>
          </div>
          <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
            Conexión Activa
          </span>
        </div>

        {stats ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="bg-slate-50 dark:bg-[#181818] p-3 rounded-xl border border-slate-200/80 dark:border-[#27272A]">
              <span className="text-[10px] font-bold uppercase text-slate-400">Estudiantes</span>
              <p className="font-mono text-lg font-black text-slate-900 dark:text-[#F4F4F5] mt-0.5">
                {stats.estudiantes}
              </p>
            </div>
            <div className="bg-slate-50 dark:bg-[#181818] p-3 rounded-xl border border-slate-200/80 dark:border-[#27272A]">
              <span className="text-[10px] font-bold uppercase text-slate-400">Representantes</span>
              <p className="font-mono text-lg font-black text-slate-900 dark:text-[#F4F4F5] mt-0.5">
                {stats.representantes}
              </p>
            </div>
            <div className="bg-slate-50 dark:bg-[#181818] p-3 rounded-xl border border-slate-200/80 dark:border-[#27272A]">
              <span className="text-[10px] font-bold uppercase text-slate-400">Materias / Pensum</span>
              <p className="font-mono text-lg font-black text-slate-900 dark:text-[#F4F4F5] mt-0.5">
                {stats.materias}
              </p>
            </div>
            <div className="bg-slate-50 dark:bg-[#181818] p-3 rounded-xl border border-slate-200/80 dark:border-[#27272A]">
              <span className="text-[10px] font-bold uppercase text-slate-400">Asistencias</span>
              <p className="font-mono text-lg font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                {stats.asistencias}
              </p>
            </div>
            <div className="bg-slate-50 dark:bg-[#181818] p-3 rounded-xl border border-slate-200/80 dark:border-[#27272A]">
              <span className="text-[10px] font-bold uppercase text-slate-400">Horarios</span>
              <p className="font-mono text-lg font-black text-slate-900 dark:text-[#F4F4F5] mt-0.5">
                {stats.horarios}
              </p>
            </div>
            <div className="bg-slate-50 dark:bg-[#181818] p-3 rounded-xl border border-slate-200/80 dark:border-[#27272A]">
              <span className="text-[10px] font-bold uppercase text-slate-400">Personal / Staff</span>
              <p className="font-mono text-lg font-black text-slate-900 dark:text-[#F4F4F5] mt-0.5">
                {stats.usuariosPersonal}
              </p>
            </div>
            <div className="bg-slate-50 dark:bg-[#181818] p-3 rounded-xl border border-slate-200/80 dark:border-[#27272A]">
              <span className="text-[10px] font-bold uppercase text-slate-400">Años Escolares</span>
              <p className="font-mono text-lg font-black text-slate-900 dark:text-[#F4F4F5] mt-0.5">
                {stats.anosEscolares}
              </p>
            </div>
            <div className="bg-slate-50 dark:bg-[#181818] p-3 rounded-xl border border-slate-200/80 dark:border-[#27272A]">
              <span className="text-[10px] font-bold uppercase text-slate-400">Secciones</span>
              <p className="font-mono text-lg font-black text-slate-900 dark:text-[#F4F4F5] mt-0.5">
                {stats.secciones}
              </p>
            </div>
            <div className="bg-slate-50 dark:bg-[#181818] p-3 rounded-xl border border-slate-200/80 dark:border-[#27272A]">
              <span className="text-[10px] font-bold uppercase text-slate-400">Logs Auditoría</span>
              <p className="font-mono text-lg font-black text-purple-600 dark:text-purple-400 mt-0.5">
                {stats.logsAuditoria}
              </p>
            </div>
          </div>
        ) : (
          <div className="p-4 text-center text-xs text-slate-500">Cargando conteos relacionales...</div>
        )}
      </div>

      {/* Main Operations Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Card 1: Generar Copia de Seguridad */}
        <div className="bg-white dark:bg-[#121212] p-6 rounded-2xl border border-slate-200 dark:border-[#27272A] shadow-xs flex flex-col justify-between space-y-5">
          <div className="space-y-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900 dark:text-[#F4F4F5]">
                Exportar Copia de Seguridad Completa
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                Genera un snapshot integral en formato JSON con la totalidad de registros relacionales:
                pensum, horarios, historial de asistencias, docentes, estudiantes, representantes y configuración.
              </p>
            </div>
            <ul className="text-[11px] text-slate-600 dark:text-slate-400 space-y-1 list-disc list-inside">
              <li>Formato estándar JSON serializado y portable.</li>
              <li>Incluye metadatos de integridad y fecha oficial de generación.</li>
              <li>Protección y trazabilidad registrada en los Logs de Auditoría.</li>
            </ul>
          </div>

          <button
            type="button"
            onClick={handleExportBackup}
            disabled={exporting}
            className="w-full py-3 px-4 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs flex items-center justify-center space-x-2 transition-all cursor-pointer disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            <span>{exporting ? 'Generando Respaldo...' : 'Descargar Copia de Seguridad (.json)'}</span>
          </button>
        </div>

        {/* Card 2: Restaurar desde Respaldo */}
        <div className="bg-white dark:bg-[#121212] p-6 rounded-2xl border border-slate-200 dark:border-[#27272A] shadow-xs flex flex-col justify-between space-y-5">
          <div className="space-y-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900 dark:text-[#F4F4F5]">
                Restaurar Base de Datos desde Archivo JSON
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                Permite cargar un archivo de respaldo exportado previamente para restaurar el estado íntegro
                del sistema. Se validarán las relaciones y se preservará al Director activo para evitar pérdida de acceso.
              </p>
            </div>
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 p-3 rounded-xl text-[11px] text-amber-900 dark:text-amber-300 flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                <strong>Atención:</strong> Esta acción sustituirá los registros actuales por los del archivo
                suministrado. Se recomienda descargar una copia previa.
              </span>
            </div>
          </div>

          <div>
            <label className="block w-full cursor-pointer">
              <span className="sr-only">Seleccionar archivo de respaldo</span>
              <input
                type="file"
                accept=".json,application/json"
                onChange={handleFileChange}
                disabled={restoring}
                className="block w-full text-xs text-slate-500 dark:text-slate-400 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-amber-500 file:text-white hover:file:bg-amber-600 file:cursor-pointer cursor-pointer border border-dashed border-slate-300 dark:border-[#27272A] rounded-xl p-2 bg-slate-50 dark:bg-[#181818]"
              />
            </label>
          </div>
        </div>
      </div>

      {/* Card 3: Reiniciar a Semilla Maestra Oficial (Usuario Maestro Admin) */}
      <div className="bg-white dark:bg-[#121212] p-6 rounded-2xl border border-rose-200 dark:border-rose-950 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start space-x-3.5">
            <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-[#F4F4F5]">
                Restablecer a Semilla Maestra Inicial
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Inicializa la base de datos con el <strong>Director General maestro</strong> autenticado mediante credenciales locales (<code className="bg-slate-100 dark:bg-[#181818] px-1.5 py-0.5 rounded text-rose-600 font-mono">admin</code> / <code className="bg-slate-100 dark:bg-[#181818] px-1.5 py-0.5 rounded text-rose-600 font-mono">admin@eduasist.edu</code>).
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowResetModal(true)}
            className="px-4 py-2.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition-colors shrink-0 cursor-pointer"
          >
            Restablecer a Semilla Maestra
          </button>
        </div>
      </div>

      {/* Modal de Confirmación de Restauración */}
      {showRestoreModal && fileContent && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#121212] rounded-3xl max-w-lg w-full border border-slate-200 dark:border-[#27272A] shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center space-x-3 text-amber-600 dark:text-amber-400">
              <AlertCircle className="w-6 h-6" />
              <h3 className="font-black text-base text-slate-900 dark:text-[#F4F4F5]">
                Confirmar Restauración de Base de Datos
              </h3>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Está a punto de restaurar la base de datos desde el archivo{' '}
              <strong className="text-slate-900 dark:text-[#F4F4F5]">{selectedFile?.name}</strong>.
              El contenido a sincronizar incluye:
            </p>

            <div className="bg-slate-50 dark:bg-[#181818] p-3.5 rounded-2xl border border-slate-200 dark:border-[#27272A] font-mono text-[11px] space-y-1 text-slate-700 dark:text-slate-300">
              <p>• Estudiantes: {fileContent.data?.estudiantes?.length || 0}</p>
              <p>• Asistencias: {fileContent.data?.asistencia?.length || 0}</p>
              <p>• Materias / Pensum: {fileContent.data?.materias?.length || 0}</p>
              <p>• Horarios: {fileContent.data?.horarios?.length || 0}</p>
              <p>• Personal / Staff: {fileContent.data?.users?.length || 0}</p>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-100 dark:border-[#27272A]">
              <button
                type="button"
                onClick={() => {
                  setShowRestoreModal(false);
                  setSelectedFile(null);
                  setFileContent(null);
                }}
                disabled={restoring}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmRestore}
                disabled={restoring}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-xs flex items-center space-x-2 cursor-pointer disabled:opacity-50"
              >
                <span>{restoring ? 'Restaurando...' : 'Sí, Ejecutar Restauración'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmación de Reinicio a Semilla Maestra */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#121212] rounded-3xl max-w-lg w-full border border-rose-200 dark:border-rose-900 shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center space-x-3 text-rose-600 dark:text-rose-400">
              <ShieldAlert className="w-6 h-6" />
              <h3 className="font-black text-base text-slate-900 dark:text-[#F4F4F5]">
                Restablecer a Semilla Maestra Inicial
              </h3>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Esta operación reiniciará las tablas institucionales y mantendrá como{' '}
              <strong>único usuario maestro Director</strong> la cuenta local{' '}
              <strong className="text-rose-600">admin@eduasist.edu</strong> (usuario: <code className="font-mono">admin</code>).
            </p>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Escriba <span className="text-rose-600 font-mono">CONFIRMAR</span> para proceder:
              </label>
              <input
                type="text"
                value={resetConfirmText}
                onChange={(e) => setResetConfirmText(e.target.value)}
                placeholder="CONFIRMAR"
                className="w-full bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold text-slate-900 dark:text-[#F4F4F5] focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-100 dark:border-[#27272A]">
              <button
                type="button"
                onClick={() => {
                  setShowResetModal(false);
                  setResetConfirmText('');
                }}
                disabled={resetting}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleResetToMasterSeed}
                disabled={resetting || resetConfirmText.trim().toUpperCase() !== 'CONFIRMAR'}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-xs flex items-center space-x-2 cursor-pointer disabled:opacity-40"
              >
                <span>{resetting ? 'Reiniciando...' : 'Confirmar Reinicio'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
