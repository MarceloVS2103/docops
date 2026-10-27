import { NextResponse, type NextRequest } from "next/server";
import { crearPlantilla, limpiarDemos } from "@/lib/demo";

/**
 * Cron diario (vercel.json): borra las copias vencidas de la demo y regenera la
 * plantilla, para que las fechas impresas en sus PDFs sigan cerca de hoy.
 * Vercel manda `Authorization: Bearer $CRON_SECRET`.
 */
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || req.headers.get("authorization") !== `Bearer ${secreto}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const borradas = await limpiarDemos();
  const plantilla = await crearPlantilla();
  return NextResponse.json({ ok: true, borradas, plantilla });
}
