import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';

declare global {
  var _postgresPool: Pool | undefined;
}

export const createPool = () => {
  if (!global._postgresPool) {
    global._postgresPool = new Pool({
      host: process.env.SQL_HOST,
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      database: process.env.SQL_DB_NAME,
      max: 10,
      connectionTimeoutMillis: 15000,
    });

    global._postgresPool.on('error', (err) => {
      console.error('Unexpected error on idle SQL pool client:', err);
    });
  }
  return global._postgresPool;
};

let dbInstance: ReturnType<typeof drizzle<typeof schema>>;
try {
  if (!process.env.SQL_HOST && !process.env.DATABASE_URL) {
    throw new Error('SQL_HOST not configured');
  }
  const pool = createPool();
  dbInstance = drizzle(pool, { schema });
} catch {
  console.warn('[AI Studio] PostgreSQL not configured — using in-memory mock fallback for Drizzle');
  const noOp = {
    findMany: async () => [],
    findFirst: async () => null,
    findUnique: async () => null,
    create: async (d: any) => d?.data ?? {},
    update: async (d: any) => d?.data ?? {},
    delete: async () => ({}),
  };
  dbInstance = new Proxy({} as any, {
    get: (_, prop) =>
      prop === 'query' ? new Proxy({}, { get: () => noOp }) : async () => [],
  });
}

export const db = dbInstance;
