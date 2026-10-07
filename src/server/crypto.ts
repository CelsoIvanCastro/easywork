import "server-only";
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto";
import { env } from "./env";

// AES-256-GCM con AAD = empresa + campo: un valor copiado a otra empresa o columna no descifra.
// Formato: v1.<keyId>.<iv>.<tag>.<ciphertext> (base64url).
export function encrypt(plain: string, companyId: string, field: string): string {
  const keyId = env.encryptionKeyCurrent;
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", env.encryptionKeys.get(keyId)!, iv);
  c.setAAD(Buffer.from(`${companyId}:${field}`));
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", keyId, iv.toString("base64url"), c.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}

export function decrypt(token: string, companyId: string, field: string): string {
  const [v, keyId, iv, tag, ct] = token.split(".");
  const key = env.encryptionKeys.get(keyId);
  if (v !== "v1" || !key) throw new Error("Clave de cifrado no disponible");
  const d = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  d.setAAD(Buffer.from(`${companyId}:${field}`));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
}

export const encOpt = (v: string | null | undefined, companyId: string, field: string) => (v ? encrypt(v, companyId, field) : null);
export const decOpt = (v: string | null | undefined, companyId: string, field: string) => (v ? decrypt(v, companyId, field) : null);
export const keyIdOf = (token: string) => token.split(".")[1];

// Índice ciego: HMAC con clave derivada por empresa y campo. Solo sirve para coincidencia exacta.
export function blindIndex(value: string, companyId: string, field: string): string {
  const key = Buffer.from(hkdfSync("sha256", env.blindIndexKey, companyId, `bidx:${field}`, 32));
  return createHmac("sha256", key).update(value.trim().toUpperCase()).digest("base64url").slice(0, 32);
}
