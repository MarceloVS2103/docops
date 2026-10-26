import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import {
  ExtraccionSchema,
  INSTRUCCIONES,
  MOTIVO_FALLO_GENERICO,
  mensajeUsuario,
  type ParametrosExtraccion,
  type ResultadoExtraccion,
} from "@/lib/ia/esquema";

/** Lectura con Claude (visión + salida estructurada). */

export const MODELO_CLAUDE = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

export function claudeConfigurado(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export async function extraerConClaude(p: ParametrosExtraccion): Promise<ResultadoExtraccion> {
  const data = p.archivo.toString("base64");
  const archivoBlock: Anthropic.Beta.BetaContentBlockParam =
    p.mime === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
      : { type: "image", source: { type: "base64", media_type: p.mime, data } };

  try {
    const client = new Anthropic();
    const response = await client.beta.messages.parse({
      model: MODELO_CLAUDE,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(ExtraccionSchema) },
      system: INSTRUCCIONES,
      messages: [{ role: "user", content: [archivoBlock, { type: "text", text: mensajeUsuario(p) }] }],
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
    console.error("[ia/claude] error inesperado", err);
    return { ok: false, motivo: MOTIVO_FALLO_GENERICO };
  }
}
