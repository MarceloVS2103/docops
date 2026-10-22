"use client";

import { useActionState } from "react";
import { confirmarRevision, reprocesarDocumento, subirDocumento } from "@/app/actions/documentos";
import type { Documento } from "@/lib/data";
import { AvisoAccion, SubmitButton } from "@/components/form";

export function SubirDocumentoForm({
  operarioId,
  tipoId,
  reemplazo,
}: {
  operarioId: string;
  tipoId: string;
  reemplazo: boolean;
}) {
  const [estado, accion] = useActionState(subirDocumento, {});
  return (
    <form action={accion} className="space-y-2">
      <input type="hidden" name="operario_id" value={operarioId} />
      <input type="hidden" name="tipo_documento_id" value={tipoId} />
      <div className="flex flex-wrap items-center gap-2">
        <input
          name="archivo"
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          required
          aria-label="Archivo del documento"
          className="min-w-0 flex-1 text-xs text-slate-600 file:mr-2 file:rounded-md file:border-0 file:bg-white file:px-2.5 file:py-1 file:text-xs file:font-medium file:text-slate-700 file:ring-1 file:ring-slate-300 hover:file:bg-slate-100"
        />
        <SubmitButton className="btn-primario px-2.5 py-1 text-xs" pendiente="Leyendo con IA…">
          {reemplazo ? "Subir renovación" : "Subir y leer con IA"}
        </SubmitButton>
      </div>
      <AvisoAccion estado={estado} />
    </form>
  );
}

export function ReprocesarForm({ documentoId }: { documentoId: string }) {
  const [estado, accion] = useActionState(reprocesarDocumento, {});
  return (
    <form action={accion} className="space-y-2">
      <input type="hidden" name="documento_id" value={documentoId} />
      <SubmitButton className="btn-fantasma px-2 py-0.5 text-xs" pendiente="Leyendo con IA…">
        ↻ Volver a leer con IA
      </SubmitButton>
      <AvisoAccion estado={estado} />
    </form>
  );
}

export function RevisionForm({ doc }: { doc: Documento }) {
  const [estado, accion] = useActionState(confirmarRevision, {});
  const ia = (doc.datos_extraidos_ia ?? {}) as Record<string, unknown>;
  const sugerida = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
  return (
    <form action={accion} className="space-y-2">
      <input type="hidden" name="documento_id" value={doc.id} />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label" htmlFor={`em-${doc.id}`}>
            Emisión
          </label>
          <input
            id={`em-${doc.id}`}
            name="fecha_emision"
            type="date"
            defaultValue={doc.fecha_emision ?? sugerida(ia.fecha_emision)}
            className="input py-1 text-xs"
          />
        </div>
        <div>
          <label className="label" htmlFor={`ve-${doc.id}`}>
            Vencimiento
          </label>
          <input
            id={`ve-${doc.id}`}
            name="fecha_vencimiento"
            type="date"
            defaultValue={doc.fecha_vencimiento ?? sugerida(ia.fecha_vencimiento)}
            className="input py-1 text-xs"
          />
        </div>
      </div>
      <p className="text-xs text-slate-500">
        Si dejas el vencimiento vacío se calcula con la vigencia del tipo; sin vigencia, queda como &quot;no vence&quot;.
      </p>
      <SubmitButton className="btn-secundario px-2.5 py-1 text-xs" pendiente="Guardando…">
        Confirmar revisión
      </SubmitButton>
      <AvisoAccion estado={estado} />
    </form>
  );
}
