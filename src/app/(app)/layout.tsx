import { logout } from "@/app/actions/auth";
import { requerirSesion } from "@/lib/auth";
import { redirect } from "next/navigation";
import { buscarEmpresa } from "@/lib/data";
import { Nav } from "@/components/nav";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const sesion = await requerirSesion();
  const empresa = await buscarEmpresa(sesion.empresaId);
  // Sesión de una empresa que ya no existe (p. ej. tras re-ejecutar el seed).
  if (!empresa) redirect("/salir");

  return (
    <div className="min-h-screen lg:flex">
      <aside className="border-b border-slate-200 bg-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-56 lg:shrink-0 lg:flex-col lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between gap-3 px-4 py-3 lg:block lg:py-4">
          <div className="flex items-center gap-2 font-semibold text-slate-900">
            <span className="grid size-7 place-items-center rounded-md bg-marca-600 text-xs font-bold text-white">D</span>
            DocOps
          </div>
          <div className="truncate text-xs text-slate-500 lg:mt-3" title={empresa.nombre}>
            <div className="truncate font-medium text-slate-700">{empresa.nombre}</div>
            <div className="capitalize">{empresa.sector}</div>
          </div>
        </div>
        <Nav esAdmin={sesion.rol === "admin"} />
        <div className="hidden border-t border-slate-200 px-4 py-3 text-xs lg:mt-auto lg:block">
          <div className="truncate font-medium text-slate-700">{sesion.nombre}</div>
          <div className="truncate text-slate-500">
            {sesion.email} · {sesion.rol === "admin" ? "Admin RRHH" : "Analista RRHH"}
          </div>
          <form action={logout} className="mt-2">
            <button className="text-slate-500 hover:text-slate-800 hover:underline">Cerrar sesión</button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-5 lg:px-8 lg:py-6">{children}</main>
    </div>
  );
}
