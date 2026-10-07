// Validaciones estructurales de identificadores mexicanos. No verifican existencia ante autoridades ni bancos.

const CURP_RE = /^[A-Z][AEIOUX][A-Z]{2}\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])[HMX](AS|BC|BS|CC|CL|CM|CS|CH|DF|DG|GT|GR|HG|JC|MC|MN|MS|NT|NL|OC|PL|QT|QR|SP|SL|SR|TC|TS|TL|VZ|YN|ZS|NE)[B-DF-HJ-NP-TV-Z]{3}[A-Z\d]\d$/;
const CURP_DICT = "0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ";

export function isValidCurp(raw: string): boolean {
  const c = raw.trim().toUpperCase();
  if (!CURP_RE.test(c)) return false;
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += CURP_DICT.indexOf(c[i]) * (18 - i);
  return (10 - (sum % 10)) % 10 === Number(c[17]);
}

// RFC: persona física (4 letras) o moral (3). Valida fecha; la homoclave no se verifica.
export function isValidRfc(raw: string): boolean {
  const r = raw.trim().toUpperCase();
  const m = /^([A-ZÑ&]{3,4})(\d{2})(\d{2})(\d{2})([A-Z\d]{2}[A\d])$/.exec(r);
  if (!m) return false;
  const mm = Number(m[3]), dd = Number(m[4]);
  return mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31;
}

// NSS (IMSS): 11 dígitos, el último es dígito verificador Luhn.
export function isValidNss(raw: string): boolean {
  const n = raw.trim();
  if (!/^\d{11}$/.test(n)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    let d = Number(n[i]) * (i % 2 === 0 ? 1 : 2);
    if (d > 9) d -= 9;
    sum += d;
  }
  return (10 - (sum % 10)) % 10 === Number(n[10]);
}

// Catálogo parcial de claves de banco (3 primeros dígitos de la CLABE). Fuente: ABM / Banxico.
// Una clave no listada se acepta como "banco no identificado".
export const BANKS: Record<string, string> = {
  "002": "Banamex",
  "012": "BBVA México",
  "014": "Santander",
  "021": "HSBC",
  "030": "BanBajío",
  "036": "Inbursa",
  "044": "Scotiabank",
  "058": "Banregio",
  "072": "Banorte",
  "127": "Banco Azteca",
  "137": "BanCoppel",
  "646": "STP",
};

export type ClabeCheck =
  | { ok: true; bankCode: string; bankName: string | null; clabe: string }
  | { ok: false; error: string };

// CLABE: 18 dígitos (banco 3 + plaza 3 + cuenta 11 + verificador 1). Pesos 3,7,1 módulo 10.
// Valida estructura únicamente: no prueba que la cuenta exista ni su titularidad.
export function checkClabe(raw: string): ClabeCheck {
  const c = raw.replace(/[\s-]/g, "");
  if (!/^\d+$/.test(c)) return { ok: false, error: "La CLABE solo admite dígitos." };
  if (c.length !== 18) return { ok: false, error: "La CLABE debe tener exactamente 18 dígitos." };
  const w = [3, 7, 1];
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += (Number(c[i]) * w[i % 3]) % 10;
  if ((10 - (sum % 10)) % 10 !== Number(c[17])) return { ok: false, error: "El dígito verificador de la CLABE no coincide." };
  const bankCode = c.slice(0, 3);
  return { ok: true, bankCode, bankName: BANKS[bankCode] ?? null, clabe: c };
}

export const maskClabe = (last4: string) => `•••• •••• •••• ••${last4}`;
