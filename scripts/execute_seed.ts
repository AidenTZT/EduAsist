import * as fs from 'fs';
import { sql } from 'drizzle-orm';
import { db } from '../src/db/index.ts';

async function main() {
  console.log('Reading scripts/seed_horarios.sql...');
  const sqlContent = fs.readFileSync('scripts/seed_horarios.sql', 'utf-8');

  console.log('Executing seed_horarios.sql on database...');
  await db.execute(sql.raw(sqlContent));

  console.log('Verifying inserted rows in horarios...');
  const countRes = await db.execute(sql`SELECT count(*) as count FROM horarios`);
  console.log('Total horarios in database:', countRes.rows[0]);

  // Check for conflicts
  const collisionsRes = await db.execute(sql`
    SELECT count(*) as collisions
    FROM horarios h1
    JOIN horarios h2 ON h1.dia_semana = h2.dia_semana AND h1.id_horario < h2.id_horario
    WHERE (
      (h1.id_seccion = h2.id_seccion AND h1.hora_inicio < h2.hora_fin AND h1.hora_fin > h2.hora_inicio)
      OR
      (LOWER(h1.aula) = LOWER(h2.aula) AND h1.aula IS NOT NULL AND h1.hora_inicio < h2.hora_fin AND h1.hora_fin > h2.hora_inicio)
    )
  `);
  console.log('Section/Classroom Collisions:', collisionsRes.rows[0]);

  process.exit(0);
}

main().catch((err) => {
  console.error('Error seeding horarios:', err);
  process.exit(1);
});
