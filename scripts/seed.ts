/**
 * Datos de demo: dos empresas ficticias (agroexportadora y minera) con
 * operarios y documentos en todos los estados posibles. Las fechas se generan
 * relativas a HOY, así el tablero siempre luce realista.
 *
 *   npm run seed              → borra y recrea las empresas demo
 *   npm run seed -- --if-empty → solo si la base no tiene ninguna empresa
 *
 * No toca empresas que no sean las de demo.
 */
import fs from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { hashPassword } from "../src/lib/hash";
import { crearCatalogoEmpresa } from "../src/lib/catalogo";
import { closeDb, withOwner, type Queryable } from "../src/lib/db";
import { formatearFecha, hoy, sumarDias } from "../src/lib/estado";
import { guardarArchivo } from "../src/lib/storage";

const PASSWORD_DEMO = "demo1234";
const HOY = hoy();

// PRNG determinista para que la demo sea reproducible.
let semilla = 20261022;
function rand() {
  semilla = (semilla * 1664525 + 1013904223) % 4294967296;
  return semilla / 4294967296;
}
const entre = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
const elegir = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];

const APELLIDOS = [
  "QUISPE", "MAMANI", "HUAMAN", "FLORES", "CHAVEZ", "RAMOS", "TORRES", "ROJAS", "VASQUEZ", "CASTILLO",
  "MENDOZA", "GUTIERREZ", "SANCHEZ", "CONDORI", "CCAHUANA", "PAREDES", "VILCHEZ", "SALAZAR", "YUPANQUI",
  "HUANCA", "ESPINOZA", "CRUZ", "DIAZ", "LOPEZ", "GARCIA", "TICONA", "APAZA", "INGA", "POMA", "CAJUSOL",
] as const;
const NOMBRES = [
  "JUAN CARLOS", "ROSA ELENA", "LUIS ALBERTO", "MARIA DEL PILAR", "JOSE LUIS", "CARMEN ROSA", "MIGUEL ANGEL",
  "ANA LUCIA", "PEDRO PABLO", "YESENIA", "WILMER", "MILAGROS", "ROSARIO", "EDWIN", "GLADYS", "FREDY",
  "SANDRA", "ELMER", "KATHERINE", "JHONATAN", "DELIA", "RICHARD", "NELIDA", "ALEX", "MARLENI",
] as const;

const EMISORES: Record<string, string> = {
  DNI: "Registro de identidad (entidad demo)",
  ANTECEDENTES_PENALES: "Registro judicial (entidad demo)",
  ANTECEDENTES_POLICIALES: "Registro policial (entidad demo)",
  EMO: "Centro médico ocupacional (entidad demo)",
  SCTR: "Aseguradora (entidad demo)",
};
const RESULTADOS: Record<string, string | null> = {
  DNI: null,
  ANTECEDENTES_PENALES: "NO REGISTRA ANTECEDENTES",
  ANTECEDENTES_POLICIALES: "NO REGISTRA ANTECEDENTES",
  EMO: "APTO",
  SCTR: "COBERTURA VIGENTE",
};

type Escenario = "vigente" | "por_vencer" | "vencido" | "pendiente" | "revision";

interface EmpresaDemo {
  nombre: string;
  sector: "agroexportadora" | "minera";
  usuarios: { nombre: string; email: string; rol: "admin" | "analista" }[];
  operarios: number;
  puestos: readonly string[];
  campanas: readonly string[];
  /** Pesos de escenarios: vigente, por vencer, vencido, pendiente, revisión. */
  pesos: [number, number, number, number, number];
}

const EMPRESAS: EmpresaDemo[] = [
  {
    nombre: "Agrícola Demo Valle Sur S.A.C.",
    sector: "agroexportadora",
    usuarios: [
      { nombre: "Lucía Paredes (demo)", email: "rrhh@agro-demo.test", rol: "admin" },
      { nombre: "Diego Salas (demo)", email: "analista@agro-demo.test", rol: "analista" },
    ],
    operarios: 48,
    puestos: ["Cosechador", "Seleccionadora", "Empacadora", "Supervisor de campo", "Tractorista", "Aplicador fitosanitario", "Control de calidad", "Operador de montacargas"],
    campanas: ["Arándano 2026-27", "Uva de mesa 2026-27", "Palta 2026"],
    pesos: [80, 10, 4, 3, 3],
  },
  {
    nombre: "Minera Demo Cerro Alto S.A.C.",
    sector: "minera",
    usuarios: [{ nombre: "Carlos Rojas (demo)", email: "rrhh@minera-demo.test", rol: "admin" }],
    operarios: 16,
    puestos: ["Operador de scoop", "Perforista", "Ayudante de mina", "Electricista", "Mecánico de equipo pesado", "Supervisor de seguridad"],
    campanas: ["Contrata U.M. Demo"],
    pesos: [82, 8, 4, 3, 3],
  },
];

