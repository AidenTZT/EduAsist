import { db } from '../src/db/index.ts';
import { horarios, docenteMaterias } from '../src/db/schema.ts';
import { eq, sql } from 'drizzle-orm';

async function main() {
  console.log('--- ULTRA-FAST O(1) DELTA SCHEDULE OPTIMIZER ---');

  const allHorarios = await db.select().from(horarios);
  const allAssignments = await db.select().from(docenteMaterias);

  const materiaTeacherMap = new Map<number, number>();
  for (const a of allAssignments) {
    materiaTeacherMap.set(a.idMateria, a.idUsuario);
  }

  const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
  const BLOQUES = [
    { inicio: '07:00', fin: '07:45' },
    { inicio: '07:45', fin: '08:30' },
    { inicio: '08:30', fin: '09:15' },
    { inicio: '09:45', fin: '10:30' },
    { inicio: '10:30', fin: '11:15' },
    { inicio: '11:15', fin: '12:00' },
  ];

  function getSlotIdx(dia: string, inicio: string): number {
    const dIdx = DIAS.indexOf(dia);
    const bIdx = BLOQUES.findIndex((b) => b.inicio === inicio);
    return dIdx * 6 + bIdx;
  }

  interface Block {
    idHorario: number;
    idAno: number;
    idSeccion: number;
    idMateria: number;
    teacherId: number;
    room: string;
    slotIdx: number;
  }

  const blocks: Block[] = allHorarios.map((h) => ({
    idHorario: h.idHorario,
    idAno: h.idAno,
    idSeccion: h.idSeccion,
    idMateria: h.idMateria,
    teacherId: materiaTeacherMap.get(h.idMateria) || 0,
    room: (h.aula || '').trim().toLowerCase(),
    slotIdx: getSlotIdx(h.diaSemana, h.horaInicio),
  }));

  // Structure: slotTeacherCounts[slotIdx][teacherId]
  // slotRoomCounts[slotIdx][room]
  const slotTeacherCounts: Map<number, number>[] = Array.from({ length: 30 }, () => new Map());
  const slotRoomCounts: Map<string, number>[] = Array.from({ length: 30 }, () => new Map());

  for (const b of blocks) {
    if (b.teacherId > 0) {
      const tc = slotTeacherCounts[b.slotIdx];
      tc.set(b.teacherId, (tc.get(b.teacherId) || 0) + 1);
    }
    if (b.room) {
      const rc = slotRoomCounts[b.slotIdx];
      rc.set(b.room, (rc.get(b.room) || 0) + 1);
    }
  }

  // Calculate current conflict score for a single slot
  function slotConflictScore(s: number): number {
    let score = 0;
    const tc = slotTeacherCounts[s];
    for (const count of tc.values()) {
      if (count > 1) score += (count - 1) * 10;
    }
    const rc = slotRoomCounts[s];
    for (const count of rc.values()) {
      if (count > 1) score += (count - 1) * 20;
    }
    return score;
  }

  let totalScore = 0;
  for (let s = 0; s < 30; s++) {
    totalScore += slotConflictScore(s);
  }

  console.log(`Initial total conflict score: ${totalScore}`);

  // Group blocks by section
  const sectionMap = new Map<number, Block[]>();
  for (const b of blocks) {
    if (!sectionMap.has(b.idSeccion)) sectionMap.set(b.idSeccion, []);
    sectionMap.get(b.idSeccion)!.push(b);
  }

  const sectionIds = Array.from(sectionMap.keys());
  let iters = 0;
  const maxIters = 200000;
  let temperature = 1.0;

  while (totalScore > 0 && iters < maxIters) {
    iters++;
    if (iters % 2000 === 0) {
      temperature = Math.max(0.001, temperature * 0.95);
    }

    const secId = sectionIds[Math.floor(Math.random() * sectionIds.length)];
    const secBlocks = sectionMap.get(secId)!;

    const idxA = Math.floor(Math.random() * secBlocks.length);
    const idxB = Math.floor(Math.random() * secBlocks.length);
    if (idxA === idxB) continue;

    const bA = secBlocks[idxA];
    const bB = secBlocks[idxB];
    const sA = bA.slotIdx;
    const sB = bB.slotIdx;
    if (sA === sB) continue;

    // Pre-swap score for slots sA and sB
    const preScore = slotConflictScore(sA) + slotConflictScore(sB);

    // Apply tentative swap in counts:
    // Remove bA from sA, remove bB from sB
    if (bA.teacherId > 0) slotTeacherCounts[sA].set(bA.teacherId, slotTeacherCounts[sA].get(bA.teacherId)! - 1);
    if (bA.room) slotRoomCounts[sA].set(bA.room, slotRoomCounts[sA].get(bA.room)! - 1);

    if (bB.teacherId > 0) slotTeacherCounts[sB].set(bB.teacherId, slotTeacherCounts[sB].get(bB.teacherId)! - 1);
    if (bB.room) slotRoomCounts[sB].set(bB.room, slotRoomCounts[sB].get(bB.room)! - 1);

    // Add bA to sB, add bB to sA
    if (bA.teacherId > 0) slotTeacherCounts[sB].set(bA.teacherId, (slotTeacherCounts[sB].get(bA.teacherId) || 0) + 1);
    if (bA.room) slotRoomCounts[sB].set(bA.room, (slotRoomCounts[sB].get(bA.room) || 0) + 1);

    if (bB.teacherId > 0) slotTeacherCounts[sA].set(bB.teacherId, (slotTeacherCounts[sA].get(bB.teacherId) || 0) + 1);
    if (bB.room) slotRoomCounts[sA].set(bB.room, (slotRoomCounts[sA].get(bB.room) || 0) + 1);

    // Post-swap score
    const postScore = slotConflictScore(sA) + slotConflictScore(sB);
    const delta = postScore - preScore;

    if (delta <= 0 || Math.random() < Math.exp(-delta / temperature)) {
      // Accept swap
      bA.slotIdx = sB;
      bB.slotIdx = sA;
      totalScore += delta;
      if (iters % 1000 === 0 || totalScore === 0) {
        console.log(`[Iter ${iters}] Score: ${totalScore}`);
      }
    } else {
      // Revert counts
      if (bA.teacherId > 0) slotTeacherCounts[sB].set(bA.teacherId, slotTeacherCounts[sB].get(bA.teacherId)! - 1);
      if (bA.room) slotRoomCounts[sB].set(bA.room, slotRoomCounts[sB].get(bA.room)! - 1);

      if (bB.teacherId > 0) slotTeacherCounts[sA].set(bB.teacherId, slotTeacherCounts[sA].get(bB.teacherId)! - 1);
      if (bB.room) slotRoomCounts[sA].set(bB.room, slotRoomCounts[sA].get(bB.room)! - 1);

      if (bA.teacherId > 0) slotTeacherCounts[sA].set(bA.teacherId, slotTeacherCounts[sA].get(bA.teacherId)! + 1);
      if (bA.room) slotRoomCounts[sA].set(bA.room, slotRoomCounts[sA].get(bA.room)! + 1);

      if (bB.teacherId > 0) slotTeacherCounts[sB].set(bB.teacherId, slotTeacherCounts[sB].get(bB.teacherId)! + 1);
      if (bB.room) slotRoomCounts[sB].set(bB.room, slotRoomCounts[sB].get(bB.room)! + 1);
    }
  }

  console.log(`Final conflict score: ${totalScore} after ${iters} iterations`);

  if (totalScore === 0) {
    console.log('Zero conflicts reached! Updating database via clean insert...');
    await db.execute(sql`DELETE FROM horarios`);

    const values = blocks.map((b) => {
      const dIdx = Math.floor(b.slotIdx / 6);
      const bIdx = b.slotIdx % 6;
      const diaSemana = DIAS[dIdx];
      const horaInicio = BLOQUES[bIdx].inicio;
      const horaFin = BLOQUES[bIdx].fin;
      return `(${b.idAno}, ${b.idSeccion}, ${b.idMateria}, '${diaSemana}', '${horaInicio}', '${horaFin}', '${b.room || 'Aula'}')`;
    });

    const insertSql = `INSERT INTO horarios (id_ano, id_seccion, id_materia, dia_semana, hora_inicio, hora_fin, aula) VALUES\n${values.join(',\n')};`;
    await db.execute(sql.raw(insertSql));
    console.log('Database successfully updated with ZERO conflicts!');
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
