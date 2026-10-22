/**
 * Estado de un documento. Se calcula al leer (no se guarda) porque depende de
 * la fecha de hoy: un documento "vigente" pasa solo a "por vencer" y "vencido".
 */
export type Estado = "vigente" | "por_vencer" | "vencido" | "pendiente" | "revision_manual";

export const ESTADOS: Estado[] = ["vencido", "por_vencer", "revision_manual", "pendiente", "vigente"];

export const ESTADO_LABEL: Record<Estado, string> = {
  vigente: "Vigente",
  por_vencer: "Por vencer",
  vencido: "Vencido",
  pendiente: "Pendiente",
  revision_manual: "Revisión manual",
};

/** Prioridad para ordenar alertas: lo más urgente primero. */
export const ESTADO_PRIORIDAD: Record<Estado, number> = {
  vencido: 0,
  por_vencer: 1,
  revision_manual: 2,
  pendiente: 3,
  vigente: 4,
};

const TZ = "America/Lima";

/** Fecha de hoy en Lima como 'YYYY-MM-DD'. */
export function hoy(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function diasEntre(desde: string, hasta: string): number {
  const a = Date.parse(`${desde}T00:00:00Z`);
  const b = Date.parse(`${hasta}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export interface DocumentoParaEstado {
  revision_manual: boolean;
  fecha_vencimiento: string | null;
}

export interface EstadoCalculado {
  estado: Estado;
  /** Días hasta el vencimiento (negativo si ya venció). null si no aplica. */
  diasRestantes: number | null;
}

export function calcularEstado(
  doc: DocumentoParaEstado | null | undefined,
  diasAlerta: number,
  fechaHoy: string = hoy(),
): EstadoCalculado {
  if (!doc) return { estado: "pendiente", diasRestantes: null };
  if (doc.revision_manual) return { estado: "revision_manual", diasRestantes: null };
  // Sin fecha de vencimiento y sin revisión pendiente = documento que no vence.
  if (!doc.fecha_vencimiento) return { estado: "vigente", diasRestantes: null };
  const dias = diasEntre(fechaHoy, doc.fecha_vencimiento);
  if (dias < 0) return { estado: "vencido", diasRestantes: dias };
  if (dias <= diasAlerta) return { estado: "por_vencer", diasRestantes: dias };
  return { estado: "vigente", diasRestantes: dias };
}

export function formatearFecha(fecha: string | null | undefined): string {
  if (!fecha) return "—";
  const [y, m, d] = fecha.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function describirDias(diasRestantes: number | null): string {
  if (diasRestantes === null) return "";
  if (diasRestantes < 0) return `venció hace ${-diasRestantes} d`;
  if (diasRestantes === 0) return "vence hoy";
  return `${diasRestantes} d`;
}
