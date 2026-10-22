import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Almacenamiento de archivos de documentos.
 * - Por defecto: disco local en ./.data/uploads
 * - Con SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY: bucket privado de Supabase Storage.
 * Las rutas siempre empiezan con el id de la empresa.
 */

const LOCAL_DIR = path.join(process.cwd(), ".data", "uploads");
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "documentos";

let supabase: SupabaseClient | null | undefined;
function supabaseClient(): SupabaseClient | null {
  if (supabase === undefined) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    supabase = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  }
  return supabase;
}

export const EXTENSIONES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function guardarArchivo(empresaId: string, data: Buffer, mime: string): Promise<string> {
  const ext = EXTENSIONES[mime] ?? "bin";
  const rel = `${empresaId}/${randomUUID()}.${ext}`;
  const sb = supabaseClient();
  if (sb) {
    const { error } = await sb.storage.from(BUCKET).upload(rel, data, { contentType: mime });
    if (error) throw new Error(`No se pudo guardar el archivo: ${error.message}`);
    return rel;
  }
  const abs = path.join(LOCAL_DIR, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, data);
  return rel;
}

export async function leerArchivo(rel: string): Promise<Buffer> {
  const sb = supabaseClient();
  if (sb) {
    const { data, error } = await sb.storage.from(BUCKET).download(rel);
    if (error || !data) throw new Error(`No se pudo leer el archivo: ${error?.message}`);
    return Buffer.from(await data.arrayBuffer());
  }
  const abs = path.join(LOCAL_DIR, rel);
  // Evita path traversal: la ruta resuelta debe quedar dentro de LOCAL_DIR.
  if (!abs.startsWith(LOCAL_DIR + path.sep)) throw new Error("Ruta inválida");
  return fs.readFile(abs);
}
