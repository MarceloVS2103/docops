import assert from "node:assert/strict";
import { test } from "node:test";
import { calcularEstado, diasEntre, sumarDias } from "./estado";

const HOY = "2026-10-22";

test("sin documento → pendiente", () => {
  assert.equal(calcularEstado(null, 30, HOY).estado, "pendiente");
});

test("revisión manual tiene prioridad sobre las fechas", () => {
  assert.equal(calcularEstado({ revision_manual: true, fecha_vencimiento: "2030-01-01" }, 30, HOY).estado, "revision_manual");
});

test("umbral de por vencer es inclusivo", () => {
  assert.deepEqual(calcularEstado({ revision_manual: false, fecha_vencimiento: "2026-11-21" }, 30, HOY), {
    estado: "por_vencer",
    diasRestantes: 30,
  });
  assert.equal(calcularEstado({ revision_manual: false, fecha_vencimiento: "2026-11-22" }, 30, HOY).estado, "vigente");
});

test("vence hoy sigue por vencer; ayer ya venció", () => {
  assert.equal(calcularEstado({ revision_manual: false, fecha_vencimiento: HOY }, 30, HOY).estado, "por_vencer");
  assert.deepEqual(calcularEstado({ revision_manual: false, fecha_vencimiento: "2026-10-21" }, 30, HOY), {
    estado: "vencido",
    diasRestantes: -1,
  });
});

test("sin vencimiento y sin revisión → vigente (no vence)", () => {
  assert.deepEqual(calcularEstado({ revision_manual: false, fecha_vencimiento: null }, 30, HOY), {
    estado: "vigente",
    diasRestantes: null,
  });
});

test("aritmética de fechas cruza años bisiestos", () => {
  assert.equal(sumarDias("2028-02-28", 1), "2028-02-29");
  assert.equal(diasEntre("2026-12-31", "2027-01-01"), 1);
});
