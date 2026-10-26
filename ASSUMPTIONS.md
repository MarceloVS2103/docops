# Supuestos y decisiones del MVP

Decisiones tomadas sin preguntar para no frenar la construcción. Cualquiera se puede revertir.

## Stack

- **Supabase solo como destino de producción, no como dependencia de desarrollo.** La máquina donde se construyó no tenía Docker ni el CLI de Supabase, así que no había forma de correr Supabase localmente ni de probarlo. Se eligió:
  - **Postgres embebido (PGlite)** en local: `npm install && npm run dev` y la demo corre sin cuentas ni servicios externos. En producción se usa el Postgres de Supabase vía `DATABASE_URL`, con el **mismo SQL**.
  - **RLS de Postgres** para el multi-tenant, como pedía el brief, pero con un rol propio (`app_tenant`) y la variable de sesión `app.empresa_id` en vez de `auth.uid()` de Supabase Auth. Así funciona igual en PGlite y en Supabase.
  - **Auth propia** (bcrypt + cookie JWT firmada) en lugar de Supabase Auth, por la misma razón. Migrar a Supabase Auth después es posible: cambia cómo se obtiene `empresa_id`, no el modelo de datos.
  - **Archivos**: disco local en desarrollo y Supabase Storage (bucket privado) en producción, detrás de `src/lib/storage.ts`.
- La ruta de producción (Supabase Postgres + Storage + Vercel) **no fue probada** contra un proyecto real; ver README → Deploy.
- PGlite admite **un solo proceso** sobre `./.data/pgdata`: no correr `npm run seed` con `npm run dev` encendido.

## Modelo de datos (cambios respecto al brief)

- **`TipoDocumento` tiene `empresa_id`.** El brief lo pedía global y "editable"; si fuera global, una empresa cambiaría la vigencia de todas. Cada empresa recibe una copia del catálogo base al registrarse y la edita en *Configuración*.
- **`DocumentoOperario.estado` no se guarda: se calcula al leer.** Un documento "vigente" pasa solo a "por vencer" y "vencido" con el paso de los días; guardarlo exigiría un job diario. Se guarda `revision_manual` (bool) + `motivo_revision`, y el estado sale de `calcularEstado()` en `src/lib/estado.ts`.
- **`DocumentoOperario` tiene `empresa_id` redundante** (además de `operario_id`) para que la política RLS sea una comparación simple.
- Se agregó `origen_vencimiento` (`documento` | `calculada` | `manual`) para que RRHH sepa de dónde salió la fecha.
- Se guarda el **historial**: subir una renovación crea un registro nuevo y el tablero usa el último cargado.
- `Empresa.dias_alerta` (por defecto 30) define el umbral de "por vencer" y se configura por empresa.

## Reglas de negocio

- **Vigencias por defecto** (editables), según el criterio habitual de RRHH en Perú; **validar con clientes**:
  - DNI: fecha de caducidad impresa.
  - Antecedentes penales y policiales: 90 días desde la emisión.
  - EMO: 365 días desde la emisión (o el "válido hasta" impreso, si es antes).
  - SCTR: fin de cobertura impreso en la constancia.
- Si un documento trae vencimiento impreso **y** el tipo tiene vigencia por antigüedad, se usa **la fecha más temprana** (criterio conservador de cumplimiento).
- **Apto para trabajar** = todos los documentos *obligatorios* vigentes o por vencer. "Por vencer" aún es apto, porque el documento sigue válido.
- Un documento queda en **revisión manual** si la IA no está configurada o falla, si el archivo es ilegible, si es de otro tipo, si el nombre del titular no coincide (se piden al menos 2 palabras en común, sin tildes ni orden) o si no coincide el DNI, si el resultado es desfavorable ("REGISTRA ANTECEDENTES", "NO APTO", "APTO CON RESTRICCIONES") o si no se puede determinar el vencimiento.
- En la revisión manual, si RRHH deja el vencimiento vacío, se calcula con la vigencia del tipo. Sin vigencia, queda como "no vence".
- DNI/CE: se aceptan 8 a 12 caracteres alfanuméricos (DNI peruano = 8 dígitos; CE y pasaporte para extranjeros).
- CSV: delimitador autodetectado (`,` o `;`, como exporta Excel en Perú), cabeceras flexibles ("Nombres y Apellidos", "Cargo", "Campaña"…), fechas `DD/MM/AAAA` o `AAAA-MM-DD`. Si el DNI ya existe, se actualiza el operario (y se reactiva).
- Zona horaria: "hoy" se calcula en `America/Lima`.
- Tamaño máximo de archivo: 10 MB. Formatos: PDF, JPG, PNG y WEBP (los que Claude lee directamente).

## Roles y usuarios

- **Admin RRHH**: todo, más editar la empresa, el catálogo de documentos y el equipo. **Analista RRHH**: operarios, documentos, tablero y alertas; la configuración la ve en solo lectura.
- "Invitar" usuarios = el admin crea la cuenta y la app muestra **una vez** una contraseña temporal para compartir (no hay correo real en v1). Falta un flujo para que el usuario cambie su contraseña: pendiente para v2.
- Los emails son únicos en toda la plataforma: un usuario pertenece a una sola empresa.

## IA

- Dos proveedores intercambiables con el mismo esquema e instrucciones: **Gemini** (`gemini-3.8-flash`, elegido por el equipo para las pruebas con participantes por su plan gratuito) y **Claude** (`claude-opus-5-5`, con `effort: "medium"` y *fallback* de servidor). `IA_PROVEEDOR` fuerza uno; sin ella se usa el que tenga clave, Gemini primero.
- Plan gratuito de Gemini: Google puede usar el contenido para mejorar sus productos y hay topes de uso por minuto. Aceptable con los PDFs ficticios de la encuesta; **no** para documentos reales de clientes. Si se pasa el tope, el documento queda en revisión manual con un aviso de reintento.
- La extracción corre **sincrónica** durante la subida (unos segundos, con el indicador "Leyendo con IA…"). Para cargas masivas convendría una cola o una API por lotes (v2).
- Las reglas de `evaluar.ts` tienen tests unitarios. La lectura en sí depende del modelo: **pruébenla con documentos reales** (DNI, certificados, EMO y SCTR de verdad) antes de mostrarla a clientes, y ajusten las instrucciones en `src/lib/ia/esquema.ts` si alguna fecha sale mal.
- Los documentos del seed traen una "lectura de IA" sintética marcada con `fuente: "demo"`.

## Fuera de alcance (tal como pedía el brief)

Portal del operario, notificaciones reales (correo/WhatsApp/SMS), facturación y planes, capa internacional (apostillas, visas), reportes exportables e integraciones con ERPs.

## Diseño

- Sin marca: nombre técnico "DocOps", paleta neutra (slate + un azul de acento) y la tipografía del sistema.
- Colores de estado: verde (vigente), ámbar (por vencer), rojo (vencido), gris (pendiente) y **violeta (revisión manual)**. El brief no le asignaba color a revisión manual y necesitaba uno distinto. Cada celda lleva además un ícono y texto, así el estado no depende solo del color (daltonismo).
- Solo modo claro en v1.
