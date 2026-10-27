import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verificarSesion } from "@/lib/session";

const PUBLICAS = ["/login", "/registro", "/demo"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // Los crons de Vercel se autentican con CRON_SECRET dentro de la ruta.
  if (pathname.startsWith("/api/cron/")) return NextResponse.next();
  const sesion = await verificarSesion(req.cookies.get(SESSION_COOKIE)?.value);
  const esPublica = PUBLICAS.some((p) => pathname.startsWith(p));
  if (!sesion && !esPublica) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    // Sin sesión se llega a la demo abierta, que también enlaza al login.
    return NextResponse.redirect(new URL("/demo", req.url));
  }
  if (sesion && esPublica) return NextResponse.redirect(new URL("/", req.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico|plantilla-operarios.csv|.*\\.(?:png|svg|jpg|ico)$).*)"],
};
