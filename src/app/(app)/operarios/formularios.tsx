"use client";

import { useActionState } from "react";
import { actualizarOperario, crearOperario, importarCsv } from "@/app/actions/operarios";
import type { Operario } from "@/lib/data";
import { AvisoAccion, SubmitButton } from "@/components/form";

function CamposOperario({ o }: { o?: Operario }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="label" htmlFor="nombre_completo">
          Apellidos y nombres
        </label>
        <input id="nombre_completo" name="nombre_completo" required defaultValue={o?.nombre_completo} className="input" />
      </div>
      <div>
        <label className="label" htmlFor="dni">
          DNI / CE
        </label>
        <input
          id="dni"
          name="dni"
          required
          inputMode="numeric"
          pattern="[0-9A-Za-z]{8,12}"
          defaultValue={o?.dni}
          className="input"
        />
      </div>
      <div>
        <label className="label" htmlFor="puesto">
          Puesto
        </label>
        <input id="puesto" name="puesto" defaultValue={o?.puesto ?? ""} className="input" placeholder="Cosechador, operador…" />
      </div>
      <div>
        <label className="label" htmlFor="fecha_ingreso">
          Fecha de ingreso
        </label>
        <input id="fecha_ingreso" name="fecha_ingreso" type="date" defaultValue={o?.fecha_ingreso ?? ""} className="input" />
      </div>
      <div>
        <label className="label" htmlFor="campana">
          Campaña (opcional)
        </label>
        <input id="campana" name="campana" defaultValue={o?.campana ?? ""} className="input" placeholder="Arándano 2026-27" />
      </div>
    </div>
  );
}

export function NuevoOperarioForm() {
  const [estado, accion] = useActionState(crearOperario, {});
  return (
    <form action={accion} className="mt-3 space-y-3">
      <CamposOperario />
      <AvisoAccion estado={estado} />
      <SubmitButton pendiente="Guardando…">Agregar operario</SubmitButton>
    </form>
  );
}

export function EditarOperarioForm({ operario }: { operario: Operario }) {
  const [estado, accion] = useActionState(actualizarOperario, {});
  return (
    <form action={accion} className="space-y-3">
      <input type="hidden" name="id" value={operario.id} />
      <CamposOperario o={operario} />
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" name="activo" defaultChecked={operario.activo} />
        Activo (aparece en el tablero)
      </label>
      <AvisoAccion estado={estado} />
      <SubmitButton pendiente="Guardando…">Guardar cambios</SubmitButton>
    </form>
  );
}

export function ImportarCsvForm() {
  const [estado, accion] = useActionState(importarCsv, {});
  return (
    <form action={accion} className="mt-3 space-y-3">
      <input
        name="archivo"
        type="file"
        accept=".csv,text/csv"
        required
        className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
      />
      <AvisoAccion estado={estado} />
      {estado.errores && estado.errores.length > 0 && (
        <ul className="max-h-40 overflow-auto rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
          {estado.errores.map((e) => (
            <li key={e.fila}>
              Fila {e.fila}: {e.error}
            </li>
          ))}
        </ul>
      )}
      <SubmitButton pendiente="Importando…">Importar CSV</SubmitButton>
    </form>
  );
}
