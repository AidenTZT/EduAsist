import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { RegistroAsistencia, Estudiante, Representante } from '../types.ts';
import { formatCedula, formatDateEs, formatTime } from './utils.ts';

interface InstitutionHeaderConfig {
  nombrePlantel?: string;
  anoLectivo?: string;
}

const DEFAULT_HEADER: InstitutionHeaderConfig = {
  nombrePlantel: 'LICEO NACIONAL BOLIVARIANO GRAN MARISCAL DE AYACUCHO',
  anoLectivo: '2025 - 2026',
};

/**
 * Agrega el membrete institucional oficial de la República Bolivariana de Venezuela
 */
function drawInstitutionalLetterhead(
  doc: jsPDF,
  title: string,
  subtitle?: string,
  config: InstitutionHeaderConfig = DEFAULT_HEADER
): number {
  const pageWidth = doc.internal.pageSize.getWidth();

  // Encabezado Nacional
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(50, 50, 50);
  doc.text('REPÚBLICA BOLIVARIANA DE VENEZUELA', pageWidth / 2, 12, { align: 'center' });
  doc.text('MINISTERIO DEL PODER POPULAR PARA LA EDUCACIÓN', pageWidth / 2, 16, { align: 'center' });

  doc.setFontSize(9);
  doc.setTextColor(20, 20, 20);
  doc.text(config.nombrePlantel?.toUpperCase() || DEFAULT_HEADER.nombrePlantel!, pageWidth / 2, 21, {
    align: 'center',
  });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(80, 80, 80);
  doc.text(
    `CÓDIGO DEA: S0424D0101  •  AÑO LECTIVO: ${config.anoLectivo || '2025 - 2026'}`,
    pageWidth / 2,
    25,
    { align: 'center' }
  );

  // Línea divisoria tricolor/institucional
  doc.setDrawColor(99, 102, 241); // Indigo
  doc.setLineWidth(0.8);
  doc.line(14, 28, pageWidth - 14, 28);

  // Título del documento
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(17, 24, 39);
  doc.text(title.toUpperCase(), pageWidth / 2, 35, { align: 'center' });

  let currentY = 36;
  if (subtitle) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(79, 70, 229);
    doc.text(subtitle.toUpperCase(), pageWidth / 2, 40, { align: 'center' });
    currentY = 43;
  }

  return currentY;
}

/**
 * 1. REPORTE GENERAL DE ASISTENCIA INSTITUCIONAL (ROL: DIRECTOR / COORDINADOR)
 */
export interface GeneralAttendanceReportParams {
  nombreAno: string;
  nombreSeccion: string;
  fecha: string;
  materiaNombre?: string;
  registros: RegistroAsistencia[];
  generadoPor: {
    nombre: string;
    rol: string;
  };
  config?: InstitutionHeaderConfig;
}

