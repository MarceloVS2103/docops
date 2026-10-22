import { requerirSesion } from "@/lib/auth";
import { listarTipos, listarUsuarios, obtenerEmpresa } from "@/lib/data";
import { formatearFecha } from "@/lib/estado";
import { EmpresaForm, InvitarForm, TipoForm } from "./formularios";

export default async function ConfiguracionPage() {
  const sesion = await requerirSesion();
  const esAdmin = sesion.rol === "admin";
  const [empresa, tipos, usuarios] = await Promise.all([
    obtenerEmpresa(sesion.empresaId),
    listarTipos(sesion.empresaId),
    listarUsuarios(sesion.empresaId),
  ]);

  return (
    <div className="max-w-5xl space-y-5">
      <header>
        <h1 className="text-xl font-semibold">Configuración</h1>
        {!esAdmin && (
          <p className="text-sm text-slate-500">Solo un Admin RRHH puede modificar esta sección.</p>
        )}
      </header>

      <section className="card p-4">
        <h2 className="text-sm font-semibold">Empresa</h2>
        <EmpresaForm empresa={empresa} disabled={!esAdmin} />
      </section>

      <section className="card">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold">Tipos de documento</h2>
          <p className="text-xs text-slate-500">
            La vigencia (en días desde la emisión) se usa cuando el documento no trae fecha de vencimiento impresa. Si
            trae ambas, se usa la más temprana.
          </p>
        </div>
        <div className="divide-y divide-slate-100">
          {tipos.map((t) => (
            <TipoForm key={t.id} tipo={t} disabled={!esAdmin} />
          ))}
          {esAdmin && (
            <div className="bg-slate-50/60">
              <div className="px-4 pt-3 text-xs font-semibold text-slate-500">Agregar tipo</div>
              <TipoForm disabled={false} />
            </div>
          )}
        </div>
      </section>

      <section className="card">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold">Equipo de RRHH</h2>
        </div>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-slate-100">
            {usuarios.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-2 font-medium">{u.nombre}</td>
                <td className="px-4 py-2 text-slate-600">{u.email}</td>
                <td className="px-4 py-2">{u.rol === "admin" ? "Admin RRHH" : "Analista RRHH"}</td>
                <td className="px-4 py-2 text-slate-500 tabular-nums">desde {formatearFecha(u.creado_en)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {esAdmin && (
          <div className="border-t border-slate-200 p-4">
            <h3 className="text-xs font-semibold text-slate-500">Invitar usuario</h3>
            <InvitarForm />
          </div>
        )}
      </section>
    </div>
  );
}
