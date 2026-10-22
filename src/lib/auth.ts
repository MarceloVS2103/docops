import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { withOwner } from "@/lib/db";
import { hashPassword, verificarPassword } from "@/lib/hash";
import { SESSION_COOKIE, SESSION_MAX_AGE, firmarSesion, verificarSesion, type Sesion } from "@/lib/session";

export type { Sesion };

export { hashPassword };

export async function iniciarSesion(sesion: Sesion) {
  const token = await firmarSesion(sesion);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function cerrarSesion() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function obtenerSesion(): Promise<Sesion | null> {
  return verificarSesion((await cookies()).get(SESSION_COOKIE)?.value);
}

export async function requerirSesion(): Promise<Sesion> {
  const s = await obtenerSesion();
  if (!s) redirect("/login");
  // El token puede seguir siendo válido aunque el usuario o su empresa se hayan borrado.
  const existe = await withOwner((q) =>
    q.query("select 1 from usuarios where id = $1 and empresa_id = $2", [s.usuarioId, s.empresaId]),
  );
  if (!existe.length) redirect("/salir");
  return s;
}

export async function requerirAdmin(): Promise<Sesion> {
  const s = await requerirSesion();
  if (s.rol !== "admin") redirect("/");
  return s;
}

/** Busca al usuario por email sin RLS (aún no sabemos su empresa). */
export async function autenticar(email: string, password: string): Promise<Sesion | null> {
  const rows = await withOwner((q) =>
    q.query<{ id: string; empresa_id: string; nombre: string; email: string; rol: Sesion["rol"]; password_hash: string }>(
      "select id, empresa_id, nombre, email, rol, password_hash from usuarios where lower(email) = lower($1)",
      [email.trim()],
    ),
  );
  const u = rows[0];
  if (!u || !(await verificarPassword(password, u.password_hash))) return null;
  return { usuarioId: u.id, empresaId: u.empresa_id, nombre: u.nombre, email: u.email, rol: u.rol };
}
