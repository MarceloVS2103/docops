"use server";

import { revalidatePath } from "next/cache";
import { requerirSesion, type Sesion } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { sumarDias } from "@/lib/estado";
import { evaluarExtraccion } from "@/lib/ia/evaluar";
import { extraerDatosDocumento, MIME_SOPORTADOS } from "@/lib/ia/extraer";
import { guardarArchivo, leerArchivo } from "@/lib/storage";
import type { EstadoAccion } from "./tipos";

const MAX_BYTES = 10 * 1024 * 1024;

interface Contexto {
  operario: { id: string; nombre_completo: string; dni: string };
  tipo: { id: string; codigo: string; nombre: string; vigencia_dias: number | null };
  tipos: { codigo: string; nombre: string }[];
}

/** Carga operario y tipo vía RLS: si no son de la empresa, no existen. */
async function contexto(empresaId: string, operarioId: string, tipoId: string): Promise<Contexto | null> {
  return withTenant(empresaId, async (q) => {
    const [operario] = await q.query<Contexto["operario"]>(
      "select id, nombre_completo, dni from operarios where id = $1",
      [operarioId],
    );
    const [tipo] = await q.query<Contexto["tipo"]>(
      "select id, codigo, nombre, vigencia_dias from tipos_documento where id = $1",
      [tipoId],
    );
    if (!operario || !tipo) return null;
    const tipos = await q.query<{ codigo: string; nombre: string }>(
      "select codigo, nombre from tipos_documento order by orden",
    );
    return { operario, tipo, tipos };
  });
}

/** Lee el archivo con IA y decide fechas y si requiere revisión manual. */
async function analizar(ctx: Contexto, archivo: Buffer, mime: string) {
  const r = await extraerDatosDocumento({ archivo, mime, tipos: ctx.tipos, tipoEsperado: ctx.tipo });
  if (!r.ok) {
    return {
      fecha_emision: null,
      fecha_vencimiento: null,
      origen_vencimiento: null,
      revision_manual: true,
      motivo_revision: r.motivo,
      datos_extraidos_ia: { error: r.motivo, procesado_en: new Date().toISOString() },
    };
  }
  const ev = evaluarExtraccion(r.extraccion, {
    tipoCodigo: ctx.tipo.codigo,
    tipoNombre: ctx.tipo.nombre,
    vigenciaDias: ctx.tipo.vigencia_dias,
    operarioNombre: ctx.operario.nombre_completo,
    operarioDni: ctx.operario.dni,
  });
  return {
    fecha_emision: ev.fecha_emision,
    fecha_vencimiento: ev.fecha_vencimiento,
    origen_vencimiento: ev.origen_vencimiento,
    revision_manual: ev.revision_manual,
    motivo_revision: ev.motivos.join(" ") || null,
    datos_extraidos_ia: { ...r.extraccion, modelo: r.modelo, procesado_en: new Date().toISOString() },
  };
}

function mensajeResultado(a: Awaited<ReturnType<typeof analizar>>): EstadoAccion {
  return a.revision_manual
    ? { ok: true, mensaje: `Documento guardado, requiere revisión manual: ${a.motivo_revision}` }
    : { ok: true, mensaje: "Documento leído y validado por IA." };
}

