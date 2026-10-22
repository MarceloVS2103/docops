"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ESTILO_ESTADO, LeyendaEstados, textoCelda } from "@/components/estado";
import { describirDias, ESTADO_LABEL, ESTADO_PRIORIDAD, formatearFecha, type Estado } from "@/lib/estado";

export type FiltroTablero = "todos" | "no_aptos" | "aptos" | Exclude<Estado, "vigente">;

export interface FilaGrid {
  id: string;
  nombre: string;
  dni: string;
  puesto: string | null;
  campana: string | null;
  apto: boolean;
  peorEstado: Estado;
  celdas: Record<string, { estado: Estado; dias: number | null; vence: string | null }>;
}

interface TipoGrid {
  id: string;
  nombre: string;
  nombre_corto: string;
  obligatorio: boolean;
}

const CHIPS: { valor: FiltroTablero; label: string }[] = [
  { valor: "todos", label: "Todos" },
  { valor: "no_aptos", label: "No aptos" },
  { valor: "vencido", label: "Vencidos" },
  { valor: "por_vencer", label: "Por vencer" },
  { valor: "revision_manual", label: "En revisión" },
  { valor: "pendiente", label: "Pendientes" },
  { valor: "aptos", label: "Aptos" },
];

function coincide(f: FilaGrid, filtro: FiltroTablero): boolean {
  if (filtro === "todos") return true;
  if (filtro === "aptos") return f.apto;
  if (filtro === "no_aptos") return !f.apto;
  return Object.values(f.celdas).some((c) => c.estado === filtro);
}

export function TableroGrid({
  tipos,
  filas,
  campanas,
  filtroInicial,
}: {
  tipos: TipoGrid[];
  filas: FilaGrid[];
  campanas: string[];
  filtroInicial: FiltroTablero;
}) {
  const [filtro, setFiltro] = useState<FiltroTablero>(filtroInicial);
  const [texto, setTexto] = useState("");
  const [campana, setCampana] = useState("");

  const conteos = useMemo(
    () => Object.fromEntries(CHIPS.map((c) => [c.valor, filas.filter((f) => coincide(f, c.valor)).length])),
    [filas],
  );

  const visibles = useMemo(() => {
    const t = texto
      .trim()
      .toUpperCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
    return filas
      .filter(
        (f) =>
          coincide(f, filtro) &&
          (!campana || f.campana === campana) &&
          (!t || f.nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").includes(t) || f.dni.includes(t)),
      )
      .sort((a, b) => ESTADO_PRIORIDAD[a.peorEstado] - ESTADO_PRIORIDAD[b.peorEstado] || a.nombre.localeCompare(b.nombre));
  }, [filas, filtro, texto, campana]);

  return (
    <section className="card">
      <div className="space-y-3 border-b border-slate-200 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-2 text-sm font-semibold">Operarios × documentos</h2>
          <input
            type="search"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Buscar por nombre o DNI"
            aria-label="Buscar operario por nombre o DNI"
            className="input w-56 py-1"
          />
          {campanas.length > 0 && (
            <select
              value={campana}
              onChange={(e) => setCampana(e.target.value)}
              aria-label="Filtrar por campaña"
              className="input w-auto py-1"
            >
              <option value="">Todas las campañas</option>
              {campanas.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          )}
          <div className="ml-auto">
            <LeyendaEstados />
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por estado">
          {CHIPS.map((c) => (
            <button
              key={c.valor}
              type="button"
              onClick={() => setFiltro(c.valor)}
              aria-pressed={filtro === c.valor}
              className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
                filtro === c.valor
                  ? "bg-slate-900 text-white ring-slate-900"
                  : "bg-white text-slate-600 ring-slate-300 hover:bg-slate-50"
              }`}
            >
              {c.label} <span className="tabular-nums opacity-70">{conteos[c.valor]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-[70vh] overflow-auto">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-20 bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="sticky left-0 z-30 border-b border-slate-200 bg-slate-50 px-4 py-2 text-left font-medium">
                Operario
              </th>
              {tipos.map((t) => (
                <th key={t.id} title={t.nombre} className="border-b border-slate-200 px-2 py-2 text-center font-medium whitespace-nowrap">
                  {t.nombre_corto}
                  {!t.obligatorio && <span className="font-normal text-slate-400"> (opc.)</span>}
                </th>
              ))}
              <th className="border-b border-slate-200 px-3 py-2 text-center font-medium">Apto</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((f) => (
              <tr key={f.id} className="group">
                <td className="sticky left-0 z-10 border-b border-slate-100 bg-white px-4 py-1.5 group-hover:bg-slate-50">
                  <Link href={`/operarios/${f.id}`} className="block max-w-[260px]">
                    <span className="block truncate font-medium text-slate-900 group-hover:text-marca-600">{f.nombre}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {f.dni}
                      {f.puesto && ` · ${f.puesto}`}
                    </span>
                  </Link>
                </td>
                {tipos.map((t) => {
                  const c = f.celdas[t.id];
                  const tooltip = [
                    t.nombre,
                    ESTADO_LABEL[c.estado],
                    c.vence ? `Vence ${formatearFecha(c.vence)}` : "",
                    c.dias != null ? describirDias(c.dias) : "",
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <td key={t.id} className="border-b border-slate-100 p-0.5">
                      <Link
                        href={`/operarios/${f.id}`}
                        title={tooltip}
                        aria-label={`${f.nombre}: ${tooltip}`}
                        className={`flex h-9 min-w-[76px] items-center justify-center gap-1 rounded text-xs tabular-nums ${ESTILO_ESTADO[c.estado].celda}`}
                      >
                        <span aria-hidden className="text-[10px]">
                          {ESTILO_ESTADO[c.estado].icono}
                        </span>
                        {textoCelda(c.estado, c.dias)}
                      </Link>
                    </td>
                  );
                })}
                <td className="border-b border-slate-100 px-3 text-center">
                  {f.apto ? (
                    <span className="text-xs font-semibold text-emerald-700">Sí</span>
                  ) : (
                    <span className="text-xs font-semibold text-red-700">No</span>
                  )}
                </td>
              </tr>
            ))}
            {visibles.length === 0 && (
              <tr>
                <td colSpan={tipos.length + 2} className="px-4 py-10 text-center text-slate-500">
                  {filas.length === 0 ? (
                    <>
                      Aún no hay operarios.{" "}
                      <Link href="/operarios" className="font-medium text-marca-600 hover:underline">
                        Cárgalos aquí
                      </Link>
                      .
                    </>
                  ) : (
                    "Ningún operario coincide con los filtros."
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="border-t border-slate-200 px-4 py-2 text-xs text-slate-500">
        Mostrando {visibles.length} de {filas.length} operarios · ordenados por urgencia
      </div>
    </section>
  );
}
