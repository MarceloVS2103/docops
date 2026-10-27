/**
 * Cuentas para las pruebas de usabilidad: una empresa por participante, cada
 * una con una copia idéntica de la empresa agro demo (lo que espera la
 * encuesta). Así nadie pisa los datos de otro.
 *
 *   npx tsx scripts/participantes.ts crear 15     → crea las que falten (01…15)
 *   npx tsx scripts/participantes.ts estado       → actividad de cada cuenta
 *   npx tsx scripts/participantes.ts reset 03     → deja la 03 como nueva (misma contraseña)
 *   npx tsx scripts/participantes.ts reset todas  → idem para todas
 *   npx tsx scripts/participantes.ts clave 03     → nueva contraseña para la 03
 *
 * Las contraseñas solo se guardan en ./participantes.local.csv (ignorado por
 * git): es la lista que el equipo reparte. En la base quedan hasheadas.
 */
import fs from "node:fs";
import path from "node:path";
import { randomInt } from "node:crypto";
import { hashPassword } from "../src/lib/hash";
import { closeDb, withOwner, type Queryable } from "../src/lib/db";
import { formatearFecha } from "../src/lib/estado";
import { EMPRESAS, HOY, borrarEmpresasDe, crearEmpresa, reiniciarAleatorio } from "../src/lib/demo/datos";

const ARCHIVO = path.join(process.cwd(), "participantes.local.csv");
const AGRO = EMPRESAS[0];

const num = (i: number) => String(i).padStart(2, "0");
const email = (n: string) => `prueba${n}@docops.test`;

/** 8 caracteres sin letras ni números ambiguos (0/O, 1/l/I), en dos grupos. */
function generarClave(): string {
  const abc = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const c = Array.from({ length: 8 }, () => abc[randomInt(abc.length)]).join("");
  return `${c.slice(0, 4)}-${c.slice(4)}`;
}

function leerCredenciales(): Map<string, string> {
  if (!fs.existsSync(ARCHIVO)) return new Map();
  const filas = fs.readFileSync(ARCHIVO, "utf8").trim().split("\n").slice(1);
  return new Map(filas.filter(Boolean).map((l) => l.split(",") as [string, string]));
}

function guardarCredenciales(cred: Map<string, string>) {
  const filas = [...cred.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([e, p]) => `${e},${p}`);
  fs.writeFileSync(ARCHIVO, ["email,contraseña", ...filas].join("\n") + "\n");
}

async function crearCuenta(q: Queryable, n: string, passwordHash: string) {
  reiniciarAleatorio();
  await crearEmpresa(
    q,
    AGRO,
    [{ nombre: `Participante ${n}`, email: email(n), rol: "admin", passwordHash }],
    `${AGRO.nombre.replace(/ S\.A\.C\.$/, "")} · prueba ${n}`,
  );
}

async function crear(total: number) {
  const cred = leerCredenciales();
  const nuevas: [string, string][] = [];
  for (let i = 1; i <= total; i++) {
    const n = num(i);
    const existe = await withOwner((q) => q.query("select 1 from usuarios where email = $1", [email(n)]));
    if (existe.length) continue;
    const clave = generarClave();
    const hash = await hashPassword(clave);
    await withOwner((q) => crearCuenta(q, n, hash));
    cred.set(email(n), clave);
    guardarCredenciales(cred); // tras cada cuenta, por si algo falla a mitad
    nuevas.push([email(n), clave]);
  }
  console.log(nuevas.length ? `\n${nuevas.length} cuentas nuevas:` : "No faltaba ninguna cuenta.");
  for (const [e, c] of nuevas) console.log(`  ${e.padEnd(26)} ${c}`);
  console.log(`\nLista completa para repartir: ${ARCHIVO}`);
}

async function reset(cual: string) {
  const objetivo = cual === "todas" ? "%" : num(Number(cual));
  const usuarios = await withOwner((q) =>
    q.query<{ email: string; password_hash: string }>(
      "select email, password_hash from usuarios where email like $1 order by email",
      [`prueba${objetivo}@docops.test`],
    ),
  );
  if (!usuarios.length) throw new Error(`No existe la cuenta ${cual}.`);
  for (const u of usuarios) {
    const n = u.email.match(/^prueba(\d+)@/)![1];
    await withOwner(async (q) => {
      await borrarEmpresasDe(q, [u.email]);
      await crearCuenta(q, n, u.password_hash);
    });
  }
  console.log(`\nListo: ${usuarios.length} cuenta(s) como nuevas, con la misma contraseña.`);
}

async function clave(cual: string) {
  const e = email(num(Number(cual)));
  const nueva = generarClave();
  const r = await withOwner(async (q) =>
    q.query("update usuarios set password_hash = $2 where email = $1 returning 1", [e, await hashPassword(nueva)]),
  );
  if (!r.length) throw new Error(`No existe la cuenta ${cual}.`);
  const cred = leerCredenciales();
  cred.set(e, nueva);
  guardarCredenciales(cred);
  console.log(`${e}  nueva contraseña: ${nueva}`);
}

async function estado() {
  const filas = await withOwner((q) =>
    // Lo creado por el seed comparte el instante de alta (fecha_alta + 120 días)
    // y sus documentos llevan fuente "demo"; el resto lo hizo el participante.
    q.query<{ email: string; operarios: number; docs: number; ultima: string | null }>(
      `select u.email,
              (select count(*)::int from operarios o
                where o.empresa_id = u.empresa_id and o.creado_en > e.fecha_alta + interval '120 days') as operarios,
              (select count(*)::int from documentos_operario d
                where d.empresa_id = u.empresa_id and coalesce(d.datos_extraidos_ia->>'fuente', '') <> 'demo') as docs,
              (select max(d.fecha_carga)::text from documentos_operario d
                where d.empresa_id = u.empresa_id and coalesce(d.datos_extraidos_ia->>'fuente', '') <> 'demo') as ultima
       from usuarios u join empresas e on e.id = u.empresa_id
       where u.email like 'prueba%@docops.test' order by u.email`,
    ),
  );
  console.log("cuenta                      operarios nuevos  documentos subidos  última subida");
  for (const f of filas) {
    console.log(
      `${f.email.padEnd(28)}${String(f.operarios).padStart(16)}${String(f.docs).padStart(20)}  ${f.ultima ? f.ultima.slice(0, 16) : "—"}`,
    );
  }
}

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  console.log(`Participantes (hoy = ${formatearFecha(HOY)}) · base: ${process.env.DATABASE_URL ? "remota" : "local"}`);
  if (cmd === "crear" && Number(arg) > 0) await crear(Number(arg));
  else if (cmd === "reset" && arg) await reset(arg);
  else if (cmd === "clave" && arg) await clave(arg);
  else if (cmd === "estado") await estado();
  else {
    console.log("Uso: crear <N> | estado | reset <NN|todas> | clave <NN>");
    process.exitCode = 1;
  }
  await closeDb();
}

main().catch(async (err) => {
  console.error(err instanceof Error ? err.message : err);
  await closeDb().catch(() => {});
  process.exit(1);
});
