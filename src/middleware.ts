import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verificarSesion } from "@/lib/session";

const PUBLICAS = ["/login", "/registro"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const sesion = await verificarSesion(req.cookies.get(SESSION_COOKIE)?.value);
  const esPublica = PUBLICAS.some((p) => pathname.startsWith(p));
  if (!sesion && !esPublica) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    return NextResponse.redirect(new URL("/login", req.url));
  }
  if (sesion && esPublica) return NextResponse.redirect(new URL("/", req.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico|plantilla-operarios.csv|.*\\.(?:png|svg|jpg|ico)$).*)"],
};
