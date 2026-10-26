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

export const MODELO_GEMINI = process.env.GEMINI_MODEL || "gemini-3.8-flash";

// `$schema` no está entre las claves que Gemini documenta como soportadas.
const { $schema: _omitido, ...ESQUEMA_JSON } = z.toJSONSchema(ExtraccionSchema);
void _omitido;

export function geminiConfigurado(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export async function extraerConGemini(p: ParametrosExtraccion): Promise<ResultadoExtraccion> {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: MODELO_GEMINI,
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
    if (!texto) {
      return { ok: false, motivo: "La IA no pudo procesar este documento: requiere revisión manual." };
    }
    const parsed = ExtraccionSchema.safeParse(JSON.parse(texto));
    if (!parsed.success) {
      console.error("[ia/gemini] respuesta fuera de esquema", parsed.error.issues);
      return { ok: false, motivo: "La IA no devolvió una lectura completa: requiere revisión manual." };
    }
    return { ok: true, extraccion: parsed.data, modelo: response.modelVersion ?? MODELO_GEMINI };
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 400 && /api key/i.test(err.message)) {
        return { ok: false, motivo: "La API key de Gemini no es válida: completa los datos manualmente." };
      }
      if (err.status === 401 || err.status === 403) {
        return { ok: false, motivo: "La API key de Gemini no es válida: completa los datos manualmente." };
      }
      if (err.status === 429) {
        return { ok: false, motivo: "Límite de uso de la IA alcanzado; intenta reprocesar en unos minutos." };
      }
      return { ok: false, motivo: `Error de la IA (${err.status}): requiere revisión manual.` };
    }
    if (err instanceof SyntaxError) {
      return { ok: false, motivo: "La IA no devolvió una lectura completa: requiere revisión manual." };
    }
    console.error("[ia/gemini] error inesperado", err);
    return { ok: false, motivo: MOTIVO_FALLO_GENERICO };
  }
}
