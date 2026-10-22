import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";

/**
 * Acceso a Postgres con dos drivers intercambiables:
 * - DATABASE_URL vacío → PGlite (Postgres embebido en ./.data/pgdata), cero setup.
 * - DATABASE_URL definido → Postgres real (Supabase en producción) vía `pg`.
 *
 * Las fechas (`date`) se devuelven como texto 'YYYY-MM-DD' en ambos drivers
 * para no pelear con zonas horarias.
 */

export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
}

interface Tx extends Queryable {
  exec(sql: string): Promise<void>;
}

interface Driver extends Queryable {
  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

const DATE_OID = 1082;

function createPgliteDriver(): Driver {
  const dir = process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pgdata");
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  const db = new PGlite(dir, { parsers: { [DATE_OID]: (v: string) => v } });
  return {
    async query<T>(sql: string, params: unknown[] = []) {
      return (await db.query<T>(sql, params)).rows;
    },
    async transaction<T>(fn: (tx: Tx) => Promise<T>) {
      return db.transaction(async (tx) =>
        fn({
          async query<R>(sql: string, params: unknown[] = []) {
            return (await tx.query<R>(sql, params)).rows;
          },
          async exec(sql: string) {
            await tx.exec(sql);
          },
        }),
      );
    },
    async exec(sql: string) {
      await db.exec(sql);
    },
    async close() {
      await db.close();
    },
  };
}

function createPgDriver(url: string): Driver {
  pg.types.setTypeParser(DATE_OID, (v) => v);
  const pool = new pg.Pool({
    connectionString: url,
    max: 5,
    ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false },
  });
  return {
    async query<T>(sql: string, params: unknown[] = []) {
      return (await pool.query(sql, params)).rows as T[];
    },
    async transaction<T>(fn: (tx: Tx) => Promise<T>) {
      const client = await pool.connect();
      try {
        await client.query("begin");
        const result = await fn({
          async query<R>(sql: string, params: unknown[] = []) {
            return (await client.query(sql, params)).rows as R[];
          },
          async exec(sql: string) {
            await client.query(sql);
          },
        });
        await client.query("commit");
        return result;
      } catch (err) {
        await client.query("rollback").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
    async exec(sql: string) {
      await pool.query(sql);
    },
    async close() {
      await pool.end();
    },
  };
}

// Una sola instancia por proceso (el hot reload de Next re-evalúa módulos).
const globalForDb = globalThis as unknown as { __docopsDb?: Promise<Driver> };

async function init(): Promise<Driver> {
  const url = process.env.DATABASE_URL;
  const driver = url ? createPgDriver(url) : createPgliteDriver();
  await migrate(driver);
  return driver;
}

export function getDb(): Promise<Driver> {
  globalForDb.__docopsDb ??= init();
  return globalForDb.__docopsDb;
}

export async function closeDb() {
  const db = await globalForDb.__docopsDb;
  globalForDb.__docopsDb = undefined;
  await db?.close();
}

/**
 * Ejecuta `fn` con RLS activo para la empresa dada. Toda lectura/escritura de
 * datos de negocio debe pasar por aquí.
 */
export async function withTenant<T>(empresaId: string, fn: (q: Queryable) => Promise<T>): Promise<T> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    await tx.query("select set_config('app.empresa_id', $1, true)", [empresaId]);
    await tx.query("set local role app_tenant");
    return fn(tx);
  });
}

/** Conexión dueña, sin RLS. Solo para login, registro de empresa y scripts. */
export async function withOwner<T>(fn: (q: Queryable) => Promise<T>): Promise<T> {
  const db = await getDb();
  return db.transaction(fn);
}

const MIGRATIONS_DIR = path.join(process.cwd(), "src", "db", "migrations");

async function migrate(db: Driver) {
  await db.exec(
    "create table if not exists _migraciones (nombre text primary key, aplicada_en timestamptz not null default now())",
  );
  const done = new Set(
    (await db.query<{ nombre: string }>("select nombre from _migraciones")).map((r) => r.nombre),
  );
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    await db.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.query("insert into _migraciones (nombre) values ($1)", [file]);
    });
  }
}
