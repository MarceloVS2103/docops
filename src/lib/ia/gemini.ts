import { ApiError, GoogleGenAI } from "@google/genai";
import { z } from "zod/v4";
import {
  ExtraccionSchema,
  INSTRUCCIONES,
  MOTIVO_FALLO_GENERICO,
  mensajeUsuario,
  type ParametrosExtraccion,
  type ResultadoExtraccion,
} from "@/lib/ia/esquema";

/** Lectura con Gemini (PDF/imagen en línea + respuesta JSON con esquema). */

// gemini-3.8-flash es más capaz, pero en el plan gratuito respondía saturado (503/429)
// durante las pruebas; 3.6 leyó bien los PDFs de la encuesta en 2-4 s.
export const MODELO_GEMINI = process.env.GEMINI_MODEL || "gemini-3.6-flash";
// Si el principal sigue saturado tras los reintentos (pasa en el plan gratuito), se prueba este.
const MODELO_RESPALDO = process.env.GEMINI_MODEL_RESPALDO || "gemini-3.5-flash-lite";

/** Saturación o cuota: vale la pena reintentar o cambiar de modelo. */
const ES_TRANSITORIO = new Set([429, 500, 503, 504]);

// `$schema` no está entre las claves que Gemini documenta como soportadas.
const { $schema: _omitido, ...ESQUEMA_JSON } = z.toJSONSchema(ExtraccionSchema);
void _omitido;

export function geminiConfigurado(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export async function extraerConGemini(p: ParametrosExtraccion): Promise<ResultadoExtraccion> {
  const modelos = [...new Set([MODELO_GEMINI, MODELO_RESPALDO])];
  let ultimo: ResultadoExtraccion = { ok: false, motivo: MOTIVO_FALLO_GENERICO };
  for (const modelo of modelos) {
    const r = await extraerConModelo(p, modelo);
    if (r.ok || !r.transitorio) return r.resultado;
    ultimo = r.resultado;
  }
  return ultimo;
}

async function extraerConModelo(
  p: ParametrosExtraccion,
  modelo: string,
): Promise<{ ok: true; resultado: ResultadoExtraccion } | { ok: false; transitorio: boolean; resultado: ResultadoExtraccion }> {
  const fallo = (motivo: string, transitorio = false) => ({ ok: false as const, transitorio, resultado: { ok: false as const, motivo } });
  try {
    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      // Un reintento del SDK ante saturación y tope por intento: en el peor caso
      // (2 modelos × 2 intentos) cabe en el maxDuration de la página.
      httpOptions: {
        timeout: 20_000,
        retryOptions: { attempts: 2, initialDelay: 1, maxDelay: 2, httpStatusCodes: [...ES_TRANSITORIO] },
      },
    });
    const response = await ai.models.generateContent({
      model: modelo,
      contents: [
        {
          role: "user",
          parts: [{ inlineData: { mimeType: p.mime, data: p.archivo.toString("base64") } }, { text: mensajeUsuario(p) }],
        },
      ],
      config: {
        systemInstruction: INSTRUCCIONES,
        responseMimeType: "application/json",
        responseJsonSchema: ESQUEMA_JSON,
      },
    });

    // Sin texto = respuesta bloqueada o cortada; se valida igual contra el esquema.
    const texto = response.text;
    if (!texto) return fallo("La IA no pudo procesar este documento: requiere revisión manual.");
    const parsed = ExtraccionSchema.safeParse(JSON.parse(texto));
    if (!parsed.success) {
      console.error("[ia/gemini] respuesta fuera de esquema", parsed.error.issues);
      return fallo("La IA no devolvió una lectura completa: requiere revisión manual.");
    }
    return { ok: true, resultado: { ok: true, extraccion: parsed.data, modelo: response.modelVersion ?? modelo } };
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 401 || err.status === 403 || (err.status === 400 && /api key/i.test(err.message))) {
        return fallo("La API key de Gemini no es válida: completa los datos manualmente.");
      }
      if (ES_TRANSITORIO.has(err.status)) {
        console.warn(`[ia/gemini] ${modelo} respondió ${err.status} tras reintentos`);
        return fallo("La IA está saturada en este momento: usa \"Volver a leer con IA\" en unos minutos.", true);
      }
      return fallo(`Error de la IA (${err.status}): requiere revisión manual.`);
    }
    if (err instanceof SyntaxError) return fallo("La IA no devolvió una lectura completa: requiere revisión manual.");
    console.error("[ia/gemini] error inesperado", err);
    return fallo(MOTIVO_FALLO_GENERICO, true);
  }
}
