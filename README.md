# DocOps — gestión documental de operarios (MVP)

> Nombre técnico provisional del repositorio. La marca del producto aún no está definida.

Plataforma web para que el área de RRHH de empresas **agroexportadoras y mineras** controle la vigencia de los documentos de sus operarios (DNI, antecedentes penales y policiales, EMO, SCTR…). RRHH sube el documento, **la IA (Claude) lo lee** y extrae tipo, titular, emisión y vencimiento. El **tablero** muestra en un solo vistazo qué está vigente, por vencer, vencido, pendiente o en revisión manual.

## Arranque rápido (sin configurar nada)

Requisitos: Node.js 20+ y npm.

```bash
npm install
```

```bash
npm run dev
```

Abre <http://localhost:3000>. La primera vez, `npm run dev` crea la base de datos local y carga los datos demo automáticamente.

| Usuario | Contraseña | Rol / empresa |
|---|---|---|
| `rrhh@agro-demo.test` | `demo1234` | Admin RRHH · Agrícola Demo Valle Sur (agroexportadora, 48 operarios) |
| `analista@agro-demo.test` | `demo1234` | Analista RRHH · misma empresa |
| `rrhh@minera-demo.test` | `demo1234` | Admin RRHH · Minera Demo Cerro Alto (16 operarios) |

Todo es ficticio: empresas, personas, DNIs y documentos PDF (marcados "sin validez oficial").

### Volver a cargar los datos demo

Detén `npm run dev` antes (la base local embebida no admite dos procesos a la vez) y ejecuta:

```bash
npm run seed
```

Borra y recrea **solo** las dos empresas demo (no toca empresas registradas por ti). Las fechas se generan relativas al día de hoy, así el tablero siempre muestra una mezcla realista de estados. También regenera `./samples/` con archivos para probar en vivo:

- `EMO_<dni>_valido.pdf`: súbelo como EMO del operario indicado en `samples/LEEME.txt` → pasa de "Falta" a "Vigente".
- `SCTR_otro_titular.pdf`: súbelo como SCTR del mismo operario → la IA detecta otro titular y lo deja en revisión manual.
- `operarios_nueva_campana.csv`: impórtalo en *Operarios → Carga masiva por CSV*.

## Lectura con IA (Claude API)

