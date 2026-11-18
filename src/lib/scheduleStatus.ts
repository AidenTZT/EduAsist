import type { RecesoInstitucional } from '../types.ts';

export type SchoolSchedulePhase =
  | 'en_receso'
  | 'clases_en_curso'
  | 'salida_autorizada'
  | 'fin_de_semana';

export interface SchoolScheduleStatusResult {
  code: SchoolSchedulePhase;
  label: 'En Receso' | 'Clases en Curso' | 'Salida Autorizada' | 'Fuera de Jornada';
  detail: string;
  tone: 'amber' | 'emerald' | 'indigo' | 'slate';
  horaRecesoInicio: string;
  horaRecesoFin: string;
  horaSalida: string;
  activeRecessName?: string;
  remainingMinutes?: number;
}

function toMinutes(hhmm?: string): number {
  if (!hhmm || !/^\d{2}:\d{2}/.test(hhmm)) return 0;
  const [h, m] = hhmm.slice(0, 5).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function getCurrentDayAndTime(): { dayName: string; timeHHMM: string } {
  const now = new Date();
  const daysMap: Record<number, string> = {
    0: 'Domingo',
    1: 'Lunes',
    2: 'Martes',
    3: 'Miércoles',
    4: 'Jueves',
    5: 'Viernes',
    6: 'Sábado',
  };
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return {
    dayName: daysMap[now.getDay()] || 'Lunes',
    timeHHMM: `${hours}:${minutes}`,
  };
}

export function computeSchoolScheduleStatus(params?: {
  horaRecesoInicio?: string;
  horaRecesoFin?: string;
  horaSalida?: string;
  recesos?: RecesoInstitucional[];
  dayName?: string;
  timeHHMM?: string;
}): SchoolScheduleStatusResult {
  const current = getCurrentDayAndTime();
  const dayName = params?.dayName || current.dayName;
  const timeHHMM = params?.timeHHMM || current.timeHHMM;
  const currentMins = toMinutes(timeHHMM);

  const horaRecesoInicio = (params?.horaRecesoInicio || '09:15').slice(0, 5);
  const horaRecesoFin = (params?.horaRecesoFin || '09:45').slice(0, 5);
  const horaSalida = (params?.horaSalida || '13:00').slice(0, 5);

  if (dayName === 'Sábado' || dayName === 'Domingo') {
    return {
      code: 'fin_de_semana',
      label: 'Fuera de Jornada',
      detail: `Fin de semana • Receso ${horaRecesoInicio}-${horaRecesoFin} • Salida ${horaSalida}`,
      tone: 'slate',
      horaRecesoInicio,
      horaRecesoFin,
      horaSalida,
    };
  }

  // 1. Verificar si está en algún receso activo o en el horario de receso configurado
  const activeRecess = (params?.recesos || []).find((r) => {
    if (r.activo === false) return false;
    const s = toMinutes(r.horaInicio);
    const e = toMinutes(r.horaFin);
    return currentMins >= s && currentMins < e;
  });

  if (activeRecess) {
    const endMins = toMinutes(activeRecess.horaFin);
    return {
      code: 'en_receso',
      label: 'En Receso',
      detail: `${activeRecess.nombre} (${activeRecess.horaInicio.slice(0, 5)} - ${activeRecess.horaFin.slice(0, 5)})`,
      tone: 'amber',
      horaRecesoInicio,
      horaRecesoFin,
      horaSalida,
      activeRecessName: activeRecess.nombre,
      remainingMinutes: Math.max(0, endMins - currentMins),
    };
  }

  const cfgRecStart = toMinutes(horaRecesoInicio);
  const cfgRecEnd = toMinutes(horaRecesoFin);
  if (cfgRecStart < cfgRecEnd && currentMins >= cfgRecStart && currentMins < cfgRecEnd) {
    return {
      code: 'en_receso',
      label: 'En Receso',
      detail: `Receso institucional (${horaRecesoInicio} - ${horaRecesoFin})`,
      tone: 'amber',
      horaRecesoInicio,
      horaRecesoFin,
      horaSalida,
      activeRecessName: 'Receso Escolar',
      remainingMinutes: Math.max(0, cfgRecEnd - currentMins),
    };
  }

  // 2. Verificar si ya alcanzó la hora oficial de salida
  const salidaMins = toMinutes(horaSalida);
  if (salidaMins > 0 && currentMins >= salidaMins) {
    return {
      code: 'salida_autorizada',
      label: 'Salida Autorizada',
      detail: `Jornada culminada desde las ${horaSalida}`,
      tone: 'indigo',
      horaRecesoInicio,
      horaRecesoFin,
      horaSalida,
    };
  }

  // 3. Jornada escolar activa
  const nextMilestone =
    currentMins < cfgRecStart
      ? `Próximo receso: ${horaRecesoInicio} - ${horaRecesoFin}`
      : `Salida programada: ${horaSalida}`;

  return {
    code: 'clases_en_curso',
    label: 'Clases en Curso',
    detail: nextMilestone,
    tone: 'emerald',
    horaRecesoInicio,
    horaRecesoFin,
    horaSalida,
  };
}
