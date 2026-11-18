import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Clock,
  Calendar,
  Building,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertCircle,
  X,
  User,
  Radio,
  Sliders,
  ChevronRight,
  Compass,
  ArrowRight,
  Coffee,
  ShieldAlert,
  Sparkles,
  AlertTriangle,
  Info,
  Wand2,
  Check,
  Lightbulb,
  DoorOpen,
  BellRing,
  Send,
  Loader2,
} from 'lucide-react';
import type {
  AnoEscolar,
  Seccion,
  Materia,
  DocenteMateria,
  Usuario,
  Horario,
  RecesoInstitucional,
  SalidaInstitucional,
  ConflictoHorarioResult,
  AutoResolveResult,
  SlotSuggestion,
} from '../types.ts';
import {
  fetchHorarios,
  createHorario,
  updateHorario,
  deleteHorario,
  fetchRecesos,
  createReceso,
  updateReceso,
  toggleReceso,
  deleteReceso,
  fetchSalidas,
  createSalida,
  updateSalida,
  toggleSalida,
  deleteSalida,
  notifySalidaPush,
  validateHorarioConflict,
  autoResolveHorarios,
  fetchSuggestedSlots,
} from '../lib/api.ts';

interface ScheduleManagerProps {
  anos: AnoEscolar[];
  secciones: Seccion[];
  materias: Materia[];
  docenteMaterias: DocenteMateria[];
  staffUsers: Usuario[];
  currentUser: Usuario | null;
  onGoToAttendance?: (materiaId: number, seccionId: number) => void;
}

const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];