Copia `.env.example` a `.env.local` y completa tu API key de Anthropic (<https://console.anthropic.com>):

```bash
cp .env.example .env.local
```

```
ANTHROPIC_API_KEY=sk-ant-...
```

Reinicia `npm run dev`. **Sin la key la app funciona igual**, pero cada documento subido queda en "revisión manual" y RRHH completa las fechas a mano. Los documentos del seed traen una lectura de IA precargada (marcada "dato demo"), así el tablero luce completo sin gastar API.

Cómo funciona (`src/lib/ia/`):

1. `extraer.ts` envía el PDF o la imagen a Claude (`claude-opus-5-5` por defecto; se cambia con `ANTHROPIC_MODEL`) y pide **salida estructurada JSON** validada con Zod: tipo, titular, n.º de documento, fechas, resultado (p. ej. "NO REGISTRA ANTECEDENTES", "APTO") y confianza. Activa el *fallback* del servidor (`fallbacks: "default"`): si el modelo rechaza el documento, la API reintenta con otro modelo.
2. `evaluar.ts` aplica reglas deterministas (sin IA, con tests) y manda el documento a **revisión manual** si está ilegible, si es de otro tipo, si el titular o el DNI no coinciden con el operario, si el resultado es desfavorable o si no se puede determinar el vencimiento.
3. Vencimiento: se usa la fecha impresa (DNI, SCTR) o *emisión + vigencia del tipo* (antecedentes 90 días, EMO 365). Si hay ambas, gana la más temprana.

Costo aproximado: una llamada por documento subido (unos pocos miles de tokens de entrada por página).

## Variables de entorno

| Variable | Obligatoria | Uso |
|---|---|---|
| `ANTHROPIC_API_KEY` | Para la IA | Lectura automática de documentos |
| `ANTHROPIC_MODEL` | No | Modelo de Claude (por defecto `claude-opus-5-5`) |
| `SESSION_SECRET` | **En producción** | Firma de la cookie de sesión (≥ 32 caracteres aleatorios) |
| `DATABASE_URL` | En producción | Postgres (Neon o Supabase). Vacío = Postgres embebido local en `./.data/pgdata` |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET` | No | Archivos en Supabase Storage. Sin ellas: tabla `archivos` si hay `DATABASE_URL`, o disco local `./.data/uploads` |

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo (carga el seed si la base está vacía) |
| `npm run seed` | Recrea las empresas demo y `./samples/` |
| `npm test` | Tests de las reglas de estado y de evaluación de la IA |
| `npm run typecheck` / `npm run lint` | Verificaciones estáticas |
| `npm run build` / `npm start` | Build y servidor de producción |
| `npm run db:migrate` | Aplica migraciones contra `DATABASE_URL` |

## Arquitectura

- **Next.js 15 (App Router) + TypeScript + Tailwind v4.** Server Components para leer y Server Actions para escribir.
- **Postgres** con dos drivers intercambiables (`src/lib/db/index.ts`): PGlite (Postgres compilado a WASM, embebido) en local y `pg` contra Supabase en producción. Mismo SQL en ambos.
- **Multi-tenant con Row Level Security** (`src/db/migrations/001_init.sql`). Cada request autenticado abre una transacción con `set_config('app.empresa_id', …)` + `SET LOCAL ROLE app_tenant`, y las políticas RLS filtran todas las tablas por empresa. Aunque una consulta olvide el `where`, Postgres no devuelve ni acepta filas de otra empresa. Solo login, registro y seed usan la conexión sin RLS.
- **Estado del documento** calculado al leer (`src/lib/estado.ts`), no guardado, porque cambia con el paso de los días.
- **Auth** propia: email y contraseña (bcrypt) más cookie httpOnly firmada (JWT HS256). Roles `admin` y `analista`.

```
src/
  app/(auth)/            login y registro de empresa
  app/(app)/             tablero, alertas, operarios, operario/[id], configuración
  app/actions/           server actions (auth, operarios + CSV, documentos + IA, configuración)
  app/api/documentos/    descarga de archivos con control de empresa
  lib/db/                drivers y migraciones
  lib/ia/                extracción con Claude + reglas de validación
  db/migrations/         esquema SQL + RLS
scripts/seed.ts          datos demo
```

## Deploy

### Actual: Vercel + Neon (demo pública)

Publicado en <https://docops-phi.vercel.app> (proyecto `docops` en Vercel). La base es Neon (Postgres, región São Paulo), conectada desde la pestaña *Storage* del proyecto, que inyecta `DATABASE_URL`. Los archivos se guardan en la misma base (tabla `archivos`) porque no hay Supabase Storage configurado.

Para volver a desplegar y recargar los datos demo en producción:

```bash
vercel env pull .env.vercel --environment=production --yes
```

```bash
DATABASE_URL="$(grep '^DATABASE_URL_UNPOOLED=' .env.vercel | cut -d= -f2- | tr -d '"')" npx tsx --env-file=.env.vercel scripts/seed.ts
```

```bash
vercel deploy --prod
```

`.env.vercel` contiene credenciales: está ignorado por git, no lo compartas. Las migraciones corren solas al arrancar la app (o con `scripts/migrate.ts` usando el mismo prefijo). Para activar la IA en producción, agrega `ANTHROPIC_API_KEY` en *Settings → Environment Variables* y vuelve a desplegar.

### Cuentas para pruebas con participantes

Cada participante de las pruebas de usabilidad entra con su propia cuenta (`prueba01@docops.test`, `prueba02@…`). Cada cuenta tiene una copia idéntica de la empresa agro demo, que es lo que asume la encuesta, así nadie pisa los datos de otro. Contra producción, antepón el mismo prefijo `DATABASE_URL=… npx tsx --env-file=.env.vercel` de arriba:

| Comando | Qué hace |
|---|---|
| `npx tsx scripts/participantes.ts crear 15` | Crea las cuentas que falten hasta la 15 y guarda las contraseñas en `participantes.local.csv` |
| `npx tsx scripts/participantes.ts estado` | Operarios y documentos que agregó cada participante |
| `npx tsx scripts/participantes.ts reset 03` | Deja la cuenta 03 como nueva (misma contraseña); `reset todas` para todas |
| `npx tsx scripts/participantes.ts clave 03` | Nueva contraseña para la 03 |

`participantes.local.csv` está ignorado por git: es la única copia de las contraseñas, guárdenlo y repártanlo por un canal privado. `npm run seed` no toca estas cuentas.

### Alternativa: Supabase

Con `DATABASE_URL` de Supabase (Transaction pooler, puerto 6543) y `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` + un bucket privado `documentos`, los archivos van a Supabase Storage. Esta ruta no está probada.

Las decisiones y supuestos tomados durante la construcción están en [ASSUMPTIONS.md](ASSUMPTIONS.md).
