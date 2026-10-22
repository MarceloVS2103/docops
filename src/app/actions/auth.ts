"use server";

import { redirect } from "next/navigation";
import { autenticar, cerrarSesion, hashPassword, iniciarSesion } from "@/lib/auth";
import { crearCatalogoEmpresa } from "@/lib/catalogo";
import { withOwner } from "@/lib/db";
import type { EstadoAccion } from "./tipos";

export async function login(_prev: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  const sesion = await autenticar(email, password);
  if (!sesion) return { error: "Email o contraseña incorrectos." };
  await iniciarSesion(sesion);
  redirect("/");
}

export async function logout() {
  await cerrarSesion();
  redirect("/login");
}

export async function registrarEmpresa(_prev: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  const empresa = String(form.get("empresa") ?? "").trim();
  const sector = String(form.get("sector") ?? "");
  const nombre = String(form.get("nombre") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");

  if (!empresa || !nombre || !email) return { error: "Completa todos los campos." };
  if (sector !== "agroexportadora" && sector !== "minera") return { error: "Elige un sector." };
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: "Email inválido." };
  if (password.length < 8) return { error: "La contraseña debe tener al menos 8 caracteres." };

  const passwordHash = await hashPassword(password);
  const res = await withOwner(async (q) => {
    const existe = await q.query("select 1 from usuarios where lower(email) = $1", [email]);
    if (existe.length) return null;
    const [e] = await q.query<{ id: string }>(
      "insert into empresas (nombre, sector) values ($1, $2) returning id",
      [empresa, sector],
    );
    await crearCatalogoEmpresa(q, e.id);
    const [u] = await q.query<{ id: string }>(
      "insert into usuarios (empresa_id, nombre, email, password_hash, rol) values ($1, $2, $3, $4, 'admin') returning id",
      [e.id, nombre, email, passwordHash],
    );
    return { empresaId: e.id, usuarioId: u.id };
  });
  if (!res) return { error: "Ya existe una cuenta con ese email." };

  await iniciarSesion({ ...res, nombre, email, rol: "admin" });
  redirect("/operarios?bienvenida=1");
}
