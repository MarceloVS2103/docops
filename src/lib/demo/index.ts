import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { withOwner, type Queryable } from "@/lib/db";
import { diasEntre, hoy } from "@/lib/estado";
import { hashPassword } from "@/lib/hash";
import type { Sesion } from "@/lib/session";
import { copiarArchivosEmpresa } from "@/lib/storage";
import { EMPRESAS, crearEmpresa, reiniciarAleatorio } from "@/lib/demo/datos";

/**
 * Demo abierta: cada visitante entra sin cuenta y recibe su propia copia de
 * una empresa plantilla (la empresa agro demo). Generar la empresa desde cero
 * tarda (cientos de PDFs e inserts); copiarla con SQL toma un par de segundos.
 * Las fechas de la copia se desplazan los días que pasaron desde que se
 * generó la plantilla, así los estados siguen siendo los de la encuesta.
 */

/** Las copias se borran pasado este plazo (la sesión de la demo dura lo mismo). */
export const DIAS_DEMO = 14;
const MAX_POR_IP_HORA = 10;
const MAX_TOTAL_HORA = 100;

export class DemoNoDisponible extends Error {}

/** Genera una plantilla nueva y borra las anteriores (las copias no dependen de ella). */
export async function crearPlantilla(): Promise<string> {
  // Clave aleatoria que no se guarda en ningún lado: nadie puede ingresar a la plantilla.
  const passwordHash = await hashPassword(randomUUID());
  const agro = EMPRESAS[0];
  return withOwner(async (q) => {
    const anteriores = await q.query<{ id: string }>("select id from empresas where plantilla");
    reiniciarAleatorio();
    const { empresaId } = await crearEmpresa(q, agro, [
      { ...agro.usuarios[0], email: `plantilla-${randomUUID()}@demo.docops.test`, passwordHash },
    ]);
    await q.query("update empresas set plantilla = true where id = $1", [empresaId]);
    await borrarEmpresas(q, anteriores.map((a) => a.id));
    return empresaId;
  });
}

/** Borra las copias de la demo más antiguas que DIAS_DEMO. */
export async function limpiarDemos(): Promise<number> {
  return withOwner(async (q) => {
    const viejas = await q.query<{ id: string }>(
      `select id from empresas where demo_desde < now() - make_interval(days => $1) and not plantilla`,
      [DIAS_DEMO],
    );
    await borrarEmpresas(q, viejas.map((v) => v.id));
    return viejas.length;
  });
}

async function borrarEmpresas(q: Queryable, ids: string[]) {
  if (!ids.length) return;
  await q.query("delete from empresas where id = any($1)", [ids]);
  for (const id of ids) fs.rmSync(path.join(process.cwd(), ".data", "uploads", id), { recursive: true, force: true });
}

// Mueve las fechas "fecha_emision"/"fecha_vencimiento" que la IA dejó en el JSON.
const desplazarJson = (expr: string, campo: string) =>
  `case when jsonb_typeof(${expr}->'${campo}') = 'string'
     then jsonb_set(${expr}, '{${campo}}', to_jsonb(((${expr}->>'${campo}')::date + $3::int)::text))
     else ${expr} end`;

