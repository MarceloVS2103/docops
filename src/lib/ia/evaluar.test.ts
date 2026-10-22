import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluarExtraccion, nombresCoinciden } from "./evaluar";
import type { Extraccion } from "./extraer";

const base: Extraccion = {
  legible: true,
  tipo_documento: "ANTECEDENTES_PENALES",
  nombre_persona: "Quispe Mamani, Juan Carlos",
  numero_documento_identidad: "45879632",
  fecha_emision: "2026-10-01",
  fecha_vencimiento: null,
  entidad_emisora: "Poder Judicial",
  resultado: "NO REGISTRA ANTECEDENTES",
  resultado_favorable: true,
  confianza: "alta",
  observaciones: null,
};
const ctx = {
  tipoCodigo: "ANTECEDENTES_PENALES",
  tipoNombre: "Certificado de Antecedentes Penales",
  vigenciaDias: 90,
  operarioNombre: "QUISPE MAMANI JUAN CARLOS",
  operarioDni: "45879632",
  hoy: "2026-10-22",
};

test("documento correcto: vencimiento calculado y sin revisión", () => {
  const r = evaluarExtraccion(base, ctx);
  assert.equal(r.revision_manual, false, r.motivos.join(" "));
  assert.equal(r.fecha_vencimiento, "2026-12-30");
  assert.equal(r.origen_vencimiento, "calculada");
});

test("con fecha impresa y vigencia se toma la más temprana", () => {
  const r = evaluarExtraccion({ ...base, fecha_vencimiento: "2026-11-15" }, ctx);
  assert.equal(r.fecha_vencimiento, "2026-11-15");
  assert.equal(r.origen_vencimiento, "documento");
});

test("otro titular → revisión", () => {
  const r = evaluarExtraccion({ ...base, nombre_persona: "TORRES RAMOS ANA", numero_documento_identidad: "11112222" }, ctx);
  assert.equal(r.revision_manual, true);
  assert.equal(r.motivos.length, 2);
});

test("tipo distinto, ilegible o resultado desfavorable → revisión", () => {
  assert.ok(evaluarExtraccion({ ...base, tipo_documento: "EMO" }, ctx).revision_manual);
  assert.ok(evaluarExtraccion({ ...base, legible: false }, ctx).revision_manual);
  assert.ok(evaluarExtraccion({ ...base, resultado_favorable: false, resultado: "REGISTRA" }, ctx).revision_manual);
});

test("sin fechas y sin vigencia → revisión", () => {
  const r = evaluarExtraccion({ ...base, fecha_emision: null }, { ...ctx, vigenciaDias: null });
  assert.equal(r.revision_manual, true);
  assert.equal(r.fecha_vencimiento, null);
});

test("fechas mal formadas se descartan", () => {
  const r = evaluarExtraccion({ ...base, fecha_emision: "2026-02-30" }, ctx);
  assert.equal(r.fecha_emision, null);
  assert.ok(r.revision_manual);
});

test("coincidencia de nombres ignora orden, comas y tildes", () => {
  assert.ok(nombresCoinciden("HUAMÁN TORRES ROSA ELENA", "Rosa Elena Huaman Torres"));
  assert.ok(!nombresCoinciden("HUAMAN TORRES ROSA ELENA", "Rosa Quispe"));
});
