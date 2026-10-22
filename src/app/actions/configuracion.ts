"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { hashPassword, requerirAdmin } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import type { EstadoAccion, ResultadoInvitacion } from "./tipos";

function entero(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isInteger(n) && n > 0 ? n : NaN;
}

export async function actualizarEmpresa(_prev: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  const s = await requerirAdmin();
  const nombre = String(form.get("nombre") ?? "").trim();
  const dias = entero(form.get("dias_alerta"));
  if (!nombre) return { error: "El nombre es obligatorio." };
  if (dias === null || Number.isNaN(dias) || dias > 365) return { error: "Días de alerta: entre 1 y 365." };
  await withTenant(s.empresaId, (q) =>
    q.query("update empresas set nombre = $2, dias_alerta = $3 where id = $1", [s.empresaId, nombre, dias]),
  );
  revalidatePath("/", "layout");
  return { ok: true, mensaje: "Guardado." };
}

export async function guardarTipo(_prev: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  const s = await requerirAdmin();
  const id = String(form.get("id") ?? "");
  const nombre = String(form.get("nombre") ?? "").trim();
  const nombreCorto = String(form.get("nombre_corto") ?? "").trim() || nombre.slice(0, 16);
  const vigencia = entero(form.get("vigencia_dias"));
  const obligatorio = form.get("obligatorio") === "on";
  if (!nombre) return { error: "El nombre es obligatorio." };
  if (Number.isNaN(vigencia)) return { error: "La vigencia debe ser un número de días mayor a 0." };

  await withTenant(s.empresaId, async (q) => {
    if (id) {
      await q.query(
        "update tipos_documento set nombre = $2, nombre_corto = $3, vigencia_dias = $4, obligatorio = $5 where id = $1",
        [id, nombre, nombreCorto, vigencia, obligatorio],
      );
    } else {
      const codigo = nombre
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "_")
        .replace(/^_|_$/g, "")
        .slice(0, 40);
      await q.query(
        `insert into tipos_documento (empresa_id, codigo, nombre, nombre_corto, vigencia_dias, obligatorio, orden)
         values ($1, $2, $3, $4, $5, $6, (select coalesce(max(orden), 0) + 1 from tipos_documento))
         on conflict (empresa_id, codigo) do nothing`,
        [s.empresaId, codigo, nombre, nombreCorto, vigencia, obligatorio],
      );
    }
  });
  revalidatePath("/", "layout");
  return { ok: true, mensaje: id ? "Tipo actualizado." : "Tipo agregado." };
}

/** Sin correo real en v1: el admin crea el usuario y comparte la contraseña temporal. */
export async function invitarUsuario(_prev: ResultadoInvitacion, form: FormData): Promise<ResultadoInvitacion> {
  const s = await requerirAdmin();
  const nombre = String(form.get("nombre") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const rol = String(form.get("rol") ?? "analista");
  if (!nombre || !/^\S+@\S+\.\S+$/.test(email)) return { error: "Nombre y email válidos son obligatorios." };
  if (rol !== "admin" && rol !== "analista") return { error: "Rol inválido." };

  const password = randomBytes(6).toString("base64url");
  const hash = await hashPassword(password);
  try {
    await withTenant(s.empresaId, (q) =>
      q.query(
        "insert into usuarios (empresa_id, nombre, email, password_hash, rol) values ($1, $2, $3, $4, $5)",
        [s.empresaId, nombre, email, hash, rol],
      ),
    );
  } catch (e) {
    if ((e as { code?: string }).code === "23505") return { error: "Ese email ya tiene una cuenta." };
    throw e;
  }
  revalidatePath("/configuracion");
  return { ok: true, mensaje: `Usuario creado.`, credenciales: { email, password } };
}
