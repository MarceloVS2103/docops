"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/actions/auth";

const ITEMS = [
  { href: "/", label: "Tablero" },
  { href: "/alertas", label: "Alertas" },
  { href: "/operarios", label: "Operarios" },
  { href: "/configuracion", label: "Configuración" },
];

export function Nav({ esAdmin }: { esAdmin: boolean }) {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto px-2 pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
      {ITEMS.map((i) => {
        const activo = i.href === "/" ? path === "/" : path.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            className={`rounded-md px-3 py-1.5 text-sm whitespace-nowrap ${
              activo ? "bg-marca-50 font-medium text-marca-700" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {i.label}
            {i.href === "/configuracion" && !esAdmin && <span className="sr-only"> (solo lectura)</span>}
          </Link>
        );
      })}
      <form action={logout} className="lg:hidden">
        <button className="rounded-md px-3 py-1.5 text-sm whitespace-nowrap text-slate-500 hover:bg-slate-100">Salir</button>
      </form>
    </nav>
  );
}
