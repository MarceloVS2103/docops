import Link from "next/link";
import { requerirSesion } from "@/lib/auth";
import { obtenerTablero, type Alerta } from "@/lib/data";
import { formatearFecha } from "@/lib/estado";
import { EstadoBadge } from "@/components/estado";

const GRUPOS: { estado: Alerta["estado"]; titulo: string; descripcion: string }[] = [
  { estado: "vencido", titulo: "Vencidos", descripcion: "El operario no debería estar trabajando con estos documentos." },
  { estado: "por_vencer", titulo: "Por vencer", descripcion: "Pide la renovación antes de la fecha de vencimiento." },
  {
    estado: "revision_manual",
    titulo: "En revisión manual",
    descripcion: "La IA no pudo validar el documento o encontró una inconsistencia.",
  },
];

export default async function AlertasPage() {
  const sesion = await requerirSesion();
  const t = await obtenerTablero(sesion.empresaId);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold">Alertas</h1>
        <p className="text-sm text-slate-500">
          {t.alertas.length} documentos requieren atención · umbral de &quot;por vencer&quot;: {t.empresa.dias_alerta} días
          (configurable)
        </p>
      </header>

      {GRUPOS.map((g) => {
        const items = t.alertas.filter((a) => a.estado === g.estado);
        return (
          <section key={g.estado} className="card">
            <div className="flex flex-wrap items-baseline gap-x-3 border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold">
                {g.titulo} <span className="font-normal text-slate-500 tabular-nums">({items.length})</span>
              </h2>
              <p className="text-xs text-slate-500">{g.descripcion}</p>
            </div>
            {items.length === 0 ? (
              <p className="px-4 py-5 text-sm text-slate-500">Nada por aquí.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs text-slate-500">
                    <tr>
                      <th className="px-4 py-2 font-medium">Operario</th>
                      <th className="px-4 py-2 font-medium">DNI</th>
                      <th className="px-4 py-2 font-medium">Puesto</th>
                      <th className="px-4 py-2 font-medium">Documento</th>
                      <th className="px-4 py-2 font-medium">{g.estado === "revision_manual" ? "Motivo" : "Vence"}</th>
                      <th className="px-4 py-2 font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((a) => (
                      <tr key={`${a.operario.id}-${a.tipo.id}`} className="hover:bg-slate-50">
                        <td className="px-4 py-2">
                          <Link href={`/operarios/${a.operario.id}`} className="font-medium hover:text-marca-600 hover:underline">
                            {a.operario.nombre_completo}
                          </Link>
                        </td>
                        <td className="px-4 py-2 tabular-nums">{a.operario.dni}</td>
                        <td className="px-4 py-2">{a.operario.puesto ?? "—"}</td>
                        <td className="px-4 py-2">{a.tipo.nombre}</td>
                        <td className="max-w-md px-4 py-2 text-slate-600">
                          {g.estado === "revision_manual" ? (
                            <span className="line-clamp-2 text-xs">{a.motivo ?? "—"}</span>
                          ) : (
                            <span className="tabular-nums">{formatearFecha(a.fecha_vencimiento)}</span>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <EstadoBadge estado={a.estado} diasRestantes={a.diasRestantes} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
      <p className="text-xs text-slate-500">
        Los documentos pendientes (nunca subidos) se ven en el{" "}
        <Link href="/?filtro=pendiente" className="text-marca-600 hover:underline">
          tablero
        </Link>
        . Avisos por correo/WhatsApp: previstos para una versión siguiente.
      </p>
    </div>
  );
}
