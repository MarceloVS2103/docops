import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod/v4";

/**
 * Lectura de documentos con Claude (visión + salida estructurada).
 * Devuelve lo que dice el documento; la decisión de si queda en revisión
 * manual se toma aparte, en `evaluar.ts`, con reglas deterministas.
 */

export const MODELO = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

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

export type ResultadoExtraccion =
  | { ok: true; extraccion: Extraccion; modelo: string }
  | { ok: false; motivo: string };

export const MIME_SOPORTADOS = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
type MimeSoportado = (typeof MIME_SOPORTADOS)[number];

export function iaConfigurada(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

const SYSTEM = `Eres un asistente de RRHH en Perú que lee documentos laborales de operarios (agroindustria y minería) y extrae sus datos con precisión.
Reglas:
- Los documentos peruanos escriben las fechas como día/mes/año. Devuélvelas siempre como YYYY-MM-DD.
- No inventes datos: si un campo no aparece o no se lee con seguridad, usa null.
- Pistas por tipo:
  * DNI: la "Fecha de Caducidad" es el vencimiento; "Fecha de Emisión" es la emisión.
  * Antecedentes penales / policiales: normalmente solo traen fecha de emisión; el resultado es "NO REGISTRA" o "REGISTRA" antecedentes.
  * EMO (examen médico ocupacional): la fecha del examen o del certificado es la emisión; el resultado es la aptitud (APTO, NO APTO, APTO CON RESTRICCIONES). Si indica "válido hasta", esa es el vencimiento.
  * SCTR: constancia de póliza con vigencia "desde/hasta"; "hasta" es el vencimiento y "desde" o la fecha de la constancia es la emisión.`;

export async function extraerDatosDocumento(params: {
  archivo: Buffer;
  mime: string;
  tipos: TipoParaIA[];
  tipoEsperado: TipoParaIA;
}): Promise<ResultadoExtraccion> {
  if (!iaConfigurada()) {
    return { ok: false, motivo: "IA no configurada (falta ANTHROPIC_API_KEY): completa los datos manualmente." };
  }
  if (!MIME_SOPORTADOS.includes(params.mime as MimeSoportado)) {
    return { ok: false, motivo: `Formato ${params.mime} no soportado para lectura automática.` };
  }

  const data = params.archivo.toString("base64");
  const archivoBlock: Anthropic.Beta.BetaContentBlockParam =
    params.mime === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
      : {
          type: "image",
          source: { type: "base64", media_type: params.mime as Exclude<MimeSoportado, "application/pdf">, data },
        };

  const lista = [...params.tipos.map((t) => `- ${t.codigo}: ${t.nombre}`), "- OTRO: ninguno de los anteriores"].join("\n");

  try {
    const client = new Anthropic();
    const response = await client.beta.messages.parse({
      model: MODELO,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(ExtraccionSchema) },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            archivoBlock,
            {
              type: "text",
              text: `RRHH cargó este archivo como "${params.tipoEsperado.nombre}" (${params.tipoEsperado.codigo}).\nTipos de documento posibles:\n${lista}\n\nExtrae los datos del documento.`,
            },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return { ok: false, motivo: "La IA no pudo procesar este documento: requiere revisión manual." };
    }
    if (response.stop_reason === "max_tokens" || !response.parsed_output) {
      return { ok: false, motivo: "La IA no devolvió una lectura completa: requiere revisión manual." };
    }
    return { ok: true, extraccion: response.parsed_output, modelo: response.model };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return { ok: false, motivo: "La API key de Claude no es válida: completa los datos manualmente." };
    }
    if (err instanceof Anthropic.RateLimitError) {
      return { ok: false, motivo: "Límite de uso de la IA alcanzado; intenta reprocesar en unos minutos." };
    }
    if (err instanceof Anthropic.APIError) {
      return { ok: false, motivo: `Error de la IA (${err.status ?? "red"}): requiere revisión manual.` };
    }
    console.error("[extraer] error inesperado", err);
    return { ok: false, motivo: "No se pudo leer el documento con IA: requiere revisión manual." };
  }
}
