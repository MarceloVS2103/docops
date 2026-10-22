import type { Queryable } from "@/lib/db";

/**
 * Plantilla de tipos de documento que se copia a cada empresa nueva.
 * Las vigencias son el criterio habitual de RRHH en Perú y cada empresa puede
 * editarlas en Configuración (ver ASSUMPTIONS.md).
 */
export const CATALOGO_BASE = [
  {
    codigo: "DNI",
    nombre: "Documento Nacional de Identidad (DNI)",
    nombre_corto: "DNI",
    vigencia_dias: null, // trae fecha de caducidad impresa
    obligatorio: true,
  },
  {
    codigo: "ANTECEDENTES_PENALES",
    nombre: "Certificado de Antecedentes Penales",
    nombre_corto: "Ant. Penales",
    vigencia_dias: 90,
    obligatorio: true,
  },
  {
    codigo: "ANTECEDENTES_POLICIALES",
    nombre: "Certificado de Antecedentes Policiales",
    nombre_corto: "Ant. Policiales",
    vigencia_dias: 90,
    obligatorio: true,
  },
  {
    codigo: "EMO",
    nombre: "Examen Médico Ocupacional (EMO)",
    nombre_corto: "EMO",
    vigencia_dias: 365,
    obligatorio: true,
  },
  {
    codigo: "SCTR",
    nombre: "Seguro Complementario de Trabajo de Riesgo (SCTR)",
    nombre_corto: "SCTR",
    vigencia_dias: null, // la constancia trae la cobertura "hasta"
    obligatorio: true,
  },
] as const;

export async function crearCatalogoEmpresa(q: Queryable, empresaId: string) {
  for (const [i, t] of CATALOGO_BASE.entries()) {
    await q.query(
      `insert into tipos_documento (empresa_id, codigo, nombre, nombre_corto, vigencia_dias, obligatorio, orden)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [empresaId, t.codigo, t.nombre, t.nombre_corto, t.vigencia_dias, t.obligatorio, i + 1],
    );
  }
}
