"use server";

import Papa from "papaparse";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requerirSesion } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import type { EstadoAccion, ResultadoImportacion } from "./tipos";

interface DatosOperario {
  nombre_completo: string;
  dni: string;
  puesto: string | null;
  fecha_ingreso: string | null;
  campana: string | null;
}

/** Acepta YYYY-MM-DD o DD/MM/YYYY (formato habitual en Excel peruano). */
function parsearFecha(v: string): string | null | "invalida" {
  const s = v.trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  let iso: string | null = null;
  if (m) iso = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) iso = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  if (!iso) return "invalida";
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? "invalida" : iso;
}

function validar(raw: Record<string, string | undefined>): DatosOperario | string {
  const nombre = (raw.nombre_completo ?? "").trim().replace(/\s+/g, " ");
  const dni = (raw.dni ?? "").trim().toUpperCase();
  if (!nombre) return "Falta el nombre.";
  // DNI peruano = 8 dígitos; se aceptan también CE/pasaporte (hasta 12 caracteres).
  if (!/^[0-9A-Z]{8,12}$/.test(dni)) return `DNI/CE inválido: "${dni}".`;
  const fecha = parsearFecha(raw.fecha_ingreso ?? "");
  if (fecha === "invalida") return `Fecha de ingreso inválida: "${raw.fecha_ingreso}".`;
  return {
    nombre_completo: nombre.toUpperCase(),
    dni,
    puesto: raw.puesto?.trim() || null,
    fecha_ingreso: fecha,
    campana: raw.campana?.trim() || null,
  };
}

function datosDeForm(form: FormData) {
  return validar({
    nombre_completo: String(form.get("nombre_completo") ?? ""),
    dni: String(form.get("dni") ?? ""),
    puesto: String(form.get("puesto") ?? ""),
    fecha_ingreso: String(form.get("fecha_ingreso") ?? ""),
    campana: String(form.get("campana") ?? ""),
  });
}

export async function crearOperario(_prev: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  const s = await requerirSesion();
  const datos = datosDeForm(form);
  if (typeof datos === "string") return { error: datos };
  const creado = await withTenant(s.empresaId, async (q) => {
    const existe = await q.query("select 1 from operarios where dni = $1", [datos.dni]);
    if (existe.length) return null;
    const [o] = await q.query<{ id: string }>(
      `insert into operarios (empresa_id, nombre_completo, dni, puesto, fecha_ingreso, campana)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [s.empresaId, datos.nombre_completo, datos.dni, datos.puesto, datos.fecha_ingreso, datos.campana],
    );
    return o;
  });
  if (!creado) return { error: `Ya existe un operario con DNI ${datos.dni}.` };
  revalidatePath("/", "layout");
  redirect(`/operarios/${creado.id}`);
}

export async function actualizarOperario(_prev: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  const s = await requerirSesion();
  const id = String(form.get("id") ?? "");
  const datos = datosDeForm(form);
  if (typeof datos === "string") return { error: datos };
  const activo = form.get("activo") === "on";
  try {
    await withTenant(s.empresaId, (q) =>
      q.query(
        `update operarios set nombre_completo = $2, dni = $3, puesto = $4, fecha_ingreso = $5, campana = $6, activo = $7
         where id = $1`,
        [id, datos.nombre_completo, datos.dni, datos.puesto, datos.fecha_ingreso, datos.campana, activo],
      ),
    );
  } catch (e) {
    if ((e as { code?: string }).code === "23505") return { error: `Ya existe otro operario con DNI ${datos.dni}.` };
    throw e;
  }
  revalidatePath("/", "layout");
  return { ok: true, mensaje: "Datos guardados." };
}

const ALIAS_COLUMNAS: Record<string, keyof DatosOperario> = {
  nombre_completo: "nombre_completo",
  nombre: "nombre_completo",
  nombres_y_apellidos: "nombre_completo",
  apellidos_y_nombres: "nombre_completo",
  dni: "dni",
  documento: "dni",
  puesto: "puesto",
  cargo: "puesto",
  fecha_ingreso: "fecha_ingreso",
  ingreso: "fecha_ingreso",
  campana: "campana",
};

function normalizarCabecera(h: string): string {
  return h
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export async function importarCsv(_prev: ResultadoImportacion, form: FormData): Promise<ResultadoImportacion> {
  const s = await requerirSesion();
  const archivo = form.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return { error: "Selecciona un archivo CSV." };
  if (archivo.size > 2_000_000) return { error: "El CSV no debe pasar de 2 MB." };

  const texto = (await archivo.text()).replace(/^﻿/, "");
  const parsed = Papa.parse<Record<string, string>>(texto, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => ALIAS_COLUMNAS[normalizarCabecera(h)] ?? normalizarCabecera(h),
  });
  const campos = parsed.meta.fields ?? [];
  if (!campos.includes("nombre_completo") || !campos.includes("dni")) {
    return { error: "El CSV debe tener al menos las columnas nombre_completo y dni (descarga la plantilla)." };
  }

  const errores: { fila: number; error: string }[] = [];
  const validos: DatosOperario[] = [];
  const vistos = new Set<string>();
  parsed.data.forEach((raw, i) => {
    const fila = i + 2; // +1 por la cabecera, +1 porque las filas empiezan en 1
    const r = validar(raw);
    if (typeof r === "string") return errores.push({ fila, error: r });
    if (vistos.has(r.dni)) return errores.push({ fila, error: `DNI ${r.dni} repetido en el archivo.` });
    vistos.add(r.dni);
    validos.push(r);
  });

  let creados = 0;
  let actualizados = 0;
  await withTenant(s.empresaId, async (q) => {
    for (const d of validos) {
      const [r] = await q.query<{ insertado: boolean }>(
        `insert into operarios (empresa_id, nombre_completo, dni, puesto, fecha_ingreso, campana)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (empresa_id, dni) do update set
           nombre_completo = excluded.nombre_completo,
           puesto = coalesce(excluded.puesto, operarios.puesto),
           fecha_ingreso = coalesce(excluded.fecha_ingreso, operarios.fecha_ingreso),
           campana = coalesce(excluded.campana, operarios.campana),
           activo = true
         returning (xmax = 0) as insertado`,
        [s.empresaId, d.nombre_completo, d.dni, d.puesto, d.fecha_ingreso, d.campana],
      );
      if (r.insertado) creados++;
      else actualizados++;
    }
  });

  revalidatePath("/", "layout");
  return {
    ok: true,
    creados,
    actualizados,
    errores,
    mensaje: `${creados} operarios creados, ${actualizados} actualizados${errores.length ? `, ${errores.length} filas con error` : ""}.`,
  };
}
