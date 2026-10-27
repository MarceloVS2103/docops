"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login } from "@/app/actions/auth";
import { AvisoAccion, SubmitButton } from "@/components/form";

export default function LoginPage() {
  const [estado, accion] = useActionState(login, {});
  return (
    <div className="card p-6">
      {/* Los invitados a las pruebas no tienen cuenta: la demo va primero y destacada. */}
      <div className="rounded-lg bg-marca-50 p-4 ring-1 ring-marca-100">
        <p className="text-sm font-semibold text-slate-900">¿Te invitamos a probar la plataforma?</p>
        <p className="mt-0.5 text-sm text-slate-600">No necesitas cuenta: entra directo a una empresa de ejemplo.</p>
        <Link href="/demo" className="btn-primario mt-3 w-full">
          Probar la demo sin registrarte →
        </Link>
      </div>
      <div className="my-5 flex items-center gap-3 text-xs text-slate-400">
        <span className="h-px flex-1 bg-slate-200" />o ingresa con tu cuenta
        <span className="h-px flex-1 bg-slate-200" />
      </div>
      <h1 className="sr-only">Ingresar</h1>
      <form action={accion} className="space-y-3">
        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input id="email" name="email" type="email" required autoComplete="email" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="password">
            Contraseña
          </label>
          <input id="password" name="password" type="password" required autoComplete="current-password" className="input" />
        </div>
        <AvisoAccion estado={estado} />
        <SubmitButton className="btn-secundario w-full" pendiente="Ingresando…">
          Ingresar
        </SubmitButton>
      </form>
      <p className="mt-4 text-center text-sm text-slate-500">
        ¿Tu empresa aún no tiene cuenta?{" "}
        <Link href="/registro" className="font-medium text-marca-600 hover:underline">
          Regístrala
        </Link>
      </p>
      {/* En producción cada participante usa sus propias credenciales. */}
      {process.env.NODE_ENV !== "production" && (
        <div className="mt-5 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500 ring-1 ring-slate-200">
          <span className="font-medium text-slate-600">Datos demo</span> (tras <code>npm run seed</code>):{" "}
          <code>rrhh@agro-demo.test</code> / <code>demo1234</code>
        </div>
      )}
    </div>
  );
}
