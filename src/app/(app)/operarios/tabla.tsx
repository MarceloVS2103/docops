"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Operario } from "@/lib/data";
import { formatearFecha } from "@/lib/estado";

export function OperariosTabla({ operarios }: { operarios: Operario[] }) {
  const [texto, setTexto] = useState("");
  const [inactivos, setInactivos] = useState(false);
  const filtrados = useMemo(() => {
    const t = texto.trim().toUpperCase();
    return operarios.filter(
      (o) => (inactivos || o.activo) && (!t || o.nombre_completo.includes(t) || o.dni.includes(t)),
    );
  }, [operarios, texto, inactivos]);

  return (
    <section className="card">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3">
        <input
          type="search"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Buscar por nombre o DNI"
          className="input max-w-xs"
        />
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={inactivos} onChange={(e) => setInactivos(e.target.checked)} />
          Mostrar inactivos
        </label>
        <span className="ml-auto text-xs text-slate-500">{filtrados.length} operarios</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Operario</th>
              <th className="px-4 py-2 font-medium">DNI</th>
              <th className="px-4 py-2 font-medium">Puesto</th>
              <th className="px-4 py-2 font-medium">Ingreso</th>
              <th className="px-4 py-2 font-medium">Campaña</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtrados.map((o) => (
              <tr key={o.id} className={`hover:bg-slate-50 ${o.activo ? "" : "text-slate-400"}`}>
                <td className="px-4 py-2">
                  <Link href={`/operarios/${o.id}`} className="font-medium text-slate-900 hover:text-marca-600 hover:underline">
                    {o.nombre_completo}
                  </Link>
                  {!o.activo && <span className="ml-2 text-xs">(inactivo)</span>}
                </td>
                <td className="px-4 py-2 tabular-nums">{o.dni}</td>
                <td className="px-4 py-2">{o.puesto ?? "—"}</td>
                <td className="px-4 py-2 tabular-nums">{formatearFecha(o.fecha_ingreso)}</td>
                <td className="px-4 py-2">{o.campana ?? "—"}</td>
              </tr>
            ))}
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  {operarios.length === 0 ? "Aún no hay operarios. Agrega uno o importa un CSV." : "Sin resultados."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