export function generateGeneralAttendancePDF(params: GeneralAttendanceReportParams): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'letter',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const startY = drawInstitutionalLetterhead(
    doc,
    'Reporte General de Asistencia y Matrícula',
    `${params.nombreAno} — Sección ${params.nombreSeccion}`,
    params.config
  );

  // Metadatos y Filtros Granulares
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, startY + 2, pageWidth - 28, 18, 2, 2, 'FD');

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);

  doc.text(`AÑO ESCOLAR:`, 18, startY + 7);
  doc.setFont('helvetica', 'normal');
  doc.text(params.nombreAno, 42, startY + 7);

  doc.setFont('helvetica', 'bold');
  doc.text(`SECCIÓN:`, 18, startY + 12);
  doc.setFont('helvetica', 'normal');
  doc.text(`Sección "${params.nombreSeccion}"`, 42, startY + 12);

  doc.setFont('helvetica', 'bold');
  doc.text(`FECHA ASISTENCIA:`, 18, startY + 17);
  doc.setFont('helvetica', 'normal');
  doc.text(formatDateEs(params.fecha), 52, startY + 17);

  doc.setFont('helvetica', 'bold');
  doc.text(`ASIGNATURA:`, 110, startY + 7);
  doc.setFont('helvetica', 'normal');
  doc.text(params.materiaNombre || 'Todas las Asignaturas', 134, startY + 7);

  doc.setFont('helvetica', 'bold');
  doc.text(`EMITIDO POR:`, 110, startY + 12);
  doc.setFont('helvetica', 'normal');
  doc.text(`${params.generadoPor.nombre} (${params.generadoPor.rol.toUpperCase()})`, 134, startY + 12);

  doc.setFont('helvetica', 'bold');
  doc.text(`FECHA EMISIÓN:`, 110, startY + 17);
  doc.setFont('helvetica', 'normal');
  doc.text(new Date().toLocaleDateString('es-VE') + ' ' + new Date().toLocaleTimeString('es-VE'), 136, startY + 17);

  // Resumen Estadístico / Totales
  const total = params.registros.length;
  const presentes = params.registros.filter((r) => r.estado === 'Presente').length;
  const ausentes = params.registros.filter((r) => r.estado === 'Ausente').length;
  const tardes = params.registros.filter((r) => r.estado === 'Tarde').length;
  const justificados = params.registros.filter(
    (r) => r.estado === 'Justificado' || r.estado === 'Reposo Médico'
  ).length;
  const porcentaje = total > 0 ? Math.round(((presentes + tardes + justificados) / total) * 100) : 0;

  const kpiY = startY + 23;
  const boxWidth = (pageWidth - 28 - 12) / 5;

  const kpis = [
    { label: 'TOTAL MATRÍCULA', val: String(total), color: [71, 85, 105] },
    { label: 'PRESENTES', val: String(presentes), color: [16, 185, 129] },
    { label: 'TARDANZAS', val: String(tardes), color: [245, 158, 11] },
    { label: 'AUSENTES', val: String(ausentes), color: [239, 68, 68] },
    { label: '% ASISTENCIA', val: `${porcentaje}%`, color: [99, 102, 241] },
  ];

  kpis.forEach((kpi, idx) => {
    const x = 14 + idx * (boxWidth + 3);
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, kpiY, boxWidth, 13, 1.5, 1.5, 'FD');

    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(kpi.color[0], kpi.color[1], kpi.color[2]);
    doc.text(kpi.label, x + boxWidth / 2, kpiY + 4.5, { align: 'center' });

    doc.setFontSize(10);
    doc.text(kpi.val, x + boxWidth / 2, kpiY + 10.5, { align: 'center' });
  });

  // Tabla Detallada con autoTable
  const tableRows = params.registros.map((r, idx) => [
    String(idx + 1),
    formatCedula(r.estudianteCedula || ''),
    `${r.estudianteApellidos || ''}, ${r.estudianteNombres || ''}`,
    r.nombreMateria || params.materiaNombre || 'General',
    formatTime(r.horaEntrada || ''),
    r.estado.toUpperCase(),
  ]);

  autoTable(doc, {
    startY: kpiY + 16,
    head: [['N°', 'CÉDULA', 'APELLIDOS Y NOMBRES', 'MATERIA', 'HORA ENTRADA', 'ESTADO']],
    body: tableRows,
    theme: 'grid',
    headStyles: {
      fillColor: [30, 41, 59], // Dark Navy Slate
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: 'bold',
      halign: 'center',
    },
    styles: {
      fontSize: 7.5,
      cellPadding: 2,
      textColor: [30, 41, 59],
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      1: { halign: 'center', cellWidth: 26, font: 'courier' },
      2: { halign: 'left', cellWidth: 65, fontStyle: 'bold' },
      3: { halign: 'left', cellWidth: 40 },
      4: { halign: 'center', cellWidth: 24, font: 'courier' },
      5: { halign: 'center', cellWidth: 23, fontStyle: 'bold' },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 5) {
        const val = String(data.cell.raw).toUpperCase();
        if (val === 'PRESENTE') {
          data.cell.styles.textColor = [16, 185, 129];
        } else if (val === 'AUSENTE') {
          data.cell.styles.textColor = [239, 68, 68];
        } else if (val === 'TARDE') {
          data.cell.styles.textColor = [217, 119, 6];
        } else if (val === 'JUSTIFICADO') {
          data.cell.styles.textColor = [14, 165, 233];
        } else if (val === 'REPOSO MÉDICO') {
          data.cell.styles.textColor = [124, 58, 237];
        }
      }
    },
    margin: { left: 14, right: 14, bottom: 35 },
  });

  // Firmas Institucionales en el pie
  const finalY = Math.min((doc as any).lastAutoTable.finalY + 15, pageHeight - 30);

  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.5);

  // Firma Director
  const line1X = 25;
  const lineWidth = 60;
  doc.line(line1X, finalY, line1X + lineWidth, finalY);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text('DIRECCIÓN GENERAL DEL PLANTEL', line1X + lineWidth / 2, finalY + 4, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Firma y Sello Oficial', line1X + lineWidth / 2, finalY + 7.5, { align: 'center' });

  // Firma Coordinador
  const line2X = pageWidth - 25 - lineWidth;
  doc.line(line2X, finalY, line2X + lineWidth, finalY);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text('COORDINACIÓN CONTROL DE ESTUDIOS', line2X + lineWidth / 2, finalY + 4, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Firma y Validación de Asistencia', line2X + lineWidth / 2, finalY + 7.5, { align: 'center' });

  // Descarga del archivo
  const safeFilename = `Asistencia_General_${params.nombreAno}_Sec_${params.nombreSeccion}_${params.fecha}.pdf`
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_\-\.]/g, '');
  doc.save(safeFilename);
}

