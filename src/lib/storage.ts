import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { withTenant, type Queryable } from "@/lib/db";

/**
 * Almacenamiento de archivos de documentos. Driver según el entorno
 * (o forzado con STORAGE_DRIVER=local|db|supabase):
 * - SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY → bucket privado de Supabase Storage.
 * - DATABASE_URL → tabla `archivos` en la misma base (con RLS por empresa).
 * - Nada → disco local en ./.data/uploads
 * Las rutas siempre empiezan con el id de la empresa.
 */

type Driver = "local" | "db" | "supabase";

const LOCAL_DIR = path.join(process.cwd(), ".data", "uploads");
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "documentos";

function driver(): Driver {
  const forzado = process.env.STORAGE_DRIVER;
  if (forzado === "local" || forzado === "db" || forzado === "supabase") return forzado;
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) return "supabase";
  if (process.env.DATABASE_URL) return "db";
  return "local";
}

let supabase: SupabaseClient | undefined;
function supabaseClient(): SupabaseClient {
  supabase ??= createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  return supabase;
}

export const EXTENSIONES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * `q` permite guardar dentro de una transacción ya abierta (lo usa el seed,
 * cuya empresa aún no está confirmada). Sin `q`, el driver "db" abre su propia
 * transacción con RLS de la empresa.
 */
export async function guardarArchivo(empresaId: string, data: Buffer, mime: string, q?: Queryable): Promise<string> {
  const ext = EXTENSIONES[mime] ?? "bin";
  const rel = `${empresaId}/${randomUUID()}.${ext}`;
  switch (driver()) {
    case "supabase": {
      const { error } = await supabaseClient().storage.from(BUCKET).upload(rel, data, { contentType: mime });
      if (error) throw new Error(`No se pudo guardar el archivo: ${error.message}`);
      return rel;
    }
    case "db": {
      const insertar = (tx: Queryable) =>
        tx.query("insert into archivos (path, empresa_id, mime, datos) values ($1, $2, $3, $4)", [
          rel,
          empresaId,
          mime,
          data,
        ]);
      await (q ? insertar(q) : withTenant(empresaId, insertar));
      return rel;
    }
    case "local": {
      const abs = path.join(LOCAL_DIR, rel);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, data);
      return rel;
    }
  }
}

/**
 * Copia todos los archivos de una empresa a otra conservando el nombre de cada
 * archivo (cambia solo el prefijo). Lo usa la demo abierta al copiar la plantilla.
 */
export async function copiarArchivosEmpresa(origen: string, destino: string, q: Queryable): Promise<void> {
  switch (driver()) {
    case "supabase": {
      const bucket = supabaseClient().storage.from(BUCKET);
      const { data, error } = await bucket.list(origen, { limit: 10_000 });
      if (error) throw new Error(`No se pudieron listar los archivos: ${error.message}`);
      for (const f of data) {
        const r = await bucket.copy(`${origen}/${f.name}`, `${destino}/${f.name}`);
        if (r.error) throw new Error(`No se pudo copiar el archivo: ${r.error.message}`);
      }
      return;
    }
    case "db":
      await q.query(
        `insert into archivos (path, empresa_id, mime, datos)
         select $2::text || substr(path, 37), $2::uuid, mime, datos from archivos where empresa_id = $1`,
        [origen, destino],
      );
      return;
    case "local": {
      const dir = path.join(LOCAL_DIR, origen);
      await fs.cp(dir, path.join(LOCAL_DIR, destino), { recursive: true }).catch((err: NodeJS.ErrnoException) => {
        if (err.code !== "ENOENT") throw err;
      });
      return;
    }
  }
}

export async function leerArchivo(rel: string): Promise<Buffer> {
  switch (driver()) {
    case "supabase": {
      const { data, error } = await supabaseClient().storage.from(BUCKET).download(rel);
      if (error || !data) throw new Error(`No se pudo leer el archivo: ${error?.message}`);
      return Buffer.from(await data.arrayBuffer());
    }
    case "db": {
      const empresaId = rel.split("/")[0];
      const [r] = await withTenant(empresaId, (q) =>
        q.query<{ datos: Uint8Array }>("select datos from archivos where path = $1", [rel]),
      );
      if (!r) throw new Error("Archivo no encontrado");
      return Buffer.from(r.datos);
    }
    case "local": {
      const abs = path.join(LOCAL_DIR, rel);
      // Evita path traversal: la ruta resuelta debe quedar dentro de LOCAL_DIR.
      if (!abs.startsWith(LOCAL_DIR + path.sep)) throw new Error("Ruta inválida");
      return fs.readFile(abs);
    }
  }
}
