import { describirDias, ESTADO_LABEL, type Estado } from "@/lib/estado";

export const ESTILO_ESTADO: Record<Estado, { celda: string; badge: string; punto: string; icono: string }> = {
  vigente: {
    celda: "bg-emerald-50 text-emerald-800 hover:bg-emerald-100",
    badge: "bg-emerald-100 text-emerald-800 ring-emerald-200",
    punto: "bg-emerald-500",
    icono: "✓",
  },
  por_vencer: {
    celda: "bg-amber-50 text-amber-900 hover:bg-amber-100",
    badge: "bg-amber-100 text-amber-900 ring-amber-200",
    punto: "bg-amber-500",
    icono: "!",
  },
  vencido: {
    celda: "bg-red-100 text-red-800 font-semibold hover:bg-red-200",
    badge: "bg-red-100 text-red-800 ring-red-200",
    punto: "bg-red-500",
    icono: "✕",
  },
  pendiente: {
    celda: "bg-slate-50 text-slate-400 hover:bg-slate-100",
    badge: "bg-slate-100 text-slate-600 ring-slate-200",
    punto: "bg-slate-300",
    icono: "–",
  },
  revision_manual: {
    celda: "bg-violet-50 text-violet-800 hover:bg-violet-100",
    badge: "bg-violet-100 text-violet-800 ring-violet-200",
    punto: "bg-violet-500",
    icono: "?",
  },
};

export function EstadoBadge({
  estado,
  diasRestantes,
  compacto,
}: {
  estado: Estado;
  diasRestantes?: number | null;
  /** Versión corta para listas angostas: solo el plazo. */
  compacto?: boolean;
}) {
  const e = ESTILO_ESTADO[estado];
  if (compacto && diasRestantes != null && (estado === "vencido" || estado === "por_vencer")) {
    return (
      <span
        title={`${ESTADO_LABEL[estado]} · ${describirDias(diasRestantes)}`}
        className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap tabular-nums ring-1 ring-inset ${e.badge}`}
      >
        <span aria-hidden className="text-[10px] leading-none">
          {e.icono}
        </span>
        {diasRestantes < 0 ? `hace ${-diasRestantes} d` : diasRestantes === 0 ? "hoy" : `en ${diasRestantes} d`}
      </span>
    );
  }
  const dias = diasRestantes != null && estado !== "vigente" ? describirDias(diasRestantes) : "";
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset ${e.badge}`}
    >
      <span aria-hidden className="text-[10px] leading-none">
        {e.icono}
      </span>
      {ESTADO_LABEL[estado]}
      {dias && <span className="font-normal opacity-80">· {dias}</span>}
    </span>
  );
}

/** Texto corto para una celda del tablero. */
export function textoCelda(estado: Estado, diasRestantes: number | null): string {
  switch (estado) {
    case "vencido":
      return "Vencido";
    case "pendiente":
      return "Falta";
    case "revision_manual":
      return "Revisar";
    case "por_vencer":
      return diasRestantes === 0 ? "Hoy" : `${diasRestantes} d`;
    case "vigente":
      return diasRestantes == null ? "OK" : diasRestantes > 365 ? "+1 año" : `${diasRestantes} d`;
  }
}

export function LeyendaEstados() {
  const orden: Estado[] = ["vigente", "por_vencer", "vencido", "revision_manual", "pendiente"];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
      {orden.map((e) => (
        <span key={e} className="inline-flex items-center gap-1.5">
          <span className={`size-2.5 rounded-sm ${ESTILO_ESTADO[e].punto}`} />
          {ESTADO_LABEL[e]}
        </span>
      ))}
    </div>
  );
}
