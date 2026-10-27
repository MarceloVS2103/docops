import { withTenant, type Queryable } from "@/lib/db";
import { calcularEstado, hoy, ESTADO_PRIORIDAD, type Estado } from "@/lib/estado";

export interface Empresa {
  id: string;
  nombre: string;
  sector: "agroexportadora" | "minera";
  /** Copia de la demo abierta: se muestra como empresa genérica, sin sector. */
  demo: boolean;
  dias_alerta: number;
}

export interface TipoDocumento {
  id: string;
  codigo: string;
  nombre: string;
  nombre_corto: string;
  vigencia_dias: number | null;
  obligatorio: boolean;
  orden: number;
}

export interface Operario {
  id: string;
  nombre_completo: string;
  dni: string;
  puesto: string | null;
  fecha_ingreso: string | null;
  campana: string | null;
  activo: boolean;
}

export interface Documento {
  id: string;
  operario_id: string;
  tipo_documento_id: string;
  archivo_nombre: string;
  archivo_mime: string;
  fecha_emision: string | null;
  fecha_vencimiento: string | null;
  origen_vencimiento: "documento" | "calculada" | "manual" | null;
  revision_manual: boolean;
  motivo_revision: string | null;
  datos_extraidos_ia: Record<string, unknown> | null;
  cargado_por_nombre: string | null;
  fecha_carga: string;
}

export interface Celda {
  estado: Estado;
  diasRestantes: number | null;
  documento: Documento | null;
}

export interface FilaTablero {
  operario: Operario;
  celdas: Record<string, Celda>;
  /** Peor estado entre los documentos obligatorios. */
  peorEstado: Estado;
  /** true si todos los obligatorios están vigentes o por vencer. */
  apto: boolean;
}

export interface Alerta {
  operario: Pick<Operario, "id" | "nombre_completo" | "dni" | "puesto">;
  tipo: Pick<TipoDocumento, "id" | "nombre" | "nombre_corto">;
  estado: Estado;
  diasRestantes: number | null;
  fecha_vencimiento: string | null;
  motivo: string | null;
}

const DOC_COLUMNS = `d.id, d.operario_id, d.tipo_documento_id, d.archivo_nombre, d.archivo_mime,
  d.fecha_emision, d.fecha_vencimiento, d.origen_vencimiento, d.revision_manual, d.motivo_revision,
  d.datos_extraidos_ia, u.nombre as cargado_por_nombre, d.fecha_carga::text as fecha_carga`;

async function empresa(q: Queryable): Promise<Empresa> {
  const [e] = await q.query<Empresa>("select id, nombre, sector, dias_alerta, demo_desde is not null as demo from empresas");
  if (!e) throw new Error("Empresa no encontrada");
  return e;
}

async function tipos(q: Queryable): Promise<TipoDocumento[]> {
  return q.query<TipoDocumento>(
    "select id, codigo, nombre, nombre_corto, vigencia_dias, obligatorio, orden from tipos_documento order by orden, nombre",
  );
}

export function obtenerEmpresa(empresaId: string) {
  return withTenant(empresaId, empresa);
}

/** Como obtenerEmpresa, pero devuelve null si la empresa ya no existe. */
export function buscarEmpresa(empresaId: string): Promise<Empresa | null> {
  return withTenant(empresaId, async (q) => {
    const [e] = await q.query<Empresa>("select id, nombre, sector, dias_alerta, demo_desde is not null as demo from empresas");
    return e ?? null;
  });
}

export function listarTipos(empresaId: string) {
  return withTenant(empresaId, tipos);
}

export function listarOperarios(empresaId: string) {
  return withTenant(empresaId, (q) =>
    q.query<Operario>(
      `select id, nombre_completo, dni, puesto, fecha_ingreso, campana, activo
       from operarios order by activo desc, nombre_completo`,
    ),
  );
}

