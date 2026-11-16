import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/index.ts';
import { users, representantes } from '../src/db/schema.ts';

async function migratePasswords() {
  console.log('[Seguridad] Iniciando migración criptográfica a bcrypt...');

  // 1. Migrar usuarios institucionales
  const allUsers = await db.select().from(users);
  let usersMigrated = 0;
  for (const u of allUsers) {
    if (u.passwordHash && !u.passwordHash.startsWith('$2a$') && !u.passwordHash.startsWith('$2b$')) {
      const salt = await bcrypt.genSalt(10);
      const hashed = await bcrypt.hash(u.passwordHash, salt);
      await db.update(users).set({ passwordHash: hashed }).where(eq(users.id, u.id));
      usersMigrated++;
      console.log(`Usuario ID ${u.id} (${u.email}) migrado a bcrypt hash.`);
    }
  }

  // 2. Migrar representantes
  const allReps = await db.select().from(representantes);
  let repsMigrated = 0;
  for (const r of allReps) {
    if (r.passwordHash && !r.passwordHash.startsWith('$2a$') && !r.passwordHash.startsWith('$2b$')) {
      const salt = await bcrypt.genSalt(10);
      const hashed = await bcrypt.hash(r.passwordHash, salt);
      await db.update(representantes).set({ passwordHash: hashed }).where(eq(representantes.idRepresentante, r.idRepresentante));
      repsMigrated++;
      console.log(`Representante ID ${r.idRepresentante} (${r.email}) migrado a bcrypt hash.`);
    }
  }

  console.log(`[Seguridad] Migración completada exitosamente. Usuarios actualizados: ${usersMigrated}, Representantes actualizados: ${repsMigrated}.`);
  process.exit(0);
}

migratePasswords().catch((err) => {
  console.error('Error migrando contraseñas a bcrypt:', err);
  process.exit(1);
});
