import { hoy as fechaHoy, sumarDias } from "@/lib/estado";
import type { Extraccion } from "@/lib/ia/extraer";

/**
 * Reglas deterministas que convierten la lectura de la IA en fechas efectivas
 * y deciden si el documento necesita revisión manual. Separado de la llamada
 * a la IA para poder probarlo sin red.
 */

export interface ContextoEvaluacion {
  tipoCodigo: string;
  tipoNombre: string;
  vigenciaDias: number | null;
  operarioNombre: string;
  operarioDni: string;
  hoy?: string;
}

export interface Evaluacion {
  fecha_emision: string | null;
  fecha_vencimiento: string | null;
  origen_vencimiento: "documento" | "calculada" | null;
  revision_manual: boolean;
  motivos: string[];
}

function fechaValida(v: string | null | undefined): string | null {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : v;
}

export function normalizarTexto(s: string): string[] {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-ZÑ ]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

/** Coinciden si al menos 2 palabras del nombre del operario aparecen en el documento. */
export function nombresCoinciden(operario: string, documento: string): boolean {
  const doc = new Set(normalizarTexto(documento));
  const tokens = normalizarTexto(operario);
  const comunes = tokens.filter((t) => doc.has(t)).length;
  return comunes >= Math.min(2, tokens.length);
}

export function evaluarExtraccion(ex: Extraccion, ctx: ContextoEvaluacion): Evaluacion {
  const hoy = ctx.hoy ?? fechaHoy();
  const motivos: string[] = [];

  if (!ex.legible) motivos.push("Documento ilegible o incompleto.");
  if (ex.confianza === "baja") motivos.push("La IA tiene baja confianza en la lectura.");

  if (ex.tipo_documento !== ctx.tipoCodigo) {
    motivos.push(
      ex.tipo_documento === "OTRO"
        ? `El archivo no parece ser un ${ctx.tipoNombre}.`
        : `El archivo parece ser ${ex.tipo_documento}, no ${ctx.tipoCodigo}.`,
    );
  }

  if (ex.nombre_persona && !nombresCoinciden(ctx.operarioNombre, ex.nombre_persona)) {
    motivos.push(`El nombre del documento ("${ex.nombre_persona}") no coincide con el operario.`);
  } else if (!ex.nombre_persona) {
    motivos.push("No se encontró el nombre del titular.");
  }

  const dniDoc = ex.numero_documento_identidad?.replace(/\D/g, "");
  if (dniDoc && dniDoc.length >= 8 && dniDoc !== ctx.operarioDni.replace(/\D/g, "")) {
    motivos.push(`El número de documento (${dniDoc}) no coincide con el DNI del operario.`);
  }

  if (ex.resultado_favorable === false) {
    motivos.push(`Resultado desfavorable: ${ex.resultado ?? "ver documento"}.`);
  }

  const emision = fechaValida(ex.fecha_emision);
  const impresa = fechaValida(ex.fecha_vencimiento);
  if (emision && emision > hoy) motivos.push("La fecha de emisión está en el futuro.");

  // Si hay vencimiento impreso y además una vigencia por antigüedad, se toma
  // la fecha más temprana (criterio conservador de cumplimiento).
  const calculada = emision && ctx.vigenciaDias ? sumarDias(emision, ctx.vigenciaDias) : null;
  let vencimiento: string | null = null;
  let origen: Evaluacion["origen_vencimiento"] = null;
  if (impresa && (!calculada || impresa <= calculada)) {
    vencimiento = impresa;
    origen = "documento";
  } else if (calculada) {
    vencimiento = calculada;
    origen = "calculada";
  }
  if (!vencimiento) motivos.push("No se pudo determinar la fecha de vencimiento.");

  return {
    fecha_emision: emision,
    fecha_vencimiento: vencimiento,
    origen_vencimiento: origen,
    revision_manual: motivos.length > 0,
    motivos,
  };
}
