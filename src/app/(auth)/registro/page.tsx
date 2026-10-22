"use client";

import Link from "next/link";
import { useActionState } from "react";
import { registrarEmpresa } from "@/app/actions/auth";
import { AvisoAccion, SubmitButton } from "@/components/form";

export default function RegistroPage() {
  const [estado, accion] = useActionState(registrarEmpresa, {});
  return (
    <div className="card p-6">
      <h1 className="text-base font-semibold">Registrar empresa</h1>
      <p className="mt-1 text-sm text-slate-500">Crea la cuenta de tu empresa y tu usuario administrador de RRHH.</p>
      <form action={accion} className="mt-4 space-y-3">
        <fieldset className="space-y-3">
          <legend className="mb-2 text-xs font-semibold tracking-wide text-slate-400 uppercase">Empresa</legend>
          <div>
            <label className="label" htmlFor="empresa">
              Razón social o nombre comercial
            </label>
            <input id="empresa" name="empresa" required className="input" />
          </div>
          <div>
            <span className="label">Sector</span>
            <div className="grid grid-cols-2 gap-2">
              {[
                ["agroexportadora", "Agroexportadora"],
                ["minera", "Minera"],
              ].map(([v, l]) => (
                <label
                  key={v}
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm has-checked:border-marca-600 has-checked:bg-marca-50"
                >
                  <input type="radio" name="sector" value={v} required defaultChecked={v === "agroexportadora"} />
                  {l}
                </label>
              ))}
            </div>
          </div>
        </fieldset>
        <fieldset className="space-y-3 pt-2">
          <legend className="mb-2 text-xs font-semibold tracking-wide text-slate-400 uppercase">Administrador</legend>
          <div>
            <label className="label" htmlFor="nombre">
              Tu nombre
            </label>
            <input id="nombre" name="nombre" required className="input" />
          </div>
          <div>
            <label className="label" htmlFor="email">
              Email
            </label>
            <input id="email" name="email" type="email" required autoComplete="email" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="password">
              Contraseña (mín. 8 caracteres)
            </label>
            <input
              id="password"
              name="password"
              type="password"
              minLength={8}
              required
              autoComplete="new-password"
              className="input"
            />
          </div>
        </fieldset>
        <AvisoAccion estado={estado} />
        <SubmitButton className="btn-primario w-full" pendiente="Creando cuenta…">
          Crear cuenta
        </SubmitButton>
      </form>
      <p className="mt-4 text-center text-sm text-slate-500">
        ¿Ya tienes cuenta?{" "}
        <Link href="/login" className="font-medium text-marca-600 hover:underline">
          Ingresa
        </Link>
      </p>
    </div>
  );
}