function escenario(pesos: EmpresaDemo["pesos"]): Escenario {
  const total = pesos.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  const nombres: Escenario[] = ["vigente", "por_vencer", "vencido", "pendiente", "revision"];
  for (let i = 0; i < pesos.length; i++) {
    if ((r -= pesos[i]) < 0) return nombres[i];
  }
  return "vigente";
}

async function pdfDemo(campos: { titulo: string; filas: [string, string][] }): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 420]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  page.drawRectangle({ x: 0, y: 380, width: 595, height: 40, color: rgb(0.93, 0.95, 0.98) });
  page.drawText("DOCUMENTO DE DEMOSTRACIÓN - SIN VALIDEZ OFICIAL", { x: 40, y: 395, size: 10, font: bold, color: rgb(0.7, 0.1, 0.1) });
  page.drawText(campos.titulo.toUpperCase(), { x: 40, y: 340, size: 16, font: bold });
  let y = 300;
  for (const [k, v] of campos.filas) {
    page.drawText(`${k}:`, { x: 40, y, size: 11, font: bold });
    page.drawText(v, { x: 220, y, size: 11, font });
    y -= 24;
  }
  page.drawText("Generado por el seed de DocOps para pruebas.", { x: 40, y: 30, size: 8, font, color: rgb(0.5, 0.5, 0.5) });
  return Buffer.from(await pdf.save());
}

interface Tipo {
  id: string;
  codigo: string;
  nombre: string;
  vigencia_dias: number | null;
}

/** Fechas de emisión/vencimiento coherentes con el escenario y el tipo. */
function fechas(t: Tipo, esc: Exclude<Escenario, "pendiente" | "revision">) {
  const duracion = t.vigencia_dias ?? (t.codigo === "DNI" ? 8 * 365 : 365);
  const restante =
    esc === "vigente" ? entre(31, duracion - 1) : esc === "por_vencer" ? entre(0, 30) : -entre(1, 75);
  const vencimiento = sumarDias(HOY, restante);
  const emision = sumarDias(vencimiento, -duracion);
  // Con vigencia por antigüedad el vencimiento se calcula; si no, viene impreso.
  return { emision, vencimiento, impresa: t.vigencia_dias ? null : vencimiento };
}

async function documentoPdf(t: Tipo, nombre: string, dni: string, emision: string, impresa: string | null) {
  const filas: [string, string][] = [
    ["Titular", nombre],
    ["DNI", dni],
    ["Fecha de emisión", formatearFecha(emision)],
  ];
  if (impresa) filas.push([t.codigo === "DNI" ? "Fecha de caducidad" : "Vigencia hasta", formatearFecha(impresa)]);
  if (RESULTADOS[t.codigo]) filas.push(["Resultado", RESULTADOS[t.codigo]!]);
  filas.push(["Emitido por", EMISORES[t.codigo] ?? "Entidad demo"]);
  return pdfDemo({ titulo: t.nombre, filas });
}

async function borrarDemos(q: Queryable) {
  const emails = EMPRESAS.flatMap((e) => e.usuarios.map((u) => u.email));
  const ids = await q.query<{ empresa_id: string }>(
    "select distinct empresa_id from usuarios where email = any($1)",
    [emails],
  );
  for (const { empresa_id } of ids) {
    await q.query("delete from empresas where id = $1", [empresa_id]);
    fs.rmSync(path.join(process.cwd(), ".data", "uploads", empresa_id), { recursive: true, force: true });
  }
}

interface NuevoIngreso {
  nombre: string;
  dni: string;
  pendientes: string[];
}

