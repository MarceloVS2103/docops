"use client";

import { useFormStatus } from "react-dom";
import type { EstadoAccion } from "@/app/actions/tipos";

export function SubmitButton({
  children,
  pendiente,
  className = "btn-primario",
}: {
  children: React.ReactNode;
  pendiente?: React.ReactNode;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending && <Spinner />}
      {pending && pendiente ? pendiente : children}
    </button>
  );
}

export function Spinner() {
  return (
    <svg className="size-3.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function AvisoAccion({ estado }: { estado: EstadoAccion }) {
  if (estado.error) {
    return (
      <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
        {estado.error}
      </p>
    );
  }
  if (estado.mensaje) {
    return (
      <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 ring-1 ring-emerald-200">
        {estado.mensaje}
      </p>
    );
  }
  return null;
}
