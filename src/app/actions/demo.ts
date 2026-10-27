"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { iniciarSesion } from "@/lib/auth";
import { DIAS_DEMO, DemoNoDisponible, crearEmpresaDemo } from "@/lib/demo";
import type { EstadoAccion } from "./tipos";

export async function entrarDemo(_prev: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  const nombre = String(form.get("nombre") ?? "").trim().slice(0, 80) || "Visitante de la demo";
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  try {
    const sesion = await crearEmpresaDemo(nombre, ip);
    await iniciarSesion(sesion, DIAS_DEMO * 24 * 60 * 60);
  } catch (err) {
    if (err instanceof DemoNoDisponible) return { error: err.message };
    throw err;
  }
  redirect("/");
}
