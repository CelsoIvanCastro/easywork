import { describe, expect, it } from "vitest";
import { checkClabe, isValidCurp, isValidNss, isValidRfc } from "@/lib/mx";

// Construye una CLABE válida a partir de 17 dígitos (mismo algoritmo, verificado con el ejemplo de abajo).
const withCheck = (s17: string) => {
  const w = [3, 7, 1];
  const sum = [...s17].reduce((a, d, i) => a + ((Number(d) * w[i % 3]) % 10), 0);
  return s17 + ((10 - (sum % 10)) % 10);
};

describe("CLABE", () => {
  it("coincide con un ejemplo conocido de verificación", () => {
    // Ejemplo publicado del algoritmo: 032180000118359719 (dígito verificador 9).
    expect(checkClabe("032180000118359719").ok).toBe(true);
  });
  it("conserva ceros iniciales e identifica el banco", () => {
    const c = withCheck("00218000011835971");
    const r = checkClabe(c);
    expect(r.ok && r.clabe).toBe(c);
    expect(r.ok && r.bankName).toBe("Banamex");
    expect(r.ok && r.clabe.startsWith("002")).toBe(true);
  });
  it("rechaza longitud, caracteres y dígito verificador incorrectos", () => {
    expect(checkClabe("12345").ok).toBe(false);
    expect(checkClabe("03218000011835971A").ok).toBe(false);
    expect(checkClabe("032180000118359710").ok).toBe(false);
  });
  it("acepta un banco no catalogado sin inventar nombre", () => {
    const r = checkClabe(withCheck("99918000011835971"));
    expect(r.ok && r.bankName).toBe(null);
  });
});

describe("CURP / RFC / NSS", () => {
  it("CURP con dígito verificador", () => {
    // Formato de ejemplo con dígito calculado por el algoritmo publicado de RENAPO (no es una persona real).
    expect(isValidCurp("BADD110313HCMLNS06")).toBe(true);
    expect(isValidCurp("BADD110313HCMLNS09")).toBe(false);
    expect(isValidCurp("BADD111313HCMLNS06")).toBe(false);
    expect(isValidCurp("XXXX")).toBe(false);
  });
  it("RFC persona física y moral", () => {
    expect(isValidRfc("GODE561231GR8")).toBe(true);
    expect(isValidRfc("ABC010203AB1")).toBe(true);
    expect(isValidRfc("GODE561331GR8")).toBe(false);
  });
  it("NSS con Luhn", () => {
    expect(isValidNss("12345678903")).toBe(true);
    expect(isValidNss("12345678901")).toBe(false);
    expect(isValidNss("1234")).toBe(false);
  });
});
