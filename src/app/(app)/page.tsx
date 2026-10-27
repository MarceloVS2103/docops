import Link from "next/link";
import { requerirSesion } from "@/lib/auth";
import { obtenerTablero } from "@/lib/data";
import { ESTADO_LABEL, formatearFecha, hoy, type Estado } from "@/lib/estado";
import { ESTILO_ESTADO, EstadoBadge } from "@/components/estado";
import { TableroGrid, type FiltroTablero, type FilaGrid } from "./tablero-grid";

const FILTROS: FiltroTablero[] = ["todos", "no_aptos", "vencido", "por_vencer", "revision_manual", "pendiente", "aptos"];

export default async function TableroPage({ searchParams }: { searchParams: Promise<{ filtro?: string }> }) {
  const sesion = await requerirSesion();
  const t = await obtenerTablero(sesion.empresaId);
  const { filtro } = await searchParams;
  const filtroInicial = FILTROS.includes(filtro as FiltroTablero) ? (filtro as FiltroTablero) : "todos";
  const { resumen, empresa, tipos } = t;

  // Datos mínimos para el cliente (sin JSON de la IA ni rutas de archivos).
  const filas: FilaGrid[] = t.filas.map((f) => ({
    id: f.operario.id,
    nombre: f.operario.nombre_completo,
    dni: f.operario.dni,
    puesto: f.operario.puesto,
    campana: f.operario.campana,
    apto: f.apto,
    peorEstado: f.peorEstado,
    celdas: Object.fromEntries(
      tipos.map((tp) => {
        const c = f.celdas[tp.id];
        return [tp.id, { estado: c.estado, dias: c.diasRestantes, vence: c.documento?.fecha_vencimiento ?? null }];
      }),
    ),
  }));

  const pctAptos = resumen.operarios ? Math.round((resumen.aptos / resumen.operarios) * 100) : 0;
  const kpis: { filtro: FiltroTablero; titulo: string; valor: number; detalle: string; estado: Estado }[] = [
    { filtro: "vencido", titulo: "Vencidos", valor: resumen.conteo.vencido, detalle: "documentos", estado: "vencido" },
    {
      filtro: "por_vencer",
      titulo: "Por vencer",
      valor: resumen.conteo.por_vencer,
      detalle: `en ≤ ${empresa.dias_alerta} días`,
      estado: "por_vencer",
    },
    {
      filtro: "revision_manual",
      titulo: "En revisión",
      valor: resumen.conteo.revision_manual,
      detalle: "la IA pidió revisar",
      estado: "revision_manual",
    },
    { filtro: "pendiente", titulo: "Pendientes", valor: resumen.conteo.pendiente, detalle: "sin subir", estado: "pendiente" },
  ];

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Tablero de cumplimiento</h1>
          <p className="text-sm text-slate-500">
            {resumen.operarios} operarios activos · {tipos.length} tipos de documento · al {formatearFecha(hoy())}
          </p>
        </div>
        <Link href="/operarios" className="btn-secundario">
          + Operarios / CSV
        </Link>
      </header>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Link href="/?filtro=no_aptos" className="card col-span-2 p-4 hover:ring-2 hover:ring-marca-100 md:col-span-1">
              <div className="text-xs font-medium text-slate-500">Aptos para trabajar</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">
                {resumen.aptos}
                <span className="text-base font-normal text-slate-400"> / {resumen.operarios}</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-green-600" style={{ width: `${pctAptos}%` }} />
              </div>
              <div className="mt-1 text-xs text-slate-500">{pctAptos}% con documentación obligatoria al día</div>
            </Link>
            {kpis.map((k) => (
              <Link key={k.filtro} href={`/?filtro=${k.filtro}`} className="card p-4 hover:ring-2 hover:ring-marca-100">
                <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                  <span className={`size-2 rounded-full ${ESTILO_ESTADO[k.estado].punto}`} />
                  {k.titulo}
                </div>
                <div className="mt-1 text-2xl font-semibold tabular-nums">{k.valor}</div>
                <div className="text-xs text-slate-500">{k.detalle}</div>
              </Link>
            ))}
          </div>

          <section className="card p-4">
            <h2 className="text-sm font-semibold">Estado por tipo de documento</h2>
            <div className="mt-3 space-y-2.5">
              {tipos.map((tp) => {
                const cuenta: Record<Estado, number> = { vigente: 0, por_vencer: 0, vencido: 0, revision_manual: 0, pendiente: 0 };
                for (const f of filas) cuenta[f.celdas[tp.id].estado]++;
                const total = filas.length || 1;
                return (
                  <div key={tp.id} className="grid grid-cols-[110px_minmax(0,1fr)_60px] items-center gap-3 text-xs">
                    <span className="truncate font-medium text-slate-700" title={tp.nombre}>
                      {tp.nombre_corto}
                    </span>
                    <div className="flex h-3 overflow-hidden rounded-sm bg-slate-100">
                      {(["vigente", "por_vencer", "revision_manual", "vencido", "pendiente"] as Estado[]).map((e) =>
                        cuenta[e] ? (
                          <div
                            key={e}
                            className={ESTILO_ESTADO[e].punto}
                            style={{ width: `${(cuenta[e] / total) * 100}%` }}
                            title={`${ESTADO_LABEL[e]}: ${cuenta[e]}`}
                          />
                        ) : null,
                      )}
                    </div>
                    <span className="text-right text-slate-500 tabular-nums">
                      {Math.round(((cuenta.vigente + cuenta.por_vencer) / total) * 100)}% ok
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <section className="card flex flex-col">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold">Alertas de vencimiento</h2>
            <Link href="/alertas" className="text-xs font-medium text-marca-600 hover:underline">
              Ver todas ({t.alertas.length})
            </Link>
          </div>
          <ul className="max-h-[340px] flex-1 divide-y divide-slate-100 overflow-auto">
            {t.alertas.slice(0, 12).map((a) => (
              <li key={`${a.operario.id}-${a.tipo.id}`}>
                <Link href={`/operarios/${a.operario.id}`} className="flex items-center gap-3 px-4 py-2 hover:bg-slate-50">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-slate-800">{a.operario.nombre_completo}</div>
                    <div className="truncate text-xs text-slate-500">
                      {a.tipo.nombre_corto}
                      {a.fecha_vencimiento && a.estado !== "revision_manual" && <> · vence {formatearFecha(a.fecha_vencimiento)}</>}
                      {a.estado === "revision_manual" && a.motivo && <> · {a.motivo}</>}
                    </div>
                  </div>
                  <EstadoBadge estado={a.estado} diasRestantes={a.diasRestantes} compacto />
                </Link>
              </li>
            ))}
            {t.alertas.length === 0 && (
              <li className="px-4 py-8 text-center text-sm text-slate-500">Sin alertas: todo está al día.</li>
            )}
          </ul>
        </section>
      </div>

      <TableroGrid
        key={filtroInicial}
        tipos={tipos.map((tp) => ({ id: tp.id, nombre: tp.nombre, nombre_corto: tp.nombre_corto, obligatorio: tp.obligatorio }))}
        filas={filas}
        campanas={t.campanas}
        filtroInicial={filtroInicial}
      />
    </div>
  );
}
