/**
 * Datos de demo: dos empresas ficticias (agroexportadora y minera) con
 * operarios y documentos en todos los estados posibles. Las fechas se generan
 * relativas a HOY, así el tablero siempre luce realista.
 *
 *   npm run seed              → borra y recrea las empresas demo
 *   npm run seed -- --if-empty → solo si la base no tiene ninguna empresa
 *
 * También regenera la plantilla de la demo abierta (ver scripts/demo.ts).
 * No toca otras empresas (tampoco las de participantes, ver participantes.ts).
 */
import { hashPassword } from "../src/lib/hash";
import { closeDb, withOwner } from "../src/lib/db";
import { crearPlantilla } from "../src/lib/demo";
import { formatearFecha } from "../src/lib/estado";
import {
  EMPRESAS,
  HOY,
  PASSWORD_DEMO,
  borrarEmpresasDe,
  crearEmpresa,
  generarMuestras,
  reiniciarAleatorio,
  type NuevoIngreso,
} from "../src/lib/demo/datos";

async function main() {
  const soloSiVacia = process.argv.includes("--if-empty");
  if (soloSiVacia) {
    const [{ n, plantillas }] = await withOwner((q) =>
      q.query<{ n: number; plantillas: number }>(
        "select count(*)::int as n, count(*) filter (where plantilla)::int as plantillas from empresas",
      ),
    );
    if (n > 0) {
      // Bases creadas antes de la demo abierta: solo falta su plantilla.
      if (!plantillas) await crearPlantilla();
      await closeDb();
      return;
    }
  }
  console.log(`Cargando datos demo (hoy = ${formatearFecha(HOY)})…`);
  const passwordHash = await hashPassword(PASSWORD_DEMO);
  const nuevos = await withOwner(async (q) => {
    await borrarEmpresasDe(q, EMPRESAS.flatMap((e) => e.usuarios.map((u) => u.email)));
    reiniciarAleatorio();
    const porEmpresa: NuevoIngreso[][] = [];
    for (const e of EMPRESAS) {
      porEmpresa.push((await crearEmpresa(q, e, e.usuarios.map((u) => ({ ...u, passwordHash })))).nuevos);
    }
    return porEmpresa[0];
  });
  await generarMuestras(nuevos);
  await crearPlantilla(); // la que se copia a cada visitante de /demo
  await closeDb();
  console.log("\nListo. Ingresa con:");
  for (const e of EMPRESAS) for (const u of e.usuarios) console.log(`  ${u.email.padEnd(26)} ${PASSWORD_DEMO}   (${u.rol}, ${e.sector})`);
  console.log("Archivos de prueba en ./samples (PDFs para subir y un CSV para importar).");
}

main().catch(async (err) => {
  console.error(err);
  await closeDb().catch(() => {});
  process.exit(1);
});