/**
 * 2. REPORTE CRONOLÓGICO INDIVIDUAL DE ASISTENCIA (PORTAL REPRESENTANTE / ALUMNOS)
 */
export interface StudentAttendanceReportParams {
  estudiante: Estudiante;
  representante?: Representante | null;
  nombreAno: string;
  nombreSeccion?: string;
  registros: RegistroAsistencia[];
  config?: InstitutionHeaderConfig;
}

export function generateStudentAttendancePDF(params: StudentAttendanceReportParams): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'letter',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const startY = drawInstitutionalLetterhead(
    doc,
    'Historial Cronológico de Asistencia Escolar',
    'Reporte Oficial para el Representante Legal',
    params.config
  );

  // Ficha del Alumno y Representante
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, startY + 2, pageWidth - 28, 22, 2, 2, 'FD');

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);

  // Columna Izquierda: Estudiante
  doc.text('ESTUDIANTE:', 18, startY + 7);
  doc.setFont('helvetica', 'normal');
  doc.text(`${params.estudiante.apellidos}, ${params.estudiante.nombres}`, 42, startY + 7);

  doc.setFont('helvetica', 'bold');
  doc.text('CÉDULA:', 18, startY + 12);
  doc.setFont('helvetica', 'normal');
  doc.text(formatCedula(params.estudiante.cedula), 42, startY + 12);

  doc.setFont('helvetica', 'bold');
  doc.text('AÑO Y SECCIÓN:', 18, startY + 17);
  doc.setFont('helvetica', 'normal');
  doc.text(`${params.nombreAno} — Sección ${params.nombreSeccion || params.estudiante.nombreSeccion || 'A'}`, 44, startY + 17);

  // Columna Derecha: Representante
  const repName = params.representante
    ? `${params.representante.apellidos}, ${params.representante.nombres}`
    : `${params.estudiante.representanteApellidos || ''}, ${params.estudiante.representanteNombres || ''}`;
  const repCedula = params.representante?.cedula || params.estudiante.representanteCedula || 'N/A';
  const repTel = params.representante?.telefono || params.estudiante.representanteTelefono || 'N/A';

  doc.setFont('helvetica', 'bold');
  doc.text('REPRESENTANTE:', 110, startY + 7);
  doc.setFont('helvetica', 'normal');
  doc.text(repName || 'No especificado', 137, startY + 7);

  doc.setFont('helvetica', 'bold');
  doc.text('C.I. REPRESENTANTE:', 110, startY + 12);
  doc.setFont('helvetica', 'normal');
  doc.text(formatCedula(repCedula), 143, startY + 12);

  doc.setFont('helvetica', 'bold');
  doc.text('TELÉFONO CONTACTO:', 110, startY + 17);
  doc.setFont('helvetica', 'normal');
  doc.text(repTel, 143, startY + 17);

  // Estadísticas del Alumno
  const totalClases = params.registros.length;
  const presentes = params.registros.filter((r) => r.estado === 'Presente').length;
  const tardes = params.registros.filter((r) => r.estado === 'Tarde').length;
  const ausentes = params.registros.filter((r) => r.estado === 'Ausente').length;
  const justificados = params.registros.filter(
    (r) => r.estado === 'Justificado' || r.estado === 'Reposo Médico'
  ).length;
  const pct = totalClases > 0 ? Math.round(((presentes + tardes + justificados) / totalClases) * 100) : 0;

  const kpiY = startY + 27;
  const boxWidth = (pageWidth - 28 - 12) / 5;

  const kpis = [
    { label: 'CLASES REGISTRADAS', val: String(totalClases), color: [71, 85, 105] },
    { label: 'PRESENTES', val: String(presentes), color: [16, 185, 129] },
    { label: 'LLEGADAS TARDE', val: String(tardes), color: [245, 158, 11] },
    { label: 'INASISTENCIAS', val: String(ausentes), color: [239, 68, 68] },
    { label: '% ASISTENCIA', val: `${pct}%`, color: [99, 102, 241] },
  ];

  kpis.forEach((kpi, idx) => {
    const x = 14 + idx * (boxWidth + 3);
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, kpiY, boxWidth, 13, 1.5, 1.5, 'FD');

    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(kpi.color[0], kpi.color[1], kpi.color[2]);
    doc.text(kpi.label, x + boxWidth / 2, kpiY + 4.5, { align: 'center' });

    doc.setFontSize(10);
    doc.text(kpi.val, x + boxWidth / 2, kpiY + 10.5, { align: 'center' });
  });

  // Tabla Cronológica
  const rows = params.registros.map((r, idx) => {
    const soportePrefix = r.numeroJustificante ? `[${r.numeroJustificante}] ` : '';
    const observacion = r.motivoJustificacion
      ? `${soportePrefix}${r.motivoJustificacion}`
      : r.estado === 'Presente'
      ? 'A tiempo'
      : r.estado === 'Tarde'
      ? 'Ingreso demorado'
      : r.estado === 'Reposo Médico'
      ? 'Reposo médico validado'
      : r.estado === 'Justificado'
      ? 'Permiso / Justificado'
      : 'Inasistencia sin justificar';

    return [
      String(idx + 1),
      formatDateEs(r.fecha),
      r.nombreMateria || 'Materia General',
      formatTime(r.horaEntrada || ''),
      r.estado.toUpperCase(),
      observacion,
    ];
  });

  autoTable(doc, {
    startY: kpiY + 16,
    head: [['N°', 'FECHA', 'MATERIA / ASIGNATURA', 'HORA ENTRADA', 'ESTADO', 'OBSERVACIÓN PEDAGÓGICA']],
    body: rows,
    theme: 'grid',
    headStyles: {
      fillColor: [16, 185, 129], // Emerald Theme for Representatives
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: 'bold',
      halign: 'center',
    },
    styles: {
      fontSize: 7.5,
      cellPadding: 2,
      textColor: [30, 41, 59],
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      1: { halign: 'center', cellWidth: 26 },
      2: { halign: 'left', cellWidth: 50, fontStyle: 'bold' },
      3: { halign: 'center', cellWidth: 24, font: 'courier' },
      4: { halign: 'center', cellWidth: 24, fontStyle: 'bold' },
      5: { halign: 'left', cellWidth: 54 },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 4) {
        const val = String(data.cell.raw).toUpperCase();
        if (val === 'PRESENTE') {
          data.cell.styles.textColor = [16, 185, 129];
        } else if (val === 'AUSENTE') {
          data.cell.styles.textColor = [239, 68, 68];
        } else if (val === 'TARDE') {
          data.cell.styles.textColor = [217, 119, 6];
        } else if (val === 'JUSTIFICADO') {
          data.cell.styles.textColor = [14, 165, 233];
        } else if (val === 'REPOSO MÉDICO') {
          data.cell.styles.textColor = [124, 58, 237];
        }
      }
    },
    margin: { left: 14, right: 14, bottom: 35 },
  });

  // Firmas Institucionales y de Notificación al Representante
  const finalY = Math.min((doc as any).lastAutoTable.finalY + 15, pageHeight - 30);

  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.5);

  const line1X = 25;
  const lineWidth = 60;
  doc.line(line1X, finalY, line1X + lineWidth, finalY);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text('CONTROL DE ESTUDIOS Y ASISTENCIA', line1X + lineWidth / 2, finalY + 4, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Firma y Sello Institucional', line1X + lineWidth / 2, finalY + 7.5, { align: 'center' });

  const line2X = pageWidth - 25 - lineWidth;
  doc.line(line2X, finalY, line2X + lineWidth, finalY);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text('FIRMA DEL REPRESENTANTE LEGAL', line2X + lineWidth / 2, finalY + 4, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Notificación Recibida', line2X + lineWidth / 2, finalY + 7.5, { align: 'center' });

  const safeFilename = `Asistencia_${params.estudiante.cedula}_${params.estudiante.apellidos}.pdf`
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_\-\.]/g, '');
  doc.save(safeFilename);
}