async function crearEmpresa(q: Queryable, def: EmpresaDemo, hash: string): Promise<NuevoIngreso[]> {
  const [{ id: empresaId }] = await q.query<{ id: string }>(
    "insert into empresas (nombre, sector, fecha_alta) values ($1, $2, now() - interval '120 days') returning id",
    [def.nombre, def.sector],
  );
  await crearCatalogoEmpresa(q, empresaId);
  const usuarios: string[] = [];
  for (const u of def.usuarios) {
    const [r] = await q.query<{ id: string }>(
      "insert into usuarios (empresa_id, nombre, email, password_hash, rol) values ($1, $2, $3, $4, $5) returning id",
      [empresaId, u.nombre, u.email, hash, u.rol],
    );
    usuarios.push(r.id);
  }
  const tipos = await q.query<Tipo>("select id, codigo, nombre, vigencia_dias from tipos_documento where empresa_id = $1 order by orden", [empresaId]);

  const usados = new Set<string>();
  const nuevos: NuevoIngreso[] = [];
  let docs = 0;
  for (let i = 0; i < def.operarios; i++) {
    let nombre: string;
    do {
      nombre = `${elegir(APELLIDOS)} ${elegir(APELLIDOS)} ${elegir(NOMBRES)}`;
    } while (usados.has(nombre));
    usados.add(nombre);
    const dni = String(entre(40_000_000, 79_999_999));
    // Los últimos 4 son ingresos de esta semana: aún les faltan documentos.
    const nuevo = i >= def.operarios - 4;
    const ingreso = nuevo ? sumarDias(HOY, -entre(0, 6)) : sumarDias(HOY, -entre(30, 900));
    const [{ id: operarioId }] = await q.query<{ id: string }>(
      `insert into operarios (empresa_id, nombre_completo, dni, puesto, fecha_ingreso, campana)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [empresaId, nombre, dni, elegir(def.puestos), ingreso, elegir(def.campanas)],
    );

    if (nuevo) nuevos.push({ nombre, dni, pendientes: [] });
    for (const t of tipos) {
      let esc = escenario(def.pesos);
      if (nuevo) esc = t.codigo === "DNI" || (t.codigo !== "EMO" && rand() < 0.3) ? "vigente" : "pendiente";
      if (esc === "pendiente") {
        if (nuevo) nuevos[nuevos.length - 1].pendientes.push(t.codigo);
        continue;
      }

      const revision = esc === "revision";
      const f = fechas(t, esc === "revision" ? "vigente" : esc);
      const pdf = await documentoPdf(t, nombre, dni, f.emision, f.impresa);
      const ruta = await guardarArchivo(empresaId, pdf, "application/pdf", q);

      let motivo: string | null = null;
      let ia: Record<string, unknown> = {
        fuente: "demo",
        legible: true,
        tipo_documento: t.codigo,
        nombre_persona: nombre,
        numero_documento_identidad: dni,
        fecha_emision: f.emision,
        fecha_vencimiento: f.impresa,
        entidad_emisora: EMISORES[t.codigo],
        resultado: RESULTADOS[t.codigo],
        resultado_favorable: RESULTADOS[t.codigo] ? true : null,
        confianza: "alta",
        observaciones: null,
        modelo: "seed-demo",
      };
      if (revision) {
        const caso = elegir(["ilegible", "nombre", "resultado"] as const);
        if (caso === "ilegible") {
          motivo = "Documento ilegible o incompleto. No se pudo determinar la fecha de vencimiento.";
          ia = { ...ia, legible: false, confianza: "baja", fecha_emision: null, fecha_vencimiento: null };
        } else if (caso === "nombre") {
          const otro = `${elegir(APELLIDOS)} ${elegir(APELLIDOS)} ${elegir(NOMBRES)}`;
          motivo = `El nombre del documento ("${otro}") no coincide con el operario.`;
          ia = { ...ia, nombre_persona: otro };
        } else {
          const r = t.codigo === "EMO" ? "APTO CON RESTRICCIONES" : "REGISTRA ANTECEDENTES";
          motivo = `Resultado desfavorable: ${r}.`;
          ia = { ...ia, resultado: r, resultado_favorable: false };
        }
      }

      const fechaCarga = sumarDias(f.emision < ingreso ? ingreso : f.emision, entre(0, 3));
      await q.query(
        `insert into documentos_operario
          (empresa_id, operario_id, tipo_documento_id, archivo_path, archivo_nombre, archivo_mime,
           fecha_emision, fecha_vencimiento, origen_vencimiento, revision_manual, motivo_revision,
           datos_extraidos_ia, cargado_por, fecha_carga)
         values ($1,$2,$3,$4,$5,'application/pdf',$6,$7,$8,$9,$10,$11,$12,$13::date + time '10:00')`,
        [
          empresaId, operarioId, t.id, ruta, `${t.codigo.toLowerCase()}_${dni}.pdf`,
          revision ? null : f.emision,
          revision ? null : f.vencimiento,
          revision ? null : f.impresa ? "documento" : "calculada",
          revision, motivo, JSON.stringify(ia), elegir(usuarios),
          fechaCarga > HOY ? HOY : fechaCarga,
        ],
      );
      docs++;
    }
  }
  console.log(`  ✓ ${def.nombre}: ${def.operarios} operarios, ${docs} documentos`);
  return nuevos;
}

/**
 * Archivos para probar en vivo la subida con IA y la carga por CSV:
 * - EMO válido de un operario nuevo (pasa de "Falta" a "Vigente").
 * - SCTR a nombre de otra persona (la IA lo detecta y queda en revisión).
 */
async function generarMuestras(nuevos: NuevoIngreso[]) {
  const dir = path.join(process.cwd(), "samples");
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const [a, b] = nuevos;
  const emo = { id: "", codigo: "EMO", nombre: "Certificado de Examen Médico Ocupacional (EMO)", vigencia_dias: 365 };
  const sctr = { id: "", codigo: "SCTR", nombre: "Constancia de Seguro Complementario de Trabajo de Riesgo", vigencia_dias: null };
  const archivos: [string, string][] = [];
  if (a) {
    const f = `EMO_${a.dni}_valido.pdf`;
    fs.writeFileSync(path.join(dir, f), await documentoPdf(emo, a.nombre, a.dni, sumarDias(HOY, -10), null));
    archivos.push([f, `subir como EMO de ${a.nombre} → queda Vigente`]);
  }
  if (a && b) {
    const f = `SCTR_otro_titular.pdf`;
    fs.writeFileSync(
      path.join(dir, f),
      await documentoPdf(sctr, b.nombre, b.dni, sumarDias(HOY, -345), sumarDias(HOY, 20)),
    );
    archivos.push([f, `subir como SCTR de ${a.nombre} → la IA detecta otro titular y lo manda a revisión`]);
  }
  const csv = ["nombre_completo,dni,puesto,fecha_ingreso,campana"];
  for (let i = 0; i < 12; i++) {
    csv.push(
      `${elegir(APELLIDOS)} ${elegir(APELLIDOS)} ${elegir(NOMBRES)},${entre(40_000_000, 79_999_999)},${elegir(["Cosechador", "Seleccionadora", "Empacadora"])},${formatearFecha(HOY)},Arándano 2026-27`,
    );
  }
  fs.writeFileSync(path.join(dir, "operarios_nueva_campana.csv"), csv.join("\n") + "\n");
  archivos.push(["operarios_nueva_campana.csv", "importar en Operarios → Carga masiva por CSV"]);
  fs.writeFileSync(
    path.join(dir, "LEEME.txt"),
    "Archivos de prueba generados por `npm run seed` (documentos ficticios, sin validez oficial).\n\n" +
      archivos.map(([f, d]) => `- ${f}: ${d}`).join("\n") +
      "\n",
  );
}

async function main() {
  const soloSiVacia = process.argv.includes("--if-empty");
  if (soloSiVacia) {
    const [{ n }] = await withOwner((q) => q.query<{ n: number }>("select count(*)::int as n from empresas"));
    if (n > 0) {
      await closeDb();
      return;
    }
  }
  console.log(`Cargando datos demo (hoy = ${formatearFecha(HOY)})…`);
  const hash = await hashPassword(PASSWORD_DEMO);
  const nuevos = await withOwner(async (q) => {
    await borrarDemos(q);
    const porEmpresa: NuevoIngreso[][] = [];
    for (const e of EMPRESAS) porEmpresa.push(await crearEmpresa(q, e, hash));
    return porEmpresa[0];
  });
  await generarMuestras(nuevos);
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
