import { z } from "zod/v4";

/**
 * Lo que se le pide a la IA, común a todos los proveedores: el esquema de la
 * respuesta, las instrucciones y el mensaje. La decisión de si el documento
 * queda en revisión manual se toma aparte, en `evaluar.ts`.
 */

export const ExtraccionSchema = z.object({
  legible: z
    .boolean()
    .describe("false si la imagen/PDF está borrosa, cortada o no se puede leer con seguridad"),
  tipo_documento: z
    .string()
    .describe("Código del tipo de documento detectado (uno de la lista dada) u OTRO si no corresponde a ninguno"),
  nombre_persona: z.string().nullable().describe("Nombre completo del titular tal como aparece"),
  numero_documento_identidad: z.string().nullable().describe("Número de DNI/CE del titular si aparece"),
  fecha_emision: z.string().nullable().describe("Fecha de emisión en formato YYYY-MM-DD"),
  fecha_vencimiento: z
    .string()
    .nullable()
    .describe("Fecha de vencimiento/caducidad/fin de cobertura impresa, en formato YYYY-MM-DD. null si el documento no la trae"),
  entidad_emisora: z.string().nullable(),
  resultado: z
    .string()
    .nullable()
    .describe("Resultado o dictamen si aplica: p. ej. 'NO REGISTRA ANTECEDENTES', 'APTO', 'APTO CON RESTRICCIONES'"),
  resultado_favorable: z
    .boolean()
    .nullable()
    .describe("true si el resultado permite trabajar (no registra antecedentes, apto); false si no; null si no aplica"),
  confianza: z.enum(["alta", "media", "baja"]),
  observaciones: z.string().nullable().describe("Cualquier detalle relevante para RRHH, breve"),
});

export type Extraccion = z.infer<typeof ExtraccionSchema>;

export interface TipoParaIA {
  codigo: string;
  nombre: string;
}

export interface ParametrosExtraccion {
  archivo: Buffer;
  mime: MimeSoportado;
  tipos: TipoParaIA[];
  tipoEsperado: TipoParaIA;
}

export type ResultadoExtraccion =
  | { ok: true; extraccion: Extraccion; modelo: string }
  | { ok: false; motivo: string };

export const MIME_SOPORTADOS = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
export type MimeSoportado = (typeof MIME_SOPORTADOS)[number];

export const INSTRUCCIONES = `Eres un asistente de RRHH en Perú que lee documentos laborales de operarios (agroindustria y minería) y extrae sus datos con precisión.
Reglas:
- Los documentos peruanos escriben las fechas como día/mes/año. Devuélvelas siempre como YYYY-MM-DD.
- No inventes datos: si un campo no aparece o no se lee con seguridad, usa null.
- Pistas por tipo:
  * DNI: la "Fecha de Caducidad" es el vencimiento; "Fecha de Emisión" es la emisión.
  * Antecedentes penales / policiales: normalmente solo traen fecha de emisión; el resultado es "NO REGISTRA" o "REGISTRA" antecedentes.
  * EMO (examen médico ocupacional): la fecha del examen o del certificado es la emisión; el resultado es la aptitud (APTO, NO APTO, APTO CON RESTRICCIONES). Si indica "válido hasta", esa es el vencimiento.
  * SCTR: constancia de póliza con vigencia "desde/hasta"; "hasta" es el vencimiento y "desde" o la fecha de la constancia es la emisión.`;

export function mensajeUsuario(p: Pick<ParametrosExtraccion, "tipos" | "tipoEsperado">): string {
  const lista = [...p.tipos.map((t) => `- ${t.codigo}: ${t.nombre}`), "- OTRO: ninguno de los anteriores"].join("\n");
  return `RRHH cargó este archivo como "${p.tipoEsperado.nombre}" (${p.tipoEsperado.codigo}).\nTipos de documento posibles:\n${lista}\n\nExtrae los datos del documento.`;
}

export const MOTIVO_FALLO_GENERICO = "No se pudo leer el documento con IA: requiere revisión manual.";
