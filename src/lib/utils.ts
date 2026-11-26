export function sortStudentsByCedula<T extends { cedula: string }>(students: T[]): T[] {
  return [...students].sort((a, b) => {
    const numA = parseInt(a.cedula.replace(/\D/g, '') || '0', 10);
    const numB = parseInt(b.cedula.replace(/\D/g, '') || '0', 10);
    return numA - numB;
  });
}

export function formatCedula(cedula: string): string {
  const digits = cedula.replace(/\D/g, '');
  if (!digits) return cedula;
  // Format with thousand separators: V-12.345.678
  const formatted = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return cedula.toUpperCase().startsWith('V') || cedula.toUpperCase().startsWith('E')
    ? `${cedula[0].toUpperCase()}-${formatted}`
    : `V-${formatted}`;
}

export function formatTime(timeStr: string): string {
  if (!timeStr) return '--:--:--';
  return timeStr;
}

export function formatDateEs(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

export function getLocalTodayDateString(): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Caracas',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch (_) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

export function getLocalTodayDayName(dateStr?: string): string {
  const targetDate = dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
    ? dateStr
    : getLocalTodayDateString();
  const dayIndex = new Date(`${targetDate}T12:00:00Z`).getUTCDay();
  const daysMap: Record<number, string> = {
    0: 'Domingo',
    1: 'Lunes',
    2: 'Martes',
    3: 'Miércoles',
    4: 'Jueves',
    5: 'Viernes',
    6: 'Sábado',
  };
  return daysMap[dayIndex] || 'Lunes';
}

export function getLocalNowTimeHHMM(): string {
  try {
    const formatted = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Caracas',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date());
    return formatted.slice(0, 5);
  } catch (_) {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }
}
