import Link from "next/link";
import { notFound } from "next/navigation";
import { requerirSesion } from "@/lib/auth";
import { obtenerOperario, type Documento, type TipoDocumento } from "@/lib/data";
import { formatearFecha, type Estado } from "@/lib/estado";
import { EstadoBadge } from "@/components/estado";
import { EditarOperarioForm } from "../formularios";
import { ReprocesarForm, RevisionForm, SubirDocumentoForm } from "./documento-forms";

// Las server actions de esta página llaman a la IA: normalmente unos segundos,
// pero con reintentos y modelo de respaldo el peor caso pasa de 60 s.
export const maxDuration = 120;

const ORIGEN: Record<string, string> = {
  documento: "impresa en el documento",
  calculada: "calculada (emisión + vigencia)",
  manual: "ingresada por RRHH",
};

export default async function OperarioPage({ params }: { params: Promise<{ id: string }> }) {
  const sesion = await requerirSesion();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await obtenerOperario(sesion.empresaId, id);
  if (!data) notFound();
  const { fila, tipos, historial } = data;
  const o = fila.operario;

  return (
    <div className="space-y-5">
      <div className="text-sm">
        <Link href="/operarios" className="text-slate-500 hover:text-slate-800">
          ← Operarios
        </Link>
      </div>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{o.nombre_completo}</h1>
          <p className="text-sm text-slate-500">
            DNI {o.dni} · {o.puesto ?? "Sin puesto"} · Ingreso {formatearFecha(o.fecha_ingreso)}
            {o.campana && <> · {o.campana}</>}
            {!o.activo && <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-xs">Inactivo</span>}
          </p>
        </div>
        <div
          className={`rounded-lg px-3 py-2 text-sm font-medium ring-1 ${
            fila.apto ? "bg-green-100 text-green-800 ring-green-300" : "bg-red-100 text-red-800 ring-red-300"
          }`}
        >
          {fila.apto ? "✓ Apto: documentación obligatoria al día" : "✕ No apto: falta o venció documentación obligatoria"}
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {tipos.map((t) => (
          <TarjetaDocumento
            key={t.id}
            operarioId={o.id}
            tipo={t}
            estado={fila.celdas[t.id].estado}
            diasRestantes={fila.celdas[t.id].diasRestantes}
            doc={fila.celdas[t.id].documento}
          />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="card">
          <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-semibold">Historial de cargas</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Fecha</th>
                  <th className="px-4 py-2 font-medium">Tipo</th>
                  <th className="px-4 py-2 font-medium">Vence</th>
                  <th className="px-4 py-2 font-medium">Cargado por</th>
                  <th className="px-4 py-2 font-medium">Archivo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {historial.map((d) => (
                  <tr key={d.id}>
                    <td className="px-4 py-2 tabular-nums">{formatearFecha(d.fecha_carga)}</td>
                    <td className="px-4 py-2">{d.tipo_nombre}</td>
                    <td className="px-4 py-2 tabular-nums">{formatearFecha(d.fecha_vencimiento)}</td>
                    <td className="px-4 py-2">{d.cargado_por_nombre ?? "—"}</td>
                    <td className="max-w-40 truncate px-4 py-2">
                      <a href={`/api/documentos/${d.id}/archivo`} target="_blank" className="text-marca-600 hover:underline">
                        {d.archivo_nombre}
                      </a>
                    </td>
                  </tr>
                ))}
                {historial.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                      Aún no se ha subido ningún documento.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
        <section className="card p-4">
          <h2 className="mb-3 text-sm font-semibold">Datos del operario</h2>
          <EditarOperarioForm operario={o} />
        </section>
      </div>
    </div>
  );
}

function TarjetaDocumento({
  operarioId,
  tipo,
  estado,
  diasRestantes,
  doc,
}: {
  operarioId: string;
  tipo: TipoDocumento;
  estado: Estado;
  diasRestantes: number | null;
  doc: Documento | null;
}) {
  const ia = (doc?.datos_extraidos_ia ?? null) as Record<string, string | boolean | null> | null;
  // Cambia cuando el documento cambia: remonta los formularios y limpia mensajes viejos.
  const version = doc ? `${doc.id}-${doc.revision_manual}-${doc.fecha_emision}-${doc.fecha_vencimiento}` : "vacio";
  return (
    <section className="card flex flex-col">
      <div className="flex items-start justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold">{tipo.nombre}</h3>
          <p className="text-xs text-slate-500">
            {tipo.obligatorio ? "Obligatorio" : "Opcional"}
            {tipo.vigencia_dias ? ` · vigencia ${tipo.vigencia_dias} días desde emisión` : ""}
          </p>
        </div>
        <EstadoBadge estado={estado} diasRestantes={diasRestantes} />
      </div>

      <div className="flex-1 space-y-3 px-4 py-3 text-sm">
        {doc ? (
          <>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
              <dt className="text-slate-500">Emisión</dt>
              <dd className="tabular-nums">{formatearFecha(doc.fecha_emision)}</dd>
              <dt className="text-slate-500">Vencimiento</dt>
              <dd className="tabular-nums">
                {doc.fecha_vencimiento ? formatearFecha(doc.fecha_vencimiento) : doc.revision_manual ? "—" : "No vence"}
                {doc.origen_vencimiento && (
                  <span className="block text-xs text-slate-400">{ORIGEN[doc.origen_vencimiento]}</span>
                )}
              </dd>
              <dt className="text-slate-500">Archivo</dt>
              <dd className="truncate">
                <a href={`/api/documentos/${doc.id}/archivo`} target="_blank" className="text-marca-600 hover:underline">
                  {doc.archivo_nombre}
                </a>
              </dd>
            </dl>

            {doc.revision_manual && doc.motivo_revision && (
              <p className="rounded-md bg-violet-50 px-3 py-2 text-xs text-violet-900 ring-1 ring-violet-200">
                <strong>Requiere revisión:</strong> {doc.motivo_revision}
              </p>
            )}

            {ia && !ia.error && (
              <details className="rounded-md bg-slate-50 px-3 py-2 text-xs ring-1 ring-slate-200">
                <summary className="cursor-pointer font-medium text-slate-600">
                  Lectura de la IA {ia.confianza ? `· confianza ${ia.confianza}` : ""}
                  {ia.fuente === "demo" ? " · dato demo" : ""}
                </summary>
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-slate-700">
                  {(
                    [
                      ["Titular", ia.nombre_persona],
                      ["N.º documento", ia.numero_documento_identidad],
                      ["Tipo detectado", ia.tipo_documento],
                      ["Emisor", ia.entidad_emisora],
                      ["Resultado", ia.resultado],
                      ["Observaciones", ia.observaciones],
                    ] as const
                  )
                    .filter(([, v]) => v)
                    .map(([k, v]) => (
                      <div key={k} className="contents">
                        <dt className="text-slate-500">{k}</dt>
                        <dd>{String(v)}</dd>
                      </div>
                    ))}
                </dl>
              </details>
            )}

            {doc.revision_manual ? (
              <RevisionForm key={version} doc={doc} />
            ) : (
              <details className="text-xs">
                <summary className="cursor-pointer text-slate-500 hover:text-slate-800">Corregir fechas manualmente</summary>
                <div className="mt-2">
                  <RevisionForm key={version} doc={doc} />
                </div>
              </details>
            )}
          </>
        ) : (
          <p className="text-slate-500">No se ha subido este documento.</p>
        )}
      </div>

      <div className="space-y-2 border-t border-slate-100 bg-slate-50/60 px-4 py-3">
        <SubirDocumentoForm key={version} operarioId={operarioId} tipoId={tipo.id} reemplazo={Boolean(doc)} />
        {doc && <ReprocesarForm key={version} documentoId={doc.id} />}
      </div>
    </section>
  );
}