/** Crea la copia del visitante y devuelve su sesión (rol admin). */
export async function crearEmpresaDemo(nombreVisitante: string, ip: string | null): Promise<Sesion> {
  let plantilla = await buscarPlantilla();
  if (!plantilla) {
    // Primera visita sin plantilla (base recién creada): se genera una vez.
    await crearPlantilla();
    plantilla = await buscarPlantilla();
    if (!plantilla) throw new DemoNoDisponible("La demo no está disponible en este momento.");
  }
  const desfase = diasEntre(plantilla.base, hoy());
  const passwordHash = await hashPassword(randomUUID());
  const email = `demo-${randomUUID().slice(0, 8)}@demo.docops.test`;

  return withOwner(async (q) => {
    const [uso] = await q.query<{ por_ip: number; total: number }>(
      `select count(*) filter (where demo_ip = $1)::int as por_ip, count(*)::int as total
       from empresas where demo_desde > now() - interval '1 hour'`,
      [ip],
    );
    if ((ip && uso.por_ip >= MAX_POR_IP_HORA) || uso.total >= MAX_TOTAL_HORA) {
      throw new DemoNoDisponible("Se crearon muchas demos en la última hora. Intenta de nuevo en un rato.");
    }

    const [{ id: empresaId }] = await q.query<{ id: string }>(
      `insert into empresas (nombre, sector, dias_alerta, fecha_alta, demo_desde, demo_ip)
       select nombre, sector, dias_alerta, now() - interval '120 days', now(), $2 from empresas where id = $1
       returning id`,
      [plantilla.id, ip],
    );
    const [{ id: usuarioId }] = await q.query<{ id: string }>(
      `insert into usuarios (empresa_id, nombre, email, password_hash, rol)
       values ($1, $2, $3, $4, 'admin') returning id`,
      [empresaId, nombreVisitante, email, passwordHash],
    );

    // Ids nuevos derivados de los de la plantilla (md5 → uuid): así las
    // referencias entre tablas se copian sin tablas de mapeo.
    const nuevoId = (col: string) => `md5(${col}::text || $2::text)::uuid`;
    await q.query(
      `insert into tipos_documento (id, empresa_id, codigo, nombre, nombre_corto, vigencia_dias, obligatorio, orden)
       select ${nuevoId("id")}, $2::uuid, codigo, nombre, nombre_corto, vigencia_dias, obligatorio, orden
       from tipos_documento where empresa_id = $1`,
      [plantilla.id, empresaId],
    );
    await q.query(
      `insert into operarios (id, empresa_id, nombre_completo, dni, puesto, fecha_ingreso, campana, activo, creado_en)
       select ${nuevoId("id")}, $2::uuid, nombre_completo, dni, puesto, fecha_ingreso + $3::int, campana, activo,
              now() - interval '120 days'
       from operarios where empresa_id = $1`,
      [plantilla.id, empresaId, desfase],
    );
    // Las rutas de archivo empiezan con el id de la empresa (36 caracteres).
    await q.query(
      `insert into documentos_operario
         (id, empresa_id, operario_id, tipo_documento_id, archivo_path, archivo_nombre, archivo_mime,
          fecha_emision, fecha_vencimiento, origen_vencimiento, revision_manual, motivo_revision,
          datos_extraidos_ia, cargado_por, fecha_carga)
       select ${nuevoId("id")}, $2::uuid, ${nuevoId("operario_id")}, ${nuevoId("tipo_documento_id")},
              $2::text || substr(archivo_path, 37), archivo_nombre, archivo_mime,
              fecha_emision + $3::int, fecha_vencimiento + $3::int, origen_vencimiento, revision_manual, motivo_revision,
              ${desplazarJson(desplazarJson("datos_extraidos_ia", "fecha_emision"), "fecha_vencimiento")},
              $4::uuid, fecha_carga + make_interval(days => $3::int)
       from documentos_operario where empresa_id = $1`,
      [plantilla.id, empresaId, desfase, usuarioId],
    );
    await copiarArchivosEmpresa(plantilla.id, empresaId, q);
    return { usuarioId, empresaId, nombre: nombreVisitante, email, rol: "admin" };
  });
}

async function buscarPlantilla() {
  const [p] = await withOwner((q) =>
    // crearEmpresa fecha el alta 120 días antes del día en que generó los datos.
    q.query<{ id: string; base: string }>(
      `select id, ((fecha_alta + interval '120 days') at time zone 'America/Lima')::date::text as base
       from empresas where plantilla order by fecha_alta desc limit 1`,
    ),
  );
  return p ?? null;
}
