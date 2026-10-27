"use client";

import Link from "next/link";
import { useActionState } from "react";
import { entrarDemo } from "@/app/actions/demo";
import { AvisoAccion, SubmitButton } from "@/components/form";

export default function DemoPage() {
  const [estado, accion] = useActionState(entrarDemo, {});
  return (
    <div className="card p-6">
      <h1 className="text-base font-semibold">Prueba la plataforma</h1>
      <p className="mt-1 text-sm text-slate-600">
        Entras sin registrarte a una agroexportadora de ejemplo con 48 operarios y sus documentos. Sube archivos,
        corrige datos y explora con libertad: cada visita recibe su propia copia y nadie más ve lo que haces.
      </p>
      <form action={accion} className="mt-4 space-y-3">
        <div>
          <label className="label" htmlFor="nombre">
            Tu nombre <span className="font-normal text-slate-400">(opcional)</span>
          </label>
          <input id="nombre" name="nombre" maxLength={80} autoComplete="name" className="input" />
          <p className="mt-1 text-xs text-slate-500">Nos ayuda a relacionar tu prueba con tus respuestas a la encuesta.</p>
        </div>
        <AvisoAccion estado={estado} />
        <SubmitButton className="btn-primario w-full" pendiente="Preparando tu empresa…">
          Entrar a la demo
        </SubmitButton>
      </form>
      <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
        Es un entorno de prueba: usa los documentos de ejemplo de la encuesta, no documentos reales de personas. Los
        datos de la demo se borran a los 14 días.
      </p>
      <p className="mt-4 text-center text-sm text-slate-500">
        ¿Tu empresa ya tiene cuenta?{" "}
        <Link href="/login" className="font-medium text-marca-600 hover:underline">
          Ingresar
        </Link>
      </p>
    </div>
  );
}
