import assert from "node:assert/strict";
import { test } from "node:test";
import { proveedorIA } from "./extraer";

function conEntorno(vars: Record<string, string | undefined>, fn: () => void) {
  const claves = ["IA_PROVEEDOR", "GEMINI_API_KEY", "ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"];
  const antes = Object.fromEntries(claves.map((k) => [k, process.env[k]]));
  for (const k of claves) delete process.env[k];
  Object.assign(process.env, Object.fromEntries(Object.entries(vars).filter(([, v]) => v !== undefined)));
  try {
    fn();
  } finally {
    for (const k of claves) {
      if (antes[k] === undefined) delete process.env[k];
      else process.env[k] = antes[k];
    }
  }
}

test("sin keys no hay proveedor", () => {
  conEntorno({}, () => assert.equal(proveedorIA(), null));
});

test("sin IA_PROVEEDOR se prefiere Gemini si tiene key", () => {
  conEntorno({ GEMINI_API_KEY: "g", ANTHROPIC_API_KEY: "a" }, () => assert.equal(proveedorIA(), "gemini"));
  conEntorno({ ANTHROPIC_API_KEY: "a" }, () => assert.equal(proveedorIA(), "claude"));
});

test("IA_PROVEEDOR manda, pero exige la key de ese proveedor", () => {
  conEntorno({ IA_PROVEEDOR: "claude", GEMINI_API_KEY: "g", ANTHROPIC_API_KEY: "a" }, () =>
    assert.equal(proveedorIA(), "claude"),
  );
  conEntorno({ IA_PROVEEDOR: "claude", GEMINI_API_KEY: "g" }, () => assert.equal(proveedorIA(), null));
});
