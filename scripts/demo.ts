/**
 * Demo abierta (cualquiera entra desde /demo sin cuenta).
 *
 *   npx tsx scripts/demo.ts plantilla  → regenera la empresa plantilla que se copia a cada visitante
 *   npx tsx scripts/demo.ts estado     → copias creadas, quién (nombre opcional) y qué hizo
 *   npx tsx scripts/demo.ts limpiar    → borra las copias de más de 14 días
 *
 * En producción el cron diario (/api/cron/demo) ya limpia y regenera la plantilla.
 */
import { closeDb, withOwner } from "../src/lib/db";
import { crearPlantilla, limpiarDemos } from "../src/lib/demo";

async function estado() {
  const filas = await withOwner((q) =>
    // Lo copiado de la plantilla conserva fuente "demo"; el resto lo hizo el visitante.
    q.query<{ nombre: string; desde: string; operarios: number; docs: number; ultima: string | null }>(
      `select u.nombre, to_char(e.demo_desde at time zone 'America/Lima', 'DD/MM HH24:MI') as desde,
              (select count(*)::int from operarios o
                where o.empresa_id = e.id and o.creado_en > e.demo_desde) as operarios,
              (select count(*)::int from documentos_operario d
                where d.empresa_id = e.id and coalesce(d.datos_extraidos_ia->>'fuente', '') <> 'demo') as docs,
              (select to_char(max(d.fecha_carga) at time zone 'America/Lima', 'DD/MM HH24:MI') from documentos_operario d
                where d.empresa_id = e.id and coalesce(d.datos_extraidos_ia->>'fuente', '') <> 'demo') as ultima
       from empresas e join usuarios u on u.empresa_id = e.id
       where e.demo_desde is not null order by e.demo_desde`,
    ),
  );
  console.log(`${filas.length} visitas a la demo\n`);
  console.log("entró        visitante                         operarios nuevos  documentos subidos  última subida");
  for (const f of filas) {
    console.log(
      `${f.desde}  ${f.nombre.slice(0, 32).padEnd(32)}${String(f.operarios).padStart(18)}${String(f.docs).padStart(20)}  ${f.ultima ?? "—"}`,
    );
  }
}

async function main() {
  const cmd = process.argv[2];
  console.log(`Demo abierta · base: ${process.env.DATABASE_URL ? "remota" : "local"}`);
  if (cmd === "plantilla") {
    const inicio = Date.now();
    await crearPlantilla();
    console.log(`Plantilla lista (${((Date.now() - inicio) / 1000).toFixed(0)} s).`);
  } else if (cmd === "limpiar") console.log(`${await limpiarDemos()} copias borradas.`);
  else if (cmd === "estado") await estado();
  else {
    console.log("Uso: plantilla | estado | limpiar");
    process.exitCode = 1;
  }
  await closeDb();
}

main().catch(async (err) => {
  console.error(err instanceof Error ? err.message : err);
  await closeDb().catch(() => {});
  process.exit(1);
});
