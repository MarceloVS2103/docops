import { claudeConfigurado, extraerConClaude } from "@/lib/ia/claude";
import {
  MIME_SOPORTADOS,
  type MimeSoportado,
  type ResultadoExtraccion,
  type TipoParaIA,
} from "@/lib/ia/esquema";
import { extraerConGemini, geminiConfigurado } from "@/lib/ia/gemini";

/**
 * Punto de entrada de la lectura con IA. El proveedor se elige con
 * IA_PROVEEDOR=gemini|claude; sin esa variable, se usa el que tenga API key
 * (Gemini primero). Sin ninguna key, el documento queda en revisión manual.
 */

export { MIME_SOPORTADOS };
export type { Extraccion, ResultadoExtraccion, TipoParaIA } from "@/lib/ia/esquema";

type Proveedor = "gemini" | "claude";

export function proveedorIA(): Proveedor | null {
  const elegido = process.env.IA_PROVEEDOR;
  if (elegido === "gemini") return geminiConfigurado() ? "gemini" : null;
  if (elegido === "claude") return claudeConfigurado() ? "claude" : null;
  if (geminiConfigurado()) return "gemini";
  if (claudeConfigurado()) return "claude";
  return null;
}

export async function extraerDatosDocumento(params: {
  archivo: Buffer;
  mime: string;
  tipos: TipoParaIA[];
  tipoEsperado: TipoParaIA;
}): Promise<ResultadoExtraccion> {
  const proveedor = proveedorIA();
  if (!proveedor) {
    return {
      ok: false,
      motivo: "IA no configurada (falta GEMINI_API_KEY o ANTHROPIC_API_KEY): completa los datos manualmente.",
    };
  }
  if (!MIME_SOPORTADOS.includes(params.mime as MimeSoportado)) {
    return { ok: false, motivo: `Formato ${params.mime} no soportado para lectura automática.` };
  }
  const p = { ...params, mime: params.mime as MimeSoportado };
  return proveedor === "gemini" ? extraerConGemini(p) : extraerConClaude(p);
}
