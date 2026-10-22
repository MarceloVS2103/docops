import { requerirSesion } from "@/lib/auth";
import { listarOperarios } from "@/lib/data";
import { ImportarCsvForm, NuevoOperarioForm } from "./formularios";
import { OperariosTabla } from "./tabla";

export default async function OperariosPage({ searchParams }: { searchParams: Promise<{ bienvenida?: string }> }) {
  const sesion = await requerirSesion();
  const operarios = await listarOperarios(sesion.empresaId);
  const { bienvenida } = await searchParams;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold">Operarios</h1>
        <p className="text-sm text-slate-500">
          {operarios.filter((o) => o.activo).length} activos · {operarios.length} en total
        </p>
      </header>

      {bienvenida && operarios.length === 0 && (
        <div className="rounded-lg bg-marca-50 px-4 py-3 text-sm text-marca-900 ring-1 ring-marca-100">
          <strong>Tu empresa está lista.</strong> Empieza cargando tus operarios (uno por uno o con un CSV) y luego
          sube sus documentos: la IA leerá cada uno y el tablero mostrará qué está vigente, por vencer o vencido.
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="card p-4">
          <h2 className="text-sm font-semibold">Nuevo operario</h2>
          <NuevoOperarioForm />
        </section>
        <section className="card p-4">
          <h2 className="text-sm font-semibold">Carga masiva por CSV</h2>
          <p className="mt-1 text-xs text-slate-500">
            Columnas: <code>nombre_completo, dni, puesto, fecha_ingreso, campana</code>. Si el DNI ya existe, se
            actualiza. Fechas en DD/MM/AAAA o AAAA-MM-DD.{" "}
            <a href="/plantilla-operarios.csv" download className="font-medium text-marca-600 hover:underline">
              Descargar plantilla
            </a>
          </p>
          <ImportarCsvForm />
        </section>
      </div>

      <OperariosTabla operarios={operarios} />
    </div>
  );
}