function armarFilas(
  ops: Operario[],
  ts: TipoDocumento[],
  docs: Documento[],
  diasAlerta: number,
): FilaTablero[] {
  const fecha = hoy();
  const porClave = new Map(docs.map((d) => [`${d.operario_id}:${d.tipo_documento_id}`, d]));
  return ops.map((operario) => {
    const celdas: Record<string, Celda> = {};
    let peorEstado: Estado = "vigente";
    let apto = true;
    for (const t of ts) {
      const documento = porClave.get(`${operario.id}:${t.id}`) ?? null;
      const { estado, diasRestantes } = calcularEstado(documento, diasAlerta, fecha);
      celdas[t.id] = { estado, diasRestantes, documento };
      if (t.obligatorio) {
        if (ESTADO_PRIORIDAD[estado] < ESTADO_PRIORIDAD[peorEstado]) peorEstado = estado;
        if (estado !== "vigente" && estado !== "por_vencer") apto = false;
      }
    }
    return { operario, celdas, peorEstado, apto };
  });
}

/** Último documento cargado por operario y tipo. */
async function ultimosDocumentos(q: Queryable, operarioId?: string): Promise<Documento[]> {
  return q.query<Documento>(
    `select distinct on (d.operario_id, d.tipo_documento_id) ${DOC_COLUMNS}
     from documentos_operario d left join usuarios u on u.id = d.cargado_por
     ${operarioId ? "where d.operario_id = $1" : ""}
     order by d.operario_id, d.tipo_documento_id, d.fecha_carga desc`,
    operarioId ? [operarioId] : [],
  );
}

export function obtenerTablero(empresaId: string) {
  return withTenant(empresaId, async (q) => {
    const e = await empresa(q);
    const ts = await tipos(q);
    const ops = await q.query<Operario>(
      `select id, nombre_completo, dni, puesto, fecha_ingreso, campana, activo
       from operarios where activo order by nombre_completo`,
    );
    const docs = await ultimosDocumentos(q);
    const filas = armarFilas(ops, ts, docs, e.dias_alerta);

    const conteo: Record<Estado, number> = { vigente: 0, por_vencer: 0, vencido: 0, pendiente: 0, revision_manual: 0 };
    const alertas: Alerta[] = [];
    for (const f of filas) {
      for (const t of ts) {
        const c = f.celdas[t.id];
        conteo[c.estado]++;
        if (c.estado === "vencido" || c.estado === "por_vencer" || c.estado === "revision_manual") {
          alertas.push({
            operario: f.operario,
            tipo: t,
            estado: c.estado,
            diasRestantes: c.diasRestantes,
            fecha_vencimiento: c.documento?.fecha_vencimiento ?? null,
            motivo: c.documento?.motivo_revision ?? null,
          });
        }
      }
    }
    alertas.sort(
      (a, b) =>
        ESTADO_PRIORIDAD[a.estado] - ESTADO_PRIORIDAD[b.estado] ||
        (a.diasRestantes ?? 0) - (b.diasRestantes ?? 0) ||
        a.operario.nombre_completo.localeCompare(b.operario.nombre_completo),
    );
    const campanas = [...new Set(ops.map((o) => o.campana).filter((c): c is string => Boolean(c)))].sort();
    return {
      empresa: e,
      tipos: ts,
      filas,
      alertas,
      campanas,
      resumen: {
        operarios: filas.length,
        aptos: filas.filter((f) => f.apto).length,
        conteo,
      },
    };
  });
}

export function obtenerOperario(empresaId: string, operarioId: string) {
  return withTenant(empresaId, async (q) => {
    const [operario] = await q.query<Operario>(
      "select id, nombre_completo, dni, puesto, fecha_ingreso, campana, activo from operarios where id = $1",
      [operarioId],
    );
    if (!operario) return null;
    const e = await empresa(q);
    const ts = await tipos(q);
    const ultimos = await ultimosDocumentos(q, operarioId);
    const [fila] = armarFilas([operario], ts, ultimos, e.dias_alerta);
    const historial = await q.query<Documento & { tipo_nombre: string }>(
      `select ${DOC_COLUMNS}, t.nombre_corto as tipo_nombre
       from documentos_operario d
       join tipos_documento t on t.id = d.tipo_documento_id
       left join usuarios u on u.id = d.cargado_por
       where d.operario_id = $1 order by d.fecha_carga desc`,
      [operarioId],
    );
    return { empresa: e, tipos: ts, fila, historial };
  });
}

export function listarUsuarios(empresaId: string) {
  return withTenant(empresaId, (q) =>
    q.query<{ id: string; nombre: string; email: string; rol: string; creado_en: string }>(
      "select id, nombre, email, rol, creado_en::text from usuarios order by creado_en",
    ),
  );
}