export const ScheduleManager: React.FC<ScheduleManagerProps> = ({
  anos,
  secciones,
  materias,
  docenteMaterias,
  staffUsers,
  currentUser,
  onGoToAttendance,
}) => {
  const [horariosList, setHorariosList] = useState<Horario[]>([]);
  const [recesosList, setRecesosList] = useState<RecesoInstitucional[]>([]);
  const [salidasList, setSalidasList] = useState<SalidaInstitucional[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters for Weekly Grid
  const [selectedAnoId, setSelectedAnoId] = useState<number>(anos[0]?.idAno || 1);
  const [selectedSeccionId, setSelectedSeccionId] = useState<number>(0);
  const [selectedDocenteId, setSelectedDocenteId] = useState<number>(0);
  const [selectedDayTab, setSelectedDayTab] = useState<string>('Lunes');

  // Live / Simulation Clock State
  const [useSimulation, setUseSimulation] = useState<boolean>(false);
  const [simulatedDay, setSimulatedDay] = useState<string>('Lunes');
  const [simulatedTime, setSimulatedTime] = useState<string>('08:15');
  const [currentTimeStr, setCurrentTimeStr] = useState<string>('');
  const [currentDayName, setCurrentDayName] = useState<string>('');

  // Add / Edit Modal state
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [editingHorario, setEditingHorario] = useState<Horario | null>(null);
  const [form, setForm] = useState({
    idAno: anos[0]?.idAno || 1,
    idSeccion: 0,
    idMateria: 0,
    diaSemana: 'Lunes',
    horaInicio: '07:00',
    horaFin: '07:45',
    aula: 'Aula 101',
  });
  const [formSaving, setFormSaving] = useState<boolean>(false);
  const [formMessage, setFormMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Live Anticonflict State in Modal
  const [conflictChecking, setConflictChecking] = useState<boolean>(false);
  const [conflictResult, setConflictResult] = useState<ConflictoHorarioResult | null>(null);
  const [forceOverride, setForceOverride] = useState<boolean>(false);

  // Recess Management Modal
  const [recessModalOpen, setRecessModalOpen] = useState<boolean>(false);
  const [editingRecess, setEditingRecess] = useState<RecesoInstitucional | null>(null);
  const [recessForm, setRecessForm] = useState({
    nombre: '',
    horaInicio: '09:15',
    horaFin: '09:45',
    activo: true,
    descripcion: '',
  });
  const [savingRecess, setSavingRecess] = useState<boolean>(false);
  const [recessMsg, setRecessMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [confirmDeleteRecesoId, setConfirmDeleteRecesoId] = useState<number | null>(null);

  // Salida (Departure Time) Management Modal & Push Dispatch
  const [salidaModalOpen, setSalidaModalOpen] = useState<boolean>(false);
  const [editingSalida, setEditingSalida] = useState<SalidaInstitucional | null>(null);
  const [salidaForm, setSalidaForm] = useState<{
    nombre: string;
    horaSalida: string;
    idAno: number | null;
    activo: boolean;
    notificarPush: boolean;
    descripcion: string;
  }>({
    nombre: 'Hora de Salida Oficial',
    horaSalida: '12:00',
    idAno: null,
    activo: true,
    notificarPush: true,
    descripcion: '',
  });
  const [savingSalida, setSavingSalida] = useState<boolean>(false);
  const [salidaMsg, setSalidaMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [confirmDeleteSalidaId, setConfirmDeleteSalidaId] = useState<number | null>(null);
  const [notifyingSalidaId, setNotifyingSalidaId] = useState<number | null>(null);
  const [salidaPushToast, setSalidaPushToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Auto-resolve conflicts state
  const [autoResolving, setAutoResolving] = useState<boolean>(false);
  const [autoResolveToast, setAutoResolveToast] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Suggestions for conflict-free slots
  const [slotSuggestions, setSlotSuggestions] = useState<SlotSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState<boolean>(false);

  // Horario Delete Confirmation
  const [confirmDeleteHorarioId, setConfirmDeleteHorarioId] = useState<number | null>(null);

  // Real-time ticking clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      setCurrentTimeStr(`${hours}:${minutes}`);

      const dayIndex = now.getDay();
      const daysMap: Record<number, string> = {
        1: 'Lunes',
        2: 'Martes',
        3: 'Miércoles',
        4: 'Jueves',
        5: 'Viernes',
        6: 'Sábado',
        0: 'Domingo',
      };
      setCurrentDayName(daysMap[dayIndex] || 'Lunes');
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch all schedules, recesses & departure times
  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [hData, rData, sData] = await Promise.all([
        fetchHorarios(),
        fetchRecesos(),
        fetchSalidas(),
      ]);
      setHorariosList(hData);
      setRecesosList(rData);
      setSalidasList(sData);
    } catch (err: any) {
      console.error('Error fetching schedules, recesses or departures:', err);
      setError(err.message || 'Error al cargar datos de horarios, recesos y horas de salida');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filter secciones by selected year
  const availableSecciones = useMemo(() => {
    return secciones.filter((s) => s.idAno === selectedAnoId);
  }, [secciones, selectedAnoId]);

  // Filter materias by selected year
  const availableMaterias = useMemo(() => {
    return materias.filter((m) => m.idAno === selectedAnoId);
  }, [materias, selectedAnoId]);

  // Adjust defaults when year changes
  useEffect(() => {
    if (availableSecciones.length > 0 && selectedSeccionId === 0) {
      setSelectedSeccionId(availableSecciones[0].idSeccion);
    }
  }, [availableSecciones, selectedSeccionId]);

  // Helper to resolve assigned teacher for a materia
  const getTeacherForMateria = (idMateria: number): Usuario | undefined => {
    const dm = docenteMaterias.find((d) => d.idMateria === idMateria);
    if (!dm) return undefined;
    return staffUsers.find((u) => u.id === dm.idUsuario);
  };

  // Determine active day & time (either real-time or simulation)
  const activeDay = useSimulation ? simulatedDay : currentDayName;
  const activeTime = useSimulation ? simulatedTime : currentTimeStr;

  // Helper to convert "HH:MM" to minutes from midnight
  const toMinutes = (timeStr: string) => {
    if (!timeStr) return 0;
    const parts = timeStr.split(':');
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  };

  // Real-time "En Clase Ahora / Receso" calculation
  const liveClassStatus = useMemo(() => {
    if (!activeDay || !activeTime) return null;
    const currentMins = toMinutes(activeTime);

    // Check if school is in an active institutional recess right now!
    const activeRecess = recesosList.find((r) => {
      if (!r.activo) return false;
      const sMins = toMinutes(r.horaInicio);
      const eMins = toMinutes(r.horaFin);
      return currentMins >= sMins && currentMins < eMins;
    });

    if (activeRecess) {
      return {
        isRecess: true,
        recess: activeRecess,
      };
    }

    // Filter to selected year and section
    const relevantHorarios = horariosList.filter((h) => {
      const matchesYear = h.idAno === selectedAnoId;
      const matchesSeccion = selectedSeccionId === 0 || h.idSeccion === selectedSeccionId;
      const matchesDay = h.diaSemana === activeDay;
      return matchesYear && matchesSeccion && matchesDay;
    });

    // Find currently active class block
    const activeBlock = relevantHorarios.find((h) => {
      const startMins = toMinutes(h.horaInicio);
      const endMins = toMinutes(h.horaFin);
      return currentMins >= startMins && currentMins < endMins;
    });

    if (activeBlock) {
      const startMins = toMinutes(activeBlock.horaInicio);
      const endMins = toMinutes(activeBlock.horaFin);
      const totalDuration = endMins - startMins;
      const elapsed = Math.max(0, currentMins - startMins);
      const remaining = Math.max(0, endMins - currentMins);
      const progressPercent = Math.min(100, Math.round((elapsed / totalDuration) * 100));

      const materia = materias.find((m) => m.idMateria === activeBlock.idMateria);
      const seccion = secciones.find((s) => s.idSeccion === activeBlock.idSeccion);
      const teacher = getTeacherForMateria(activeBlock.idMateria);

      return {
        isRecess: false,
        isSalida: false,
        isActive: true,
        block: activeBlock,
        materia,
        seccion,
        teacher,
        elapsed,
        remaining,
        progressPercent,
      };
    }

    const activeSalidaReached = salidasList
      .filter((s) => s.activo !== false && (!s.idAno || s.idAno === selectedAnoId))
      .filter((s) => currentMins >= toMinutes(s.horaSalida))
      .sort((a, b) => a.horaSalida.localeCompare(b.horaSalida))
      .pop();

    if (activeSalidaReached) {
      return {
        isRecess: false,
        isSalida: true,
        isActive: false,
        salida: activeSalidaReached,
      };
    }

    return { isRecess: false, isSalida: false, isActive: false };
  }, [
    activeDay,
    activeTime,
    selectedAnoId,
    selectedSeccionId,
    horariosList,
    recesosList,
    salidasList,
    materias,
    secciones,
    docenteMaterias,
    staffUsers,
  ]);

  // Real-time Anticonflict Check debouncer in Modal
  useEffect(() => {
    if (!modalOpen || !form.idMateria || !form.idSeccion || !form.horaInicio || !form.horaFin) {
      setConflictResult(null);
      return;
    }

    const timer = setTimeout(async () => {
      setConflictChecking(true);
      try {
        const result = await validateHorarioConflict({
          idHorario: editingHorario ? editingHorario.idHorario : undefined,
          idAno: form.idAno,
          idSeccion: form.idSeccion,
          idMateria: form.idMateria,
          diaSemana: form.diaSemana,
          horaInicio: form.horaInicio,
          horaFin: form.horaFin,
          aula: form.aula,
        });
        setConflictResult(result);
      } catch (err) {
        console.error('Error validating conflict:', err);
      } finally {
        setConflictChecking(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [
    modalOpen,
    form.idAno,
    form.idSeccion,
    form.idMateria,
    form.diaSemana,
    form.horaInicio,
    form.horaFin,
    form.aula,
    editingHorario,
  ]);

  // Modal open helpers
  const openModal = (horario?: Horario) => {
    setFormMessage(null);
    setConflictResult(null);
    setForceOverride(false);

    if (horario) {
      setEditingHorario(horario);
      setForm({
        idAno: horario.idAno,
        idSeccion: horario.idSeccion,
        idMateria: horario.idMateria,
        diaSemana: horario.diaSemana,
        horaInicio: horario.horaInicio.slice(0, 5),
        horaFin: horario.horaFin.slice(0, 5),
        aula: horario.aula || 'Aula 101',
      });
    } else {
      setEditingHorario(null);
      const firstSec = availableSecciones[0]?.idSeccion || secciones[0]?.idSeccion || 0;
      const firstMat = availableMaterias[0]?.idMateria || materias[0]?.idMateria || 0;
      setForm({
        idAno: selectedAnoId,
        idSeccion: selectedSeccionId !== 0 ? selectedSeccionId : firstSec,
        idMateria: firstMat,
        diaSemana: activeDay || 'Lunes',
        horaInicio: '07:00',
        horaFin: '07:45',
        aula: `Aula ${100 + selectedAnoId}`,
      });
    }
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (conflictResult?.hasConflict && !forceOverride) {
      setFormMessage({
        type: 'error',
        text: 'Se detectaron cruces de horario o recesos. Corrija los campos o marque la casilla de confirmación para continuar.',
      });
      return;
    }

    setFormSaving(true);
    setFormMessage(null);

    try {
      if (editingHorario) {
        await updateHorario(editingHorario.idHorario, {
          ...form,
          forceIgnoreConflict: forceOverride,
        });
        setFormMessage({ type: 'success', text: 'Bloque horario actualizado con éxito.' });
      } else {
        await createHorario({
          ...form,
          forceIgnoreConflict: forceOverride,
        });
        setFormMessage({ type: 'success', text: 'Bloque horario registrado exitosamente.' });
      }

      await loadData();
      setTimeout(() => {
        setModalOpen(false);
      }, 700);
    } catch (err: any) {
      setFormMessage({ type: 'error', text: err.message || 'Error al guardar horario' });
    } finally {
      setFormSaving(false);
    }
  };

  const handleDelete = async (horario: Horario) => {
    try {
      await deleteHorario(horario.idHorario);
      setConfirmDeleteHorarioId(null);
      await loadData();
    } catch (err: any) {
      console.error('Error al eliminar horario:', err);
    }
  };

  // Recess CRUD Handlers
  const openRecessModal = (rec?: RecesoInstitucional) => {
    setRecessMsg(null);
    setConfirmDeleteRecesoId(null);
    if (rec) {
      setEditingRecess(rec);
      setRecessForm({
        nombre: rec.nombre,
        horaInicio: rec.horaInicio,
        horaFin: rec.horaFin,
        activo: rec.activo,
        descripcion: rec.descripcion || '',
      });
    } else {
      setEditingRecess(null);
      setRecessForm({
        nombre: 'Receso Institucional',
        horaInicio: '09:15',
        horaFin: '09:45',
        activo: true,
        descripcion: 'Pausa para desayuno y recreación escolar',
      });
    }
    setRecessModalOpen(true);
  };

  const handleSaveRecess = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingRecess(true);
    setRecessMsg(null);
    try {
      if (editingRecess) {
        await updateReceso(editingRecess.idReceso, recessForm);
        setRecessMsg({ type: 'success', text: 'Receso institucional actualizado correctamente.' });
      } else {
        await createReceso(recessForm);
        setRecessMsg({ type: 'success', text: 'Receso institucional registrado correctamente.' });
      }
      await loadData();
      setEditingRecess(null);
      setRecessForm({
        nombre: '',
        horaInicio: '09:15',
        horaFin: '09:45',
        activo: true,
        descripcion: '',
      });
    } catch (err: any) {
      setRecessMsg({ type: 'error', text: err.message || 'Error al guardar receso institucional' });
    } finally {
      setSavingRecess(false);
    }
  };

  const handleToggleRecess = async (idReceso: number) => {
    try {
      await toggleReceso(idReceso);
      await loadData();
      setRecessMsg({ type: 'success', text: 'Estado del receso actualizado exitosamente.' });
    } catch (err: any) {
      setRecessMsg({ type: 'error', text: err.message || 'Error al alternar receso' });
    }
  };

  const handleDeleteRecess = async (idReceso: number) => {
    try {
      await deleteReceso(idReceso);
      setConfirmDeleteRecesoId(null);
      await loadData();
      setRecessMsg({ type: 'success', text: 'Receso eliminado correctamente del sistema.' });
    } catch (err: any) {
      setRecessMsg({ type: 'error', text: err.message || 'Error al eliminar receso' });
    }
  };

  // Salida (Departure Time) CRUD & Push Handlers
  const openSalidaModal = (sal?: SalidaInstitucional) => {
    setSalidaMsg(null);
    setConfirmDeleteSalidaId(null);
    if (sal) {
      setEditingSalida(sal);
      setSalidaForm({
        nombre: sal.nombre,
        horaSalida: sal.horaSalida.slice(0, 5),
        idAno: sal.idAno ?? null,
        activo: sal.activo,
        notificarPush: sal.notificarPush !== false,
        descripcion: sal.descripcion || '',
      });
    } else {
      setEditingSalida(null);
      setSalidaForm({
        nombre: 'Hora de Salida Oficial',
        horaSalida: '12:00',
        idAno: null,
        activo: true,
        notificarPush: true,
        descripcion: 'Fin de la jornada académica escolar y retiro de estudiantes',
      });
    }
    setSalidaModalOpen(true);
  };

  const handleSaveSalida = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSalida(true);
    setSalidaMsg(null);
    try {
      const payload = {
        nombre: salidaForm.nombre,
        horaSalida: salidaForm.horaSalida,
        idAno: salidaForm.idAno && Number(salidaForm.idAno) > 0 ? Number(salidaForm.idAno) : null,
        activo: salidaForm.activo,
        notificarPush: salidaForm.notificarPush,
        descripcion: salidaForm.descripcion,
      };
      if (editingSalida) {
        await updateSalida(editingSalida.idSalida, payload);
        setSalidaMsg({ type: 'success', text: 'Hora de salida actualizada correctamente.' });
      } else {
        await createSalida(payload);
        setSalidaMsg({ type: 'success', text: 'Hora de salida registrada correctamente.' });
      }
      await loadData();
      setEditingSalida(null);
      setSalidaForm({
        nombre: 'Hora de Salida Oficial',
        horaSalida: '12:00',
        idAno: null,
        activo: true,
        notificarPush: true,
        descripcion: '',
      });
    } catch (err: any) {
      setSalidaMsg({ type: 'error', text: err.message || 'Error al guardar hora de salida' });
    } finally {
      setSavingSalida(false);
    }
  };

  const handleToggleSalida = async (idSalida: number) => {
    try {
      await toggleSalida(idSalida);
      await loadData();
      setSalidaMsg({ type: 'success', text: 'Estado de la hora de salida actualizado.' });
    } catch (err: any) {
      setSalidaMsg({ type: 'error', text: err.message || 'Error al alternar estado' });
    }
  };

  const handleDeleteSalida = async (idSalida: number) => {
    try {
      await deleteSalida(idSalida);
      setConfirmDeleteSalidaId(null);
      await loadData();
      setSalidaMsg({ type: 'success', text: 'Hora de salida eliminada correctamente.' });
    } catch (err: any) {
      setSalidaMsg({ type: 'error', text: err.message || 'Error al eliminar hora de salida' });
    }
  };

  const handleNotifySalida = async (idSalida: number) => {
    setNotifyingSalidaId(idSalida);
    setSalidaPushToast(null);
    setSalidaMsg(null);
    try {
      const res = await notifySalidaPush(idSalida);
      await loadData();
      const msg = res.mensaje || 'Notificación de hora de salida procesada.';
      setSalidaPushToast({ type: res.sent > 0 || res.totalDispositivos === 0 ? 'success' : 'error', message: msg });
      if (salidaModalOpen) {
        setSalidaMsg({ type: res.sent > 0 || res.totalDispositivos === 0 ? 'success' : 'error', text: msg });
      }
    } catch (err: any) {
      const errMsg = err.message || 'Error al enviar notificación push de salida.';
      setSalidaPushToast({ type: 'error', message: errMsg });
      if (salidaModalOpen) {
        setSalidaMsg({ type: 'error', text: errMsg });
      }
    } finally {
      setNotifyingSalidaId(null);
    }
  };

  const handleAutoResolve = async () => {
    setAutoResolving(true);
    setAutoResolveToast(null);
    try {
      const res = await autoResolveHorarios();
      await loadData();
      setAutoResolveToast({
        type: 'success',
        message: `${res.message} (${res.totalBlocks} bloques analizados).`,
      });
    } catch (err: any) {
      setAutoResolveToast({
        type: 'error',
        message: err.message || 'Error al resolver automáticamente los conflictos.',
      });
    } finally {
      setAutoResolving(false);
    }
  };

  const handleLoadSuggestions = async () => {
    if (!form.idAno || !form.idSeccion || !form.idMateria) return;
    setLoadingSuggestions(true);
    try {
      const res = await fetchSuggestedSlots({
        idAno: form.idAno,
        idSeccion: form.idSeccion,
        idMateria: form.idMateria,
        aula: form.aula || undefined,
        idHorarioExcluir: editingHorario ? editingHorario.idHorario : undefined,
      });
      setSlotSuggestions(res);
    } catch (err) {
      console.error('Error fetching suggestions:', err);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  // Filtered schedules for grid
  const filteredGridHorarios = useMemo(() => {
    return horariosList.filter((h) => {
      const matchAno = h.idAno === selectedAnoId;
      const matchSeccion = selectedSeccionId === 0 || h.idSeccion === selectedSeccionId;
      const matchDocente = selectedDocenteId === 0 || h.idDocente === selectedDocenteId;
      return matchAno && matchSeccion && matchDocente;
    });
  }, [horariosList, selectedAnoId, selectedSeccionId, selectedDocenteId]);

  const canManage = currentUser?.rol === 'director' || currentUser?.rol === 'coordinador';

  return (
    <div className="space-y-6">
      {/* 1. Radar en Tiempo Real "En Clase Ahora" & Receso */}
      <div className="bg-white dark:bg-[#121212] rounded-3xl p-6 border border-slate-200 dark:border-[#27272A] shadow-sm relative overflow-hidden transition-colors">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-6 border-b border-slate-100 dark:border-[#27272A]">
          <div className="flex items-center space-x-3.5">
            <div className="relative">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-100 dark:border-indigo-800/60">
                <Compass className="w-6 h-6 animate-spin-slow" />
              </div>
              <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500"></span>
              </span>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-lg font-bold text-slate-900 dark:text-[#F4F4F5] tracking-tight">
                  Radar Académico en Tiempo Real
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60">
                  En Vivo
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-[#A1A1AA] mt-0.5">
                Detección automática de la clase activa o receso según la hora oficial
              </p>
            </div>
          </div>

          {/* Clock & Simulation Switch */}
          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
            <div className="flex items-center space-x-2 bg-slate-50 dark:bg-[#181818] px-3.5 py-2 rounded-2xl border border-slate-200 dark:border-[#27272A]">
              <Clock className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span className="font-mono font-bold text-sm text-slate-800 dark:text-[#F4F4F5]">
                {activeDay}, {activeTime}
              </span>
            </div>

            <button
              onClick={() => setUseSimulation(!useSimulation)}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer border ${
                useSimulation
                  ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700/60 shadow-2xs'
                  : 'bg-slate-100 dark:bg-[#181818] text-slate-600 dark:text-[#A1A1AA] border-slate-200 dark:border-[#27272A] hover:bg-slate-200 dark:hover:bg-[#222222]'
              }`}
            >
              <Sliders className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span>{useSimulation ? 'Modo Simulación Activo' : 'Simular Hora'}</span>
            </button>
          </div>
        </div>

        {/* Simulation Controls Strip */}
        {useSimulation && (
          <div className="mt-4 p-4 rounded-2xl bg-amber-50/70 dark:bg-[#181818] border border-amber-200 dark:border-amber-900/40 flex flex-wrap items-center gap-4 animate-in fade-in duration-200">
            <div className="flex items-center gap-1 text-xs font-bold text-amber-900 dark:text-amber-300">
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span>Simulador de Horario:</span>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs text-amber-800 dark:text-amber-200 font-semibold">Día:</label>
              <select
                value={simulatedDay}
                onChange={(e) => setSimulatedDay(e.target.value)}
                className="bg-white dark:bg-[#121212] border border-amber-300 dark:border-[#27272A] rounded-xl px-2.5 py-1 text-xs font-bold text-slate-800 dark:text-[#F4F4F5] focus:outline-none focus:border-amber-500"
              >
                {DIAS_SEMANA.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs text-amber-800 dark:text-amber-200 font-semibold">Hora:</label>
              <input
                type="time"
                value={simulatedTime}
                onChange={(e) => setSimulatedTime(e.target.value)}
                className="bg-white dark:bg-[#121212] border border-amber-300 dark:border-[#27272A] rounded-xl px-2.5 py-1 text-xs font-bold text-slate-800 dark:text-[#F4F4F5] font-mono focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>
        )}

        {/* Live Status Card: Recess OR Active Class OR Free Block */}
        <div className="mt-6">
          {liveClassStatus?.isRecess ? (
            <div className="p-6 rounded-2xl bg-amber-50/90 dark:bg-[#181818] border border-amber-200 dark:border-amber-900/50 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-center space-x-4">
                <div className="w-14 h-14 rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 flex items-center justify-center border border-amber-200 dark:border-amber-800/50 shrink-0">
                  <Coffee className="w-8 h-8 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-200/80 dark:bg-amber-950/80 text-amber-900 dark:text-amber-300 border border-transparent dark:border-amber-700/40">
                      Pausa Institucional
                    </span>
                    <span className="font-mono text-xs font-bold text-amber-800 dark:text-amber-400">
                      {liveClassStatus.recess?.horaInicio} - {liveClassStatus.recess?.horaFin}
                    </span>
                  </div>
                  <h3 className="text-xl font-black text-amber-950 dark:text-[#F4F4F5] mt-1">
                    {liveClassStatus.recess?.nombre}
                  </h3>
                  <p className="text-xs text-amber-800 dark:text-[#A1A1AA] mt-0.5">
                    {liveClassStatus.recess?.descripcion ||
                      'Los estudiantes y docentes se encuentran en receso pedagógico.'}
                  </p>
                </div>
              </div>

              <div className="bg-white/90 dark:bg-[#121212] backdrop-blur-md px-4 py-2.5 rounded-xl border border-amber-200 dark:border-[#27272A] text-center self-start md:self-auto">
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-400">
                  Estado
                </p>
                <p className="font-bold text-xs text-amber-900 dark:text-[#F4F4F5]">Sin clases en curso</p>
              </div>
            </div>
          ) : liveClassStatus?.isActive && liveClassStatus.block ? (
            <div className="p-6 rounded-2xl bg-gradient-to-r from-emerald-50 via-teal-50 to-indigo-50 dark:from-emerald-950/30 dark:via-[#181818] dark:to-indigo-950/30 border border-emerald-200 dark:border-emerald-500/30 shadow-xs">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-emerald-600 text-white">
                      En Clase Ahora
                    </span>
                    <span className="text-xs font-mono font-bold text-slate-700 dark:text-[#A1A1AA]">
                      {liveClassStatus.block.horaInicio} - {liveClassStatus.block.horaFin}
                    </span>
                    <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-white dark:bg-[#121212] text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60">
                      {liveClassStatus.block.aula || 'Aula 101'}
                    </span>
                  </div>

                  <h3 className="text-2xl font-black tracking-tight text-slate-900 dark:text-[#F4F4F5] pt-1">
                    {liveClassStatus.materia?.nombreMateria}
                  </h3>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-[#A1A1AA]">
                    <span className="font-semibold text-indigo-700 dark:text-indigo-400">
                      {anos.find((a) => a.idAno === liveClassStatus.block?.idAno)?.nombreNivel} - Sección{' '}
                      {liveClassStatus.seccion?.nombreSeccion}
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1 font-medium">
                      <User className="w-3.5 h-3.5 text-slate-400 dark:text-[#71717A]" />
                      {liveClassStatus.teacher
                        ? `${liveClassStatus.teacher.nombre} ${liveClassStatus.teacher.apellidos}`
                        : 'Profesor asignado'}
                    </span>
                  </div>
                </div>

                {onGoToAttendance && liveClassStatus.block && (
                  <button
                    onClick={() =>
                      onGoToAttendance(
                        liveClassStatus.block!.idMateria,
                        liveClassStatus.block!.idSeccion
                      )
                    }
                    className="px-5 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md dark:shadow-none flex items-center space-x-2 shrink-0 cursor-pointer"
                  >
                    <span>Ir al Pase de Asistencia</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Progress Bar */}
              <div className="mt-5 pt-4 border-t border-emerald-100 dark:border-[#27272A]">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-[#A1A1AA] mb-1.5">
                  <span>Progreso del bloque: {liveClassStatus.progressPercent}%</span>
                  <span>{liveClassStatus.remaining} min restantes</span>
                </div>
                <div className="w-full bg-white/80 dark:bg-[#27272A] rounded-full h-2 overflow-hidden border border-emerald-200 dark:border-[#3F3F46]">
                  <div
                    className="bg-emerald-500 dark:bg-emerald-400 h-full rounded-full transition-all duration-500"
                    style={{ width: `${liveClassStatus.progressPercent}%` }}
                  ></div>
                </div>
              </div>
            </div>
          ) : liveClassStatus?.isSalida && liveClassStatus.salida ? (
            <div className="p-6 rounded-2xl bg-sky-50/90 dark:bg-[#181818] border border-sky-200 dark:border-sky-900/50 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-center space-x-4">
                <div className="w-14 h-14 rounded-2xl bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-400 flex items-center justify-center border border-sky-200 dark:border-sky-800/50 shrink-0">
                  <DoorOpen className="w-8 h-8 text-sky-600 dark:text-sky-400" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-sky-200/80 dark:bg-sky-950/80 text-sky-900 dark:text-sky-300 border border-transparent dark:border-sky-700/40">
                      Hora de Salida Institucional
                    </span>
                    <span className="font-mono text-xs font-bold text-sky-800 dark:text-sky-400">
                      {liveClassStatus.salida.horaSalida.slice(0, 5)}
                    </span>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-white dark:bg-[#121212] text-sky-800 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
                      {liveClassStatus.salida.nombreNivel || 'Toda la institución'}
                    </span>
                  </div>
                  <h3 className="text-xl font-black text-sky-950 dark:text-[#F4F4F5] mt-1">
                    {liveClassStatus.salida.nombre}
                  </h3>
                  <p className="text-xs text-sky-800 dark:text-[#A1A1AA] mt-0.5">
                    {liveClassStatus.salida.descripcion ||
                      'Jornada académica finalizada. Los representantes reciben alerta push al llegar la hora de salida.'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleNotifySalida(liveClassStatus.salida!.idSalida)}
                disabled={notifyingSalidaId === liveClassStatus.salida.idSalida}
                className="px-4 py-2.5 rounded-2xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold transition-all shadow-sm flex items-center space-x-2 shrink-0 cursor-pointer disabled:opacity-50"
              >
                {notifyingSalidaId === liveClassStatus.salida.idSalida ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <BellRing className="w-4 h-4" />
                )}
                <span>Notificar Salida por Push</span>
              </button>
            </div>
          ) : (
            <div className="p-6 rounded-2xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] text-center py-8">
              <Clock className="w-8 h-8 text-slate-400 dark:text-[#71717A] mx-auto mb-2" />
              <h4 className="text-sm font-bold text-slate-700 dark:text-[#F4F4F5]">
                No hay clases programadas en este momento
              </h4>
              <p className="text-xs text-slate-400 dark:text-[#A1A1AA] mt-0.5">
                Para el año y sección seleccionados ({activeDay}, {activeTime})
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 2. Malla Semanal Interactiva & Gestión de Conflictos */}
      <div className="bg-white dark:bg-[#121212] rounded-3xl p-6 border border-slate-200 dark:border-[#27272A] shadow-sm transition-colors">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-100 dark:border-[#27272A]">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-[#F4F4F5] tracking-tight">
              Malla Horaria Semanal Oficial
            </h2>
            <p className="text-xs text-slate-500 dark:text-[#A1A1AA]">
              Distribución visual por días con detección inteligente de cruces de aulas, docentes y recesos institucionales
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canManage && (
              <>
                <button
                  type="button"
                  onClick={handleAutoResolve}
                  disabled={autoResolving}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 border border-emerald-200 dark:border-emerald-800 transition-colors flex items-center space-x-1.5 cursor-pointer shadow-2xs disabled:opacity-50"
                  title="Resolver automáticamente cualquier solapamiento o choque de materias, docentes o aulas físicas"
                >
                  <Wand2 className={`w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 ${autoResolving ? 'animate-spin' : ''}`} />
                  <span>{autoResolving ? 'Resolviendo...' : 'Auto-Resolver Cruces & Aulas'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => openRecessModal()}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 hover:bg-amber-100 dark:hover:bg-amber-900/60 border border-amber-200 dark:border-amber-800 transition-colors flex items-center space-x-1.5 cursor-pointer shadow-2xs"
                  title="Configurar bloques de receso escolar institucional"
                >
                  <Coffee className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <span>Configurar Recesos ({recesosList.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => openSalidaModal()}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold text-sky-800 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/50 hover:bg-sky-100 dark:hover:bg-sky-900/60 border border-sky-200 dark:border-sky-800 transition-colors flex items-center space-x-1.5 cursor-pointer shadow-2xs"
                  title="Configurar hora oficial de salida y notificación push"
                >
                  <DoorOpen className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                  <span>Configurar Salida ({salidasList.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => openModal()}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100 dark:shadow-none flex items-center space-x-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Nuevo Bloque Horario</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Auto-Resolve Toast Notification */}
        {autoResolveToast && (
          <div
            className={`mt-4 p-3.5 rounded-2xl flex items-center justify-between border ${
              autoResolveToast.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200'
            }`}
          >
            <div className="flex items-center space-x-2 text-xs font-bold">
              {autoResolveToast.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
              )}
              <span>{autoResolveToast.message}</span>
            </div>
            <button
              onClick={() => setAutoResolveToast(null)}
              className="text-xs font-bold px-2 py-0.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Institutional Recesses Bar */}
        {recesosList.length > 0 && (
          <div className="mt-4 p-3.5 rounded-2xl bg-amber-50/90 dark:bg-amber-950/25 border border-amber-200 dark:border-amber-800/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-xs font-bold text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                <Coffee className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>Recesos Institucionales Oficiales:</span>
              </span>
              <div className="flex flex-wrap gap-2">
                {recesosList.map((rec) => (
                  <div
                    key={rec.idReceso}
                    className={`inline-flex items-center gap-2 text-xs px-3 py-1 rounded-xl border transition-all ${
                      rec.activo !== false
                        ? 'bg-white dark:bg-[#181818] text-amber-900 dark:text-amber-200 border-amber-200 dark:border-amber-800/80 shadow-2xs'
                        : 'bg-slate-100 dark:bg-[#181818]/50 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-[#27272A] opacity-75'
                    }`}
                    title={rec.descripcion || rec.nombre}
                  >
                    <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                    <span className="font-bold">{rec.nombre}</span>
                    <span className="font-mono font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 px-1.5 py-0.5 rounded-md border border-amber-200/60 dark:border-amber-800/60">
                      {rec.horaInicio.slice(0, 5)} - {rec.horaFin.slice(0, 5)}
                    </span>
                    {rec.descripcion && (
                      <span className="hidden md:inline text-[11px] text-amber-700/80 dark:text-amber-300/70 font-normal">
                        • {rec.descripcion}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {canManage && (
              <span className="text-[11px] text-amber-700 dark:text-amber-400/90 font-medium shrink-0">
                (Aplica para todos los años y secciones)
              </span>
            )}
          </div>
        )}

        {/* Departure Push Dispatch Toast */}
        {salidaPushToast && (
          <div
            className={`mt-4 p-3.5 rounded-2xl flex items-center justify-between border ${
              salidaPushToast.type === 'success'
                ? 'bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-800 text-sky-900 dark:text-sky-200'
                : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200'
            }`}
          >
            <div className="flex items-center space-x-2 text-xs font-bold">
              {salidaPushToast.type === 'success' ? (
                <BellRing className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
              )}
              <span>{salidaPushToast.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setSalidaPushToast(null)}
              className="text-xs font-bold px-2 py-0.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Institutional Departure Times Bar */}
        {salidasList.length > 0 && (
          <div className="mt-4 p-3.5 rounded-2xl bg-sky-50/90 dark:bg-sky-950/25 border border-sky-200 dark:border-sky-800/70 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-sky-900 dark:text-sky-300 flex items-center gap-1.5">
                <DoorOpen className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
                <span>Hora de Salida Institucional Oficial:</span>
              </span>
              <span className="text-[11px] text-sky-700 dark:text-sky-400/90 font-medium">
                Las alertas push se envían automáticamente al llegar la hora o de forma manual
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              {salidasList.map((sal) => (
                <div
                  key={sal.idSalida}
                  className={`inline-flex flex-wrap items-center gap-2 text-xs px-3 py-1.5 rounded-xl border transition-all ${
                    sal.activo !== false
                      ? 'bg-white dark:bg-[#181818] text-sky-900 dark:text-sky-200 border-sky-200 dark:border-sky-800/80 shadow-2xs'
                      : 'bg-slate-100 dark:bg-[#181818]/50 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-[#27272A] opacity-75'
                  }`}
                  title={sal.descripcion || sal.nombre}
                >
                  <span className="w-2 h-2 rounded-full bg-sky-500 shrink-0" />
                  <span className="font-bold">{sal.nombre}</span>
                  <span className="font-mono font-bold text-sky-700 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/60 px-1.5 py-0.5 rounded-md border border-sky-200/60 dark:border-sky-800/60">
                    {sal.horaSalida.slice(0, 5)}
                  </span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#27272A] text-slate-600 dark:text-slate-300">
                    {sal.nombreNivel || 'Toda la institución'}
                  </span>
                  {sal.notificarPush && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
                      Push Auto
                    </span>
                  )}
                  {sal.activo !== false && (
                    <button
                      type="button"
                      onClick={() => handleNotifySalida(sal.idSalida)}
                      disabled={notifyingSalidaId === sal.idSalida}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-[10px] font-bold cursor-pointer disabled:opacity-50 transition-colors"
                      title="Enviar notificación push de hora de salida ahora a los representantes"
                    >
                      {notifyingSalidaId === sal.idSalida ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Send className="w-3 h-3" />
                      )}
                      <span>Notificar Salida</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filters Bar: Año, Sección, Docente */}
        <div className="mt-5 p-4 rounded-2xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A]">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Año Escolar:
              </label>
              <select
                value={selectedAnoId}
                onChange={(e) => {
                  const newAno = Number(e.target.value);
                  setSelectedAnoId(newAno);
                  const firstSec = secciones.find((s) => s.idAno === newAno)?.idSeccion || 0;
                  setSelectedSeccionId(firstSec);
                }}
                className="w-full px-3 py-2 rounded-xl text-xs font-bold border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121212] text-slate-900 dark:text-[#F4F4F5] focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                {anos.map((a) => (
                  <option key={a.idAno} value={a.idAno}>
                    {a.nombreNivel}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Sección:
              </label>
              <select
                value={selectedSeccionId}
                onChange={(e) => setSelectedSeccionId(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl text-xs font-bold border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121212] text-slate-900 dark:text-[#F4F4F5] focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                <option value={0}>Todas las secciones</option>
                {availableSecciones.map((s) => (
                  <option key={s.idSeccion} value={s.idSeccion}>
                    Sección {s.nombreSeccion}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Filtrar por Docente:
              </label>
              <select
                value={selectedDocenteId}
                onChange={(e) => setSelectedDocenteId(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl text-xs font-bold border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#121212] text-slate-900 dark:text-[#F4F4F5] focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                <option value={0}>Todos los docentes</option>
                {staffUsers
                  .filter((u) => u.rol === 'docente')
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.nombre} {d.apellidos}
                    </option>
                  ))}
              </select>
            </div>
          </div>
        </div>

        {/* Loading / Error States */}
        {loading && (
          <div className="py-12 text-center text-slate-400 dark:text-slate-500 text-xs">
            Cargando horarios escolares...
          </div>
        )}

        {error && (
          <div className="p-4 my-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Weekly Day Columns Grid */}
        {!loading && (
          <>
            {/* Mobile & Tablet View (< lg): Interactive Day Selector Tabs */}
            <div className="lg:hidden mt-6 space-y-4">
              <div className="relative">
                <div className="flex items-center gap-1.5 p-1.5 bg-slate-100 dark:bg-[#181818] rounded-2xl border border-slate-200 dark:border-[#27272A] overflow-x-auto scrollbar-none">
                  {DIAS_SEMANA.map((dia) => {
                    const isSelected = selectedDayTab === dia;
                    const isToday = dia === activeDay;
                    const count = filteredGridHorarios.filter((h) => h.diaSemana === dia).length;
                    return (
                      <button
                        key={dia}
                        type="button"
                        onClick={() => setSelectedDayTab(dia)}
                        className={`flex-1 min-w-[72px] py-2.5 px-2 rounded-xl text-xs font-bold transition-all text-center flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
                          isSelected
                            ? 'bg-white dark:bg-[#27272A] text-indigo-700 dark:text-indigo-400 shadow-xs border border-slate-200/80 dark:border-[#3F3F46]'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-1">
                          <span>{dia}</span>
                          {isToday && (
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                          )}
                        </div>
                        <span className="text-[10px] opacity-75 font-normal">
                          {count} {count === 1 ? 'bloque' : 'bloques'}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {/* Subtle right scroll fade gradient indicator */}
                <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-slate-100 dark:from-[#181818] to-transparent rounded-r-2xl" />
              </div>

              {/* Single Day Card for Mobile/Tablet */}
              {(() => {
                const dia = selectedDayTab;
                const dayBlocks = filteredGridHorarios
                  .filter((h) => h.diaSemana === dia)
                  .sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));
                const isToday = dia === activeDay;
                const activeRecesos = recesosList
                  .filter((r) => r.activo !== false)
                  .sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));
                const activeSalidas = salidasList
                  .filter((s) => s.activo !== false && (!s.idAno || s.idAno === selectedAnoId))
                  .sort((a, b) => a.horaSalida.localeCompare(b.horaSalida));

                return (
                  <div
                    className={`rounded-2xl border p-4 sm:p-5 flex flex-col transition-all ${
                      isToday
                        ? 'border-indigo-300 dark:border-indigo-800 bg-indigo-50/20 dark:bg-indigo-950/20 ring-2 ring-indigo-200 dark:ring-indigo-900/40'
                        : 'border-slate-200 dark:border-[#27272A] bg-slate-50/50 dark:bg-[#181818]'
                    }`}
                  >
                    <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200/80 dark:border-[#27272A]">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-base text-slate-800 dark:text-[#F4F4F5]">
                          Horario del {dia}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                          ({dayBlocks.length} {dayBlocks.length === 1 ? 'materia' : 'materias'})
                        </span>
                      </div>
                      {isToday && (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-600 text-white">
                          Día de hoy
                        </span>
                      )}
                    </div>

                    {dayBlocks.length === 0 ? (
                      <div className="space-y-3">
                        <div className="py-8 text-center text-slate-400 dark:text-slate-500 text-xs">
                          No hay materias programadas para el {dia} con los filtros actuales.
                        </div>
                        {activeRecesos.map((rec) => (
                          <div
                            key={rec.idReceso}
                            className="py-2.5 px-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/35 text-amber-900 dark:text-amber-200 border border-dashed border-amber-300 dark:border-amber-800/70 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-1"
                          >
                            <div className="flex items-center gap-2 font-bold">
                              <Coffee className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                              <span>{rec.nombre}</span>
                            </div>
                            <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-white dark:bg-[#121212] text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                              {rec.horaInicio.slice(0, 5)} - {rec.horaFin.slice(0, 5)}
                            </span>
                          </div>
                        ))}
                        {activeSalidas.map((sal) => (
                          <div
                            key={sal.idSalida}
                            className="py-2.5 px-3.5 rounded-xl bg-sky-50 dark:bg-sky-950/35 text-sky-900 dark:text-sky-200 border border-dashed border-sky-300 dark:border-sky-800/70 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-1"
                          >
                            <div className="flex items-center gap-2 font-bold">
                              <DoorOpen className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
                              <span>{sal.nombre}</span>
                            </div>
                            <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-white dark:bg-[#121212] text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
                              {sal.horaSalida.slice(0, 5)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {dayBlocks.map((block, idx) => {
                          const teacher = getTeacherForMateria(block.idMateria);
                          const nextBlock = dayBlocks[idx + 1];
                          const bStart = block.horaInicio.slice(0, 5);
                          const bEnd = block.horaFin.slice(0, 5);
                          const nextStart = nextBlock ? nextBlock.horaInicio.slice(0, 5) : null;

                          const recesosBeforeFirst =
                            idx === 0
                              ? activeRecesos.filter((r) => r.horaFin.slice(0, 5) <= bStart)
                              : [];

                          const recesosAfter = activeRecesos.filter((r) => {
                            const rStart = r.horaInicio.slice(0, 5);
                            const rEnd = r.horaFin.slice(0, 5);
                            return bEnd <= rStart && (!nextStart || nextStart >= rEnd);
                          });

                          return (
                            <React.Fragment key={block.idHorario}>
                              {recesosBeforeFirst.map((rec) => (
                                <div
                                  key={`before-${rec.idReceso}`}
                                  className="py-2.5 px-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/35 text-amber-900 dark:text-amber-200 border border-dashed border-amber-300 dark:border-amber-800/70 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-1"
                                >
                                  <div className="flex items-center gap-2 font-bold">
                                    <Coffee className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                                    <span>{rec.nombre}</span>
                                    {rec.descripcion && (
                                      <span className="font-normal text-[11px] text-amber-700/80 dark:text-amber-300/75">
                                        ({rec.descripcion})
                                      </span>
                                    )}
                                  </div>
                                  <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-white dark:bg-[#121212] text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 self-start sm:self-auto">
                                    {rec.horaInicio.slice(0, 5)} - {rec.horaFin.slice(0, 5)}
                                  </span>
                                </div>
                              ))}

                              <div className="p-3.5 sm:p-4 rounded-xl bg-white dark:bg-[#121212] border border-slate-200/90 dark:border-[#27272A] shadow-2xs hover:shadow-sm transition-all relative">
                                <div className="flex items-center justify-between text-xs font-bold text-indigo-700 dark:text-indigo-400 mb-1.5">
                                  <span className="font-mono bg-indigo-50 dark:bg-indigo-950/50 px-2.5 py-1 rounded-md">
                                    {block.horaInicio.slice(0, 5)} - {block.horaFin.slice(0, 5)}
                                  </span>
                                  <span className="text-xs px-2.5 py-1 rounded-md bg-slate-100 dark:bg-[#27272A] text-slate-700 dark:text-slate-300 font-medium">
                                    {block.aula || 'Aula 101'}
                                  </span>
                                </div>

                                <p className="font-bold text-sm text-slate-900 dark:text-[#F4F4F5] leading-snug pt-0.5">
                                  {block.nombreMateria}
                                </p>

                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 flex items-center gap-1.5">
                                  <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                  <span>{teacher ? `${teacher.nombre} ${teacher.apellidos}` : 'Docente asignado'}</span>
                                </p>

                                {canManage && (
                                  <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-[#27272A] flex items-center justify-end space-x-2">
                                    <button
                                      type="button"
                                      onClick={() => openModal(block)}
                                      className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors flex items-center gap-1.5 cursor-pointer"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                      <span>Editar</span>
                                    </button>
                                    {confirmDeleteHorarioId === block.idHorario ? (
                                      <div className="flex items-center gap-1.5 animate-in fade-in duration-150">
                                        <span className="text-[11px] font-bold text-rose-600 dark:text-rose-400">¿Eliminar?</span>
                                        <button
                                          type="button"
                                          onClick={() => handleDelete(block)}
                                          className="px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-600 text-white hover:bg-rose-700 cursor-pointer"
                                        >
                                          Sí, borrar
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setConfirmDeleteHorarioId(null)}
                                          className="px-2 py-1 rounded-lg text-xs font-bold bg-slate-200 dark:bg-[#27272A] text-slate-700 dark:text-slate-300 hover:bg-slate-300 cursor-pointer"
                                        >
                                          Cancelar
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => setConfirmDeleteHorarioId(block.idHorario)}
                                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors flex items-center gap-1.5 cursor-pointer"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                        <span>Eliminar</span>
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>

                              {recesosAfter.map((rec) => (
                                <div
                                  key={`after-${block.idHorario}-${rec.idReceso}`}
                                  className="py-2.5 px-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/35 text-amber-900 dark:text-amber-200 border border-dashed border-amber-300 dark:border-amber-800/70 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-1"
                                >
                                  <div className="flex items-center gap-2 font-bold">
                                    <Coffee className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                                    <span>{rec.nombre}</span>
                                    {rec.descripcion && (
                                      <span className="font-normal text-[11px] text-amber-700/80 dark:text-amber-300/75">
                                        ({rec.descripcion})
                                      </span>
                                    )}
                                  </div>
                                  <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-white dark:bg-[#121212] text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 self-start sm:self-auto">
                                    {rec.horaInicio.slice(0, 5)} - {rec.horaFin.slice(0, 5)}
                                  </span>
                                </div>
                              ))}
                            </React.Fragment>
                          );
                        })}

                        {activeSalidas.map((sal) => (
                          <div
                            key={`mob-sal-${sal.idSalida}`}
                            className="py-2.5 px-3.5 rounded-xl bg-sky-50 dark:bg-sky-950/35 text-sky-900 dark:text-sky-200 border border-dashed border-sky-300 dark:border-sky-800/70 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-1"
                            title={sal.descripcion || sal.nombre}
                          >
                            <div className="flex items-center gap-2 font-bold">
                              <DoorOpen className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
                              <span>{sal.nombre}</span>
                              {sal.notificarPush && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-100 dark:bg-sky-900/60 text-sky-700 dark:text-sky-300">
                                  Push
                                </span>
                              )}
                            </div>
                            <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-white dark:bg-[#121212] text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 self-start sm:self-auto">
                              {sal.horaSalida.slice(0, 5)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Desktop View (>= lg): Panoramic 5-Day Columns */}
            <div className="hidden lg:grid lg:grid-cols-5 gap-4 mt-6">
              {DIAS_SEMANA.map((dia) => {
                const dayBlocks = filteredGridHorarios
                  .filter((h) => h.diaSemana === dia)
                  .sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));

                const isToday = dia === activeDay;
                const activeRecesos = recesosList
                  .filter((r) => r.activo !== false)
                  .sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));
                const activeSalidas = salidasList
                  .filter((s) => s.activo !== false && (!s.idAno || s.idAno === selectedAnoId))
                  .sort((a, b) => a.horaSalida.localeCompare(b.horaSalida));

                return (
                  <div
                    key={dia}
                    className={`rounded-2xl border p-4 flex flex-col transition-all ${
                      isToday
                        ? 'border-indigo-300 dark:border-indigo-800 bg-indigo-50/20 dark:bg-indigo-950/20 ring-2 ring-indigo-200 dark:ring-indigo-900/40'
                        : 'border-slate-200 dark:border-[#27272A] bg-slate-50/50 dark:bg-[#181818]'
                    }`}
                  >
                    <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200/80 dark:border-[#27272A]">
                      <span className="font-extrabold text-sm text-slate-800 dark:text-[#F4F4F5]">{dia}</span>
                      {isToday && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-600 text-white">
                          Hoy
                        </span>
                      )}
                    </div>

                    {dayBlocks.length === 0 ? (
                      <div className="space-y-2.5 flex-1">
                        <div className="py-6 text-center text-slate-400 dark:text-slate-500 text-xs">
                          Sin bloques asignados
                        </div>
                        {activeRecesos.map((rec) => (
                          <div
                            key={rec.idReceso}
                            className="py-1.5 px-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/35 text-amber-900 dark:text-amber-200 border border-dashed border-amber-300 dark:border-amber-800/70 text-[10px] font-bold flex flex-col items-center justify-center gap-0.5 text-center"
                          >
                            <div className="flex items-center gap-1">
                              <Coffee className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
                              <span>{rec.nombre}</span>
                            </div>
                            <span className="font-mono text-[10px] text-amber-700 dark:text-amber-400">
                              {rec.horaInicio.slice(0, 5)} - {rec.horaFin.slice(0, 5)}
                            </span>
                          </div>
                        ))}
                        {activeSalidas.map((sal) => (
                          <div
                            key={sal.idSalida}
                            className="py-1.5 px-2.5 rounded-xl bg-sky-50 dark:bg-sky-950/35 text-sky-900 dark:text-sky-200 border border-dashed border-sky-300 dark:border-sky-800/70 text-[10px] font-bold flex flex-col items-center justify-center gap-0.5 text-center"
                          >
                            <div className="flex items-center gap-1">
                              <DoorOpen className="w-3 h-3 text-sky-600 dark:text-sky-400 shrink-0" />
                              <span>{sal.nombre}</span>
                            </div>
                            <span className="font-mono text-[10px] text-sky-700 dark:text-sky-400">
                              {sal.horaSalida.slice(0, 5)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-2.5 flex-1">
                        {dayBlocks.map((block, idx) => {
                          const teacher = getTeacherForMateria(block.idMateria);
                          const nextBlock = dayBlocks[idx + 1];
                          const bStart = block.horaInicio.slice(0, 5);
                          const bEnd = block.horaFin.slice(0, 5);
                          const nextStart = nextBlock ? nextBlock.horaInicio.slice(0, 5) : null;

                          const recesosBeforeFirst =
                            idx === 0
                              ? activeRecesos.filter((r) => r.horaFin.slice(0, 5) <= bStart)
                              : [];

                          // Check which active recesses fall between this block and next
                          const recesosAfter = activeRecesos.filter((r) => {
                            const rStart = r.horaInicio.slice(0, 5);
                            const rEnd = r.horaFin.slice(0, 5);
                            return bEnd <= rStart && (!nextStart || nextStart >= rEnd);
                          });

                          return (
                            <React.Fragment key={block.idHorario}>
                              {recesosBeforeFirst.map((rec) => (
                                <div
                                  key={`before-lg-${rec.idReceso}`}
                                  className="py-1.5 px-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/35 text-amber-900 dark:text-amber-200 border border-dashed border-amber-300 dark:border-amber-800/70 text-[10px] font-bold flex flex-col items-center justify-center gap-0.5 text-center"
                                  title={rec.descripcion || rec.nombre}
                                >
                                  <div className="flex items-center gap-1">
                                    <Coffee className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
                                    <span>{rec.nombre}</span>
                                  </div>
                                  <span className="font-mono text-[10px] text-amber-700 dark:text-amber-400">
                                    {rec.horaInicio.slice(0, 5)} - {rec.horaFin.slice(0, 5)}
                                  </span>
                                </div>
                              ))}

                              <div className="p-3 rounded-xl bg-white dark:bg-[#121212] border border-slate-200/90 dark:border-[#27272A] shadow-2xs hover:shadow-sm transition-all relative group">
                                <div className="flex items-center justify-between text-[11px] font-bold text-indigo-700 dark:text-indigo-400 mb-1">
                                  <span className="font-mono">
                                    {block.horaInicio.slice(0, 5)} - {block.horaFin.slice(0, 5)}
                                  </span>
                                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-[#27272A] text-slate-600 dark:text-slate-300 font-medium">
                                    {block.aula || 'Aula 101'}
                                  </span>
                                </div>

                                <p className="font-bold text-xs text-slate-900 dark:text-[#F4F4F5] leading-tight">
                                  {block.nombreMateria}
                                </p>

                                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1">
                                  <User className="w-3 h-3 text-slate-400" />
                                  <span className="truncate">
                                    {teacher ? `${teacher.nombre} ${teacher.apellidos}` : 'Docente asignado'}
                                  </span>
                                </p>

                                {/* Management Actions for Director / Coordinador */}
                                {canManage && (
                                  <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-[#27272A] flex items-center justify-end space-x-1.5">
                                    <button
                                      type="button"
                                      onClick={() => openModal(block)}
                                      className="p-1 rounded text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors cursor-pointer"
                                      title="Editar bloque"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    {confirmDeleteHorarioId === block.idHorario ? (
                                      <div className="flex items-center gap-1 animate-in fade-in duration-150">
                                        <button
                                          type="button"
                                          onClick={() => handleDelete(block)}
                                          className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-600 text-white hover:bg-rose-700 cursor-pointer"
                                        >
                                          Borrar
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setConfirmDeleteHorarioId(null)}
                                          className="px-1 py-0.5 rounded text-[10px] font-bold bg-slate-200 dark:bg-[#27272A] text-slate-700 dark:text-slate-300 hover:bg-slate-300 cursor-pointer"
                                        >
                                          ✕
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => setConfirmDeleteHorarioId(block.idHorario)}
                                        className="p-1 rounded text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                                        title="Eliminar bloque"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>

                              {recesosAfter.map((rec) => (
                                <div
                                  key={`after-lg-${block.idHorario}-${rec.idReceso}`}
                                  className="py-1.5 px-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/35 text-amber-900 dark:text-amber-200 border border-dashed border-amber-300 dark:border-amber-800/70 text-[10px] font-bold flex flex-col items-center justify-center gap-0.5 text-center"
                                  title={rec.descripcion || rec.nombre}
                                >
                                  <div className="flex items-center gap-1">
                                    <Coffee className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
                                    <span>{rec.nombre}</span>
                                  </div>
                                  <span className="font-mono text-[10px] text-amber-700 dark:text-amber-400">
                                    {rec.horaInicio.slice(0, 5)} - {rec.horaFin.slice(0, 5)}
                                  </span>
                                </div>
                              ))}
                            </React.Fragment>
                          );
                        })}

                        {activeSalidas.map((sal) => (
                          <div
                            key={`lg-sal-${sal.idSalida}`}
                            className="py-1.5 px-2.5 rounded-xl bg-sky-50 dark:bg-sky-950/35 text-sky-900 dark:text-sky-200 border border-dashed border-sky-300 dark:border-sky-800/70 text-[10px] font-bold flex flex-col items-center justify-center gap-0.5 text-center"
                            title={sal.descripcion || sal.nombre}
                          >
                            <div className="flex items-center gap-1">
                              <DoorOpen className="w-3 h-3 text-sky-600 dark:text-sky-400 shrink-0" />
                              <span>{sal.nombre}</span>
                            </div>
                            <span className="font-mono text-[10px] text-sky-700 dark:text-sky-400">
                              {sal.horaSalida.slice(0, 5)} {sal.notificarPush ? '• Push' : ''}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* 3. Add / Edit Block Modal with LIVE Anticonflict Validator */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-[#121212] rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 dark:border-[#27272A] p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-[#27272A] mb-4">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-xl">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900 dark:text-[#F4F4F5]">
                    {editingHorario ? 'Modificar Bloque Horario' : 'Crear Nuevo Bloque Horario'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-[#A1A1AA]">
                    Sistema con validación inteligente anticonflicto en tiempo real
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formMessage && (
              <div
                className={`p-3 rounded-xl mb-4 text-xs font-semibold flex items-center gap-2 ${
                  formMessage.type === 'success'
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800'
                    : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 border border-rose-200 dark:border-rose-800'
                }`}
              >
                {formMessage.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                )}
                <span>{formMessage.text}</span>
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Año Escolar:
                  </label>
                  <select
                    value={form.idAno}
                    onChange={(e) => {
                      const newAno = Number(e.target.value);
                      const firstSec = secciones.find((s) => s.idAno === newAno)?.idSeccion || 0;
                      const firstMat = materias.find((m) => m.idAno === newAno)?.idMateria || 0;
                      setForm((prev) => ({
                        ...prev,
                        idAno: newAno,
                        idSeccion: firstSec,
                        idMateria: firstMat,
                      }));
                    }}
                    className="w-full px-3 py-2 rounded-xl text-xs font-bold border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#181818] text-slate-900 dark:text-[#F4F4F5] cursor-pointer"
                  >
                    {anos.map((a) => (
                      <option key={a.idAno} value={a.idAno}>
                        {a.nombreNivel}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Sección:
                  </label>
                  <select
                    value={form.idSeccion}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, idSeccion: Number(e.target.value) }))
                    }
                    className="w-full px-3 py-2 rounded-xl text-xs font-bold border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#181818] text-slate-900 dark:text-[#F4F4F5] cursor-pointer"
                  >
                    {secciones
                      .filter((s) => s.idAno === form.idAno)
                      .map((s) => (
                        <option key={s.idSeccion} value={s.idSeccion}>
                          Sección {s.nombreSeccion}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Materia Asignada (Pensum Oficial):
                </label>
                <select
                  value={form.idMateria}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, idMateria: Number(e.target.value) }))
                  }
                  className="w-full px-3 py-2 rounded-xl text-xs font-bold border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#181818] text-slate-900 dark:text-[#F4F4F5] cursor-pointer"
                >
                  {materias
                    .filter((m) => m.idAno === form.idAno)
                    .map((m) => (
                      <option key={m.idMateria} value={m.idMateria}>
                        {m.nombreMateria}
                      </option>
                    ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Día:
                  </label>
                  <select
                    value={form.diaSemana}
                    onChange={(e) => setForm((prev) => ({ ...prev, diaSemana: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl text-xs font-bold border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#181818] text-slate-900 dark:text-[#F4F4F5] cursor-pointer"
                  >
                    {DIAS_SEMANA.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Hora Inicio:
                  </label>
                  <input
                    type="time"
                    value={form.horaInicio}
                    onChange={(e) => setForm((prev) => ({ ...prev, horaInicio: e.target.value }))}
                    className="w-full px-3 py-1.5 rounded-xl text-xs font-bold border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#181818] font-mono text-slate-900 dark:text-[#F4F4F5]"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Hora Fin:
                  </label>
                  <input
                    type="time"
                    value={form.horaFin}
                    onChange={(e) => setForm((prev) => ({ ...prev, horaFin: e.target.value }))}
                    className="w-full px-3 py-1.5 rounded-xl text-xs font-bold border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#181818] font-mono text-slate-900 dark:text-[#F4F4F5]"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Aula / Espacio Físico:
                </label>
                <input
                  type="text"
                  value={form.aula}
                  onChange={(e) => setForm((prev) => ({ ...prev, aula: e.target.value }))}
                  placeholder="Ej: Aula 101, Lab de Biología, Cancha Techada"
                  className="w-full px-3.5 py-2 rounded-xl text-xs font-medium border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#181818] text-slate-900 dark:text-[#F4F4F5] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* LIVE Anticonflict Feedback Card */}
              <div className="pt-2">
                {conflictChecking ? (
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#181818] text-slate-500 dark:text-[#A1A1AA] text-xs flex items-center gap-2">
                    <Clock className="w-4 h-4 animate-spin text-indigo-600 dark:text-indigo-400" />
                    <span>Verificando disponibilidad de docente, aula y sección...</span>
                  </div>
                ) : conflictResult?.hasConflict ? (
                  <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-rose-800 dark:text-rose-300">
                      <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                      <span>Conflicto de Horario Detectado:</span>
                    </div>

                    <ul className="space-y-1 pl-5 list-disc text-[11px] text-rose-700 dark:text-rose-300">
                      {conflictResult.conflicts.map((c, i) => (
                        <li key={i}>{c.message}</li>
                      ))}
                    </ul>

                    {/* Auto-suggest conflict-free slots */}
                    <div className="pt-2 border-t border-rose-200/80 dark:border-rose-800/60 space-y-2">
                      <div className="flex items-center justify-between">
                        <button
                          type="button"
                          onClick={handleLoadSuggestions}
                          disabled={loadingSuggestions}
                          className="text-[11px] font-bold text-indigo-700 dark:text-indigo-300 bg-white dark:bg-[#181818] hover:bg-indigo-50 dark:hover:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 px-3 py-1.5 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-2xs"
                        >
                          <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
                          <span>{loadingSuggestions ? 'Buscando huecos libres...' : 'Sugerir Horarios Libres'}</span>
                        </button>
                      </div>

                      {slotSuggestions.length > 0 && (
                        <div className="p-2.5 rounded-xl bg-white/90 dark:bg-[#181818] border border-indigo-200 dark:border-indigo-800 space-y-1.5 animate-in fade-in duration-200">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-900 dark:text-indigo-300">
                            Huecos Disponibles (Sin Choque con Aulas/Docente/Receso):
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {slotSuggestions.map((s, idx) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => {
                                  setForm((prev) => ({
                                    ...prev,
                                    diaSemana: s.diaSemana,
                                    horaInicio: s.horaInicio,
                                    horaFin: s.horaFin,
                                    aula: s.aula,
                                  }));
                                  setSlotSuggestions([]);
                                }}
                                className="px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 border border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 font-bold rounded-lg text-[10px] cursor-pointer flex items-center gap-1 shadow-2xs transition-all"
                                title="Haga clic para aplicar este bloque automáticamente"
                              >
                                <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                                <span>{s.bloqueTexto} ({s.aula})</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="pt-2 border-t border-rose-200/80 dark:border-rose-800/60 flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="overrideCheck"
                        checked={forceOverride}
                        onChange={(e) => setForceOverride(e.target.checked)}
                        className="rounded border-rose-300 text-rose-600 focus:ring-rose-500"
                      />
                      <label htmlFor="overrideCheck" className="text-[11px] font-bold text-rose-900 dark:text-rose-200 cursor-pointer">
                        Ignorar advertencia y forzar este bloque horario
                      </label>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/35 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span className="font-semibold">
                      Horario disponible: Sin colisión de aula, docente, recesos ni hora de salida.
                    </span>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-[#27272A] flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#181818] transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={formSaving || (conflictResult?.hasConflict && !forceOverride)}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-100 dark:shadow-none transition-all disabled:opacity-50 cursor-pointer"
                >
                  {formSaving ? 'Guardando...' : editingHorario ? 'Actualizar' : 'Crear Bloque'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. Recess Management Modal */}
      {recessModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-[#121212] rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 dark:border-[#27272A] p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-[#27272A] mb-4">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 rounded-xl">
                  <Coffee className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900 dark:text-[#F4F4F5]">
                    Recesos Institucionales Oficiales
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-[#A1A1AA]">
                    Definición de pausas pedagógicas para toda la institución
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRecessModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Recess Status Feedback Banner */}
            {recessMsg && (
              <div
                className={`mb-4 p-3 rounded-xl text-xs font-bold flex items-center justify-between border ${
                  recessMsg.type === 'success'
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                    : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
                }`}
              >
                <span>{recessMsg.text}</span>
                <button
                  type="button"
                  onClick={() => setRecessMsg(null)}
                  className="text-xs font-bold px-1.5 py-0.5 rounded hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}

            {/* List of existing recesses */}
            <div className="space-y-2 mb-5">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Recesos Actuales ({recesosList.length}):
              </p>
              {recesosList.length === 0 ? (
                <div className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-[#27272A] text-center text-xs text-slate-400 dark:text-slate-500">
                  No hay recesos registrados actualmente.
                </div>
              ) : (
                recesosList.map((rec) => (
                  <div
                    key={rec.idReceso}
                    className="p-3 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#181818] flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-xs text-slate-900 dark:text-[#F4F4F5]">{rec.nombre}</span>
                        <span className="font-mono text-[11px] font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-800">
                          {rec.horaInicio.slice(0, 5)} - {rec.horaFin.slice(0, 5)}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleToggleRecess(rec.idReceso)}
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border cursor-pointer transition-all ${
                            rec.activo
                              ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                              : 'bg-slate-200 dark:bg-[#27272A] text-slate-600 dark:text-slate-400 border-slate-300 dark:border-[#3F3F46]'
                          }`}
                          title="Clic para activar o desactivar este receso"
                        >
                          {rec.activo ? '● Activo' : '○ Inactivo'}
                        </button>
                      </div>
                      {rec.descripcion && (
                        <p className="text-[11px] text-slate-500 dark:text-[#A1A1AA] mt-0.5">{rec.descripcion}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 self-end sm:self-auto">
                      <button
                        type="button"
                        onClick={() => openRecessModal(rec)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 cursor-pointer"
                        title="Editar"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      {confirmDeleteRecesoId === rec.idReceso ? (
                        <div className="flex items-center gap-1 animate-in fade-in duration-150">
                          <button
                            type="button"
                            onClick={() => handleDeleteRecess(rec.idReceso)}
                            className="px-2 py-1 rounded-lg text-[10px] font-bold bg-rose-600 hover:bg-rose-700 text-white cursor-pointer shadow-2xs"
                          >
                            Confirmar
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteRecesoId(null)}
                            className="px-1.5 py-1 rounded-lg text-[10px] font-bold bg-slate-200 dark:bg-[#27272A] text-slate-700 dark:text-slate-300 hover:bg-slate-300 cursor-pointer"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteRecesoId(rec.idReceso)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                          title="Eliminar este receso"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Form to create/edit recess */}
            <form onSubmit={handleSaveRecess} className="space-y-3 pt-3 border-t border-slate-100 dark:border-[#27272A]">
              <p className="text-xs font-bold text-slate-800 dark:text-[#F4F4F5]">
                {editingRecess ? 'Editar Receso:' : 'Agregar Nuevo Receso:'}
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Nombre:</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Receso de la Mañana, Almuerzo"
                  value={recessForm.nombre}
                  onChange={(e) => setRecessForm({ ...recessForm, nombre: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl text-xs border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#181818] text-slate-900 dark:text-[#F4F4F5] focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Hora Inicio:
                  </label>
                  <input
                    type="time"
                    required
                    value={recessForm.horaInicio}
                    onChange={(e) => setRecessForm({ ...recessForm, horaInicio: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-xl text-xs font-mono font-bold border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#181818] text-slate-900 dark:text-[#F4F4F5]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Hora Fin:</label>
                  <input
                    type="time"
                    required
                    value={recessForm.horaFin}
                    onChange={(e) => setRecessForm({ ...recessForm, horaFin: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-xl text-xs font-mono font-bold border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#181818] text-slate-900 dark:text-[#F4F4F5]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Descripción (Opcional):
                </label>
                <input
                  type="text"
                  placeholder="Ej: Desayuno pedagógico y recreación"
                  value={recessForm.descripcion}
                  onChange={(e) => setRecessForm({ ...recessForm, descripcion: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl text-xs border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#181818] text-slate-900 dark:text-[#F4F4F5] focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="pt-3 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setRecessModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#181818] cursor-pointer"
                >
                  Cerrar
                </button>
                <button
                  type="submit"
                  disabled={savingRecess}
                  className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {savingRecess ? 'Guardando...' : editingRecess ? 'Actualizar Receso' : 'Guardar Receso'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. Institutional Departure Time (Hora de Salida) Modal */}
      {salidaModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-[#121212] rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200 dark:border-[#27272A] p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-[#27272A] mb-4">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 rounded-xl">
                  <DoorOpen className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900 dark:text-[#F4F4F5]">
                    Hora de Salida Institucional
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-[#A1A1AA]">
                    Configuración de salida escolar y notificaciones Push a representantes
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSalidaModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {salidaMsg && (
              <div
                className={`mb-4 p-3 rounded-xl text-xs font-bold flex items-center justify-between border ${
                  salidaMsg.type === 'success'
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                    : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
                }`}
              >
                <span>{salidaMsg.text}</span>
                <button
                  type="button"
                  onClick={() => setSalidaMsg(null)}
                  className="text-xs font-bold px-1.5 py-0.5 rounded hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}

            {/* List of existing departure rules */}
            <div className="space-y-2 mb-5">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Horas de Salida Configuradas ({salidasList.length}):
              </p>
              {salidasList.length === 0 ? (
                <div className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-[#27272A] text-center text-xs text-slate-400 dark:text-slate-500">
                  No hay horas de salida registradas actualmente.
                </div>
              ) : (
                salidasList.map((sal) => (
                  <div
                    key={sal.idSalida}
                    className="p-3 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#181818] flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-xs text-slate-900 dark:text-[#F4F4F5]">{sal.nombre}</span>
                        <span className="font-mono text-[11px] font-bold text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/60 px-2 py-0.5 rounded border border-sky-200 dark:border-sky-800">
                          {sal.horaSalida.slice(0, 5)}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-white dark:bg-[#121212] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-[#27272A]">
                          {sal.nombreNivel || 'Toda la institución'}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleToggleSalida(sal.idSalida)}
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border cursor-pointer transition-all ${
                            sal.activo
                              ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                              : 'bg-slate-200 dark:bg-[#27272A] text-slate-600 dark:text-slate-400 border-slate-300 dark:border-[#3F3F46]'
                          }`}
                          title="Clic para activar o desactivar esta hora de salida"
                        >
                          {sal.activo ? '● Activa' : '○ Inactiva'}
                        </button>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-slate-500 dark:text-[#A1A1AA]">
                        <span>
                          {sal.notificarPush ? '🔔 Push automático activado' : '🔕 Solo notificación manual'}
                        </span>
                        {sal.ultimaNotificacionFecha && (
                          <span className="font-mono text-[10px] text-sky-700 dark:text-sky-400">
                            • Último aviso: {sal.ultimaNotificacionFecha}{' '}
                            {sal.ultimaNotificacionHora || ''}
                          </span>
                        )}
                      </div>
                      {sal.descripcion && (
                        <p className="text-[11px] text-slate-500 dark:text-[#A1A1AA] mt-0.5">{sal.descripcion}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
                      <button
                        type="button"
                        onClick={() => handleNotifySalida(sal.idSalida)}
                        disabled={notifyingSalidaId === sal.idSalida}
                        className="px-2.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-[10px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        title="Notificar ahora por Web Push a los representantes"
                      >
                        {notifyingSalidaId === sal.idSalida ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <BellRing className="w-3 h-3" />
                        )}
                        <span>Notificar</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => openSalidaModal(sal)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 cursor-pointer"
                        title="Editar"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      {confirmDeleteSalidaId === sal.idSalida ? (
                        <div className="flex items-center gap-1 animate-in fade-in duration-150">
                          <button
                            type="button"
                            onClick={() => handleDeleteSalida(sal.idSalida)}
                            className="px-2 py-1 rounded-lg text-[10px] font-bold bg-rose-600 hover:bg-rose-700 text-white cursor-pointer shadow-2xs"
                          >
                            Confirmar
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteSalidaId(null)}
                            className="px-1.5 py-1 rounded-lg text-[10px] font-bold bg-slate-200 dark:bg-[#27272A] text-slate-700 dark:text-slate-300 hover:bg-slate-300 cursor-pointer"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteSalidaId(sal.idSalida)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                          title="Eliminar esta hora de salida"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Form to create/edit departure */}
            <form onSubmit={handleSaveSalida} className="space-y-3 pt-3 border-t border-slate-100 dark:border-[#27272A]">
              <p className="text-xs font-bold text-slate-800 dark:text-[#F4F4F5]">
                {editingSalida ? 'Editar Hora de Salida:' : 'Agregar Nueva Hora de Salida:'}
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Nombre:</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Hora de Salida Oficial, Salida Turno Mañana"
                  value={salidaForm.nombre}
                  onChange={(e) => setSalidaForm({ ...salidaForm, nombre: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl text-xs border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#181818] text-slate-900 dark:text-[#F4F4F5] focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Hora de Salida:
                  </label>
                  <input
                    type="time"
                    required
                    value={salidaForm.horaSalida}
                    onChange={(e) => setSalidaForm({ ...salidaForm, horaSalida: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-xl text-xs font-mono font-bold border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#181818] text-slate-900 dark:text-[#F4F4F5]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Alcance (Año Escolar):
                  </label>
                  <select
                    value={salidaForm.idAno ?? 0}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setSalidaForm({ ...salidaForm, idAno: v > 0 ? v : null });
                    }}
                    className="w-full px-3 py-2 rounded-xl text-xs font-bold border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#181818] text-slate-900 dark:text-[#F4F4F5] cursor-pointer"
                  >
                    <option value={0}>Toda la institución</option>
                    {anos.map((a) => (
                      <option key={a.idAno} value={a.idAno}>
                        {a.nombreNivel}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <label className="flex items-center gap-2 p-2.5 rounded-xl bg-sky-50/70 dark:bg-sky-950/25 border border-sky-200 dark:border-sky-800/60 cursor-pointer">
                <input
                  type="checkbox"
                  checked={salidaForm.notificarPush}
                  onChange={(e) => setSalidaForm({ ...salidaForm, notificarPush: e.target.checked })}
                  className="rounded border-sky-300 text-sky-600 focus:ring-sky-500"
                />
                <span className="text-xs font-semibold text-sky-900 dark:text-sky-200">
                  Notificar automáticamente por Web Push a representantes al llegar la hora de salida
                </span>
              </label>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Descripción (Opcional):
                </label>
                <input
                  type="text"
                  placeholder="Ej: Culminación de clases y retiro en portón principal"
                  value={salidaForm.descripcion}
                  onChange={(e) => setSalidaForm({ ...salidaForm, descripcion: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl text-xs border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#181818] text-slate-900 dark:text-[#F4F4F5] focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="pt-3 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setSalidaModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#181818] cursor-pointer"
                >
                  Cerrar
                </button>
                <button
                  type="submit"
                  disabled={savingSalida}
                  className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {savingSalida ? 'Guardando...' : editingSalida ? 'Actualizar Salida' : 'Guardar Salida'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
