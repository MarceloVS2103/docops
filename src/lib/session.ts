import { SignJWT, jwtVerify } from "jose";

/**
 * Token de sesión firmado (HS256) guardado en una cookie httpOnly.
 * Sin dependencias de Node: lo usa también el middleware (edge runtime).
 */

export const SESSION_COOKIE = "docops_session";
const DURACION_SEGUNDOS = 60 * 60 * 12;

export interface Sesion {
  usuarioId: string;
  empresaId: string;
  nombre: string;
  email: string;
  rol: "admin" | "analista";
}

const DEV_SECRET = "dev-only-secret-cambia-esto-en-produccion-0123456789";

function secreto(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s) {
    if (process.env.NODE_ENV === "production" && process.env.DOCOPS_ALLOW_DEV_SECRET !== "1") {
      throw new Error("Falta SESSION_SECRET en producción");
    }
    return new TextEncoder().encode(DEV_SECRET);
  }
  return new TextEncoder().encode(s);
}

export async function firmarSesion(sesion: Sesion, duracionSegundos = DURACION_SEGUNDOS): Promise<string> {
  return new SignJWT({ ...sesion })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${duracionSegundos}s`)
    .sign(secreto());
}

export async function verificarSesion(token: string | undefined): Promise<Sesion | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secreto(), { algorithms: ["HS256"] });
    const { usuarioId, empresaId, nombre, email, rol } = payload as unknown as Sesion;
    if (!usuarioId || !empresaId) return null;
    return { usuarioId, empresaId, nombre, email, rol };
  } catch {
    return null;
  }
}

export const SESSION_MAX_AGE = DURACION_SEGUNDOS;