export async function subirDocumento(_prev: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  const s = await requerirSesion();
  const operarioId = String(form.get("operario_id") ?? "");
  const tipoId = String(form.get("tipo_documento_id") ?? "");
  const archivo = form.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return { error: "Selecciona un archivo." };
  if (archivo.size > MAX_BYTES) return { error: "El archivo no debe pasar de 10 MB." };
  const mime = archivo.type;
  if (!MIME_SOPORTADOS.includes(mime as (typeof MIME_SOPORTADOS)[number])) {
    return { error: "Formato no soportado. Sube un PDF, JPG, PNG o WEBP." };
  }

  const ctx = await contexto(s.empresaId, operarioId, tipoId);
  if (!ctx) return { error: "Operario o tipo de documento no encontrado." };

  const buffer = Buffer.from(await archivo.arrayBuffer());
  const ruta = await guardarArchivo(s.empresaId, buffer, mime);
  // La llamada a la IA va fuera de la transacción para no bloquear la base.
  const a = await analizar(ctx, buffer, mime);

  await withTenant(s.empresaId, (q) =>
    q.query(
      `insert into documentos_operario
        (empresa_id, operario_id, tipo_documento_id, archivo_path, archivo_nombre, archivo_mime,
         fecha_emision, fecha_vencimiento, origen_vencimiento, revision_manual, motivo_revision,
         datos_extraidos_ia, cargado_por)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        s.empresaId, operarioId, tipoId, ruta, archivo.name.slice(0, 200), mime,
        a.fecha_emision, a.fecha_vencimiento, a.origen_vencimiento, a.revision_manual, a.motivo_revision,
        JSON.stringify(a.datos_extraidos_ia), s.usuarioId,
      ],
    ),
  );
  revalidatePath("/", "layout");
  return mensajeResultado(a);
}

async function documentoDeEmpresa(s: Sesion, documentoId: string) {
  return withTenant(s.empresaId, async (q) => {
    const [d] = await q.query<{
      id: string;
      operario_id: string;
      tipo_documento_id: string;
      archivo_path: string;
      archivo_mime: string;
      datos_extraidos_ia: Record<string, unknown> | null;
    }>(
      "select id, operario_id, tipo_documento_id, archivo_path, archivo_mime, datos_extraidos_ia from documentos_operario where id = $1",
      [documentoId],
    );
    return d ?? null;
  });
}

export async function reprocesarDocumento(_prev: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  const s = await requerirSesion();
  const doc = await documentoDeEmpresa(s, String(form.get("documento_id") ?? ""));
  if (!doc) return { error: "Documento no encontrado." };
  const ctx = await contexto(s.empresaId, doc.operario_id, doc.tipo_documento_id);
  if (!ctx) return { error: "Documento no encontrado." };

  const a = await analizar(ctx, await leerArchivo(doc.archivo_path), doc.archivo_mime);
  await withTenant(s.empresaId, (q) =>
    q.query(
      `update documentos_operario set fecha_emision = $2, fecha_vencimiento = $3, origen_vencimiento = $4,
         revision_manual = $5, motivo_revision = $6, datos_extraidos_ia = $7
       where id = $1`,
      [doc.id, a.fecha_emision, a.fecha_vencimiento, a.origen_vencimiento, a.revision_manual, a.motivo_revision,
        JSON.stringify(a.datos_extraidos_ia)],
    ),
  );
  revalidatePath("/", "layout");
  return mensajeResultado(a);
}

/**
 * RRHH confirma o corrige las fechas a mano y saca el documento de revisión.
 * Si deja el vencimiento vacío y el tipo tiene vigencia, se calcula desde la
 * emisión; si no hay ninguna de las dos, el documento queda como "sin vencimiento".
 */
export async function confirmarRevision(_prev: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  const s = await requerirSesion();
  const doc = await documentoDeEmpresa(s, String(form.get("documento_id") ?? ""));
  if (!doc) return { error: "Documento no encontrado." };
  const emision = String(form.get("fecha_emision") ?? "") || null;
  let vencimiento = String(form.get("fecha_vencimiento") ?? "") || null;
  const fecha = /^\d{4}-\d{2}-\d{2}$/;
  if ((emision && !fecha.test(emision)) || (vencimiento && !fecha.test(vencimiento))) {
    return { error: "Fechas inválidas." };
  }
  if (emision && vencimiento && vencimiento < emision) {
    return { error: "El vencimiento no puede ser anterior a la emisión." };
  }

  await withTenant(s.empresaId, async (q) => {
    let origen: "manual" | "calculada" = "manual";
    if (!vencimiento && emision) {
      const [t] = await q.query<{ vigencia_dias: number | null }>(
        "select vigencia_dias from tipos_documento where id = $1",
        [doc.tipo_documento_id],
      );
      if (t?.vigencia_dias) {
        vencimiento = sumarDias(emision, t.vigencia_dias);
        origen = "calculada";
      }
    }
    const revision = { usuario: s.nombre, fecha: new Date().toISOString() };
    await q.query(
      `update documentos_operario set fecha_emision = $2, fecha_vencimiento = $3, origen_vencimiento = $5,
         revision_manual = false, motivo_revision = null,
         datos_extraidos_ia = coalesce(datos_extraidos_ia, '{}'::jsonb) || jsonb_build_object('revision_manual', $4::jsonb)
       where id = $1`,
      [doc.id, emision, vencimiento, JSON.stringify(revision), vencimiento ? origen : null],
    );
  });
  revalidatePath("/", "layout");
  return { ok: true, mensaje: "Revisión confirmada." };
}
