"use client";

import { useActionState } from "react";
import { actualizarEmpresa, guardarTipo, invitarUsuario } from "@/app/actions/configuracion";
import type { Empresa, TipoDocumento } from "@/lib/data";
import { AvisoAccion, SubmitButton } from "@/components/form";

export function EmpresaForm({ empresa, disabled }: { empresa: Empresa; disabled: boolean }) {
  const [estado, accion] = useActionState(actualizarEmpresa, {});
  return (
    <form action={accion} className="mt-3 flex flex-wrap items-end gap-3">
      <fieldset disabled={disabled} className="contents">
        <div className="min-w-64 flex-1">
          <label className="label" htmlFor="nombre-empresa">
            Nombre
          </label>
          <input id="nombre-empresa" name="nombre" defaultValue={empresa.nombre} required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="sector">
            Sector
          </label>
          <input id="sector" value={empresa.sector} disabled className="input w-40 capitalize" />
        </div>
        <div>
          <label className="label" htmlFor="dias_alerta">
            Avisar &quot;por vencer&quot; con (días)
          </label>
          <input
            id="dias_alerta"
            name="dias_alerta"
            type="number"
            min={1}
            max={365}
            defaultValue={empresa.dias_alerta}
            className="input w-28"
          />
        </div>
        {!disabled && <SubmitButton pendiente="Guardando…">Guardar</SubmitButton>}
      </fieldset>
      <div className="w-full empty:hidden">
        <AvisoAccion estado={estado} />
      </div>
    </form>
  );
}

export function TipoForm({ tipo, disabled }: { tipo?: TipoDocumento; disabled: boolean }) {
  const [estado, accion] = useActionState(guardarTipo, {});
  const id = tipo?.id ?? "nuevo";
  return (
    <form action={accion} className="px-4 py-3">
      <fieldset disabled={disabled} className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_140px_120px_auto_auto]">
        {tipo && <input type="hidden" name="id" value={tipo.id} />}
        <div>
          <label className="label" htmlFor={`n-${id}`}>
            Nombre
          </label>
          <input id={`n-${id}`} name="nombre" defaultValue={tipo?.nombre} required className="input" />
        </div>
        <div>
          <label className="label" htmlFor={`c-${id}`}>
            Nombre corto
          </label>
          <input id={`c-${id}`} name="nombre_corto" defaultValue={tipo?.nombre_corto} maxLength={16} className="input" />
        </div>
        <div>
          <label className="label" htmlFor={`v-${id}`}>
            Vigencia (días)
          </label>
          <input
            id={`v-${id}`}
            name="vigencia_dias"
            type="number"
            min={1}
            defaultValue={tipo?.vigencia_dias ?? ""}
            placeholder="impresa"
            className="input"
          />
        </div>
        <label className="flex h-[34px] items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name="obligatorio" defaultChecked={tipo?.obligatorio ?? true} />
          Obligatorio
        </label>
        {!disabled && (
          <SubmitButton className="btn-secundario" pendiente="…">
            {tipo ? "Guardar" : "Agregar"}
          </SubmitButton>
        )}
      </fieldset>
      {tipo && <p className="mt-1 text-[11px] text-slate-400">Código: {tipo.codigo}</p>}
      <div className="mt-2 empty:hidden">
        <AvisoAccion estado={estado} />
      </div>
    </form>
  );
}

export function InvitarForm() {
  const [estado, accion] = useActionState(invitarUsuario, {});
  return (
    <form action={accion} className="mt-2 space-y-3">
      <div className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_160px_auto]">
        <div>
          <label className="label" htmlFor="inv-nombre">
            Nombre
          </label>
          <input id="inv-nombre" name="nombre" required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="inv-email">
            Email
          </label>
          <input id="inv-email" name="email" type="email" required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="inv-rol">
            Rol
          </label>
          <select id="inv-rol" name="rol" className="input">
            <option value="analista">Analista RRHH</option>
            <option value="admin">Admin RRHH</option>
          </select>
        </div>
        <SubmitButton pendiente="Creando…">Crear usuario</SubmitButton>
      </div>
      <AvisoAccion estado={estado} />
      {estado.credenciales && (
        <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
          Comparte estas credenciales con la persona (no se volverán a mostrar):{" "}
          <code className="font-semibold">{estado.credenciales.email}</code> /{" "}
          <code className="font-semibold">{estado.credenciales.password}</code>
        </div>
      )}
    </form>
  );
}
