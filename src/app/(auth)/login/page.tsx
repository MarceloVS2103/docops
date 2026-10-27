"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login } from "@/app/actions/auth";
import { AvisoAccion, SubmitButton } from "@/components/form";

export default function LoginPage() {
  const [estado, accion] = useActionState(login, {});
  return (
    <div className="card p-6">
      <h1 className="text-base font-semibold">Ingresar</h1>
      <form action={accion} className="mt-4 space-y-3">
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
        <SubmitButton className="btn-primario w-full" pendiente="Ingresando…">
          Ingresar
        </SubmitButton>
      </form>
      <p className="mt-4 text-center text-sm text-slate-500">
        ¿Tu empresa aún no tiene cuenta?{" "}
        <Link href="/registro" className="font-medium text-marca-600 hover:underline">
          Regístrala
        </Link>
      </p>
      <p className="mt-2 text-center text-sm text-slate-500">
        ¿Solo quieres conocerla?{" "}
        <Link href="/demo" className="font-medium text-marca-600 hover:underline">
          Prueba la demo sin registrarte
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
