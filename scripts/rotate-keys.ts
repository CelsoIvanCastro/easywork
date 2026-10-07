// Re-cifra con la clave vigente (ENCRYPTION_KEY_CURRENT) los valores cifrados con claves anteriores.
// Procedimiento: añadir la clave nueva a ENCRYPTION_KEYS, marcarla vigente, ejecutar este script y,
// cuando termine sin pendientes, retirar la clave antigua. Los índices ciegos no cambian (usan BLIND_INDEX_KEY).
export {};
try { process.loadEnvFile(".env"); } catch {}
const { db } = await import("../src/server/db");
const { decrypt, encrypt, keyIdOf } = await import("../src/server/crypto");
const current = process.env.ENCRYPTION_KEY_CURRENT!;
let n = 0;
for (const e of await db.employee.findMany({ select: { id: true, companyId: true, curpEnc: true, rfcEnc: true, nssEnc: true, addressEnc: true } })) {
  const data: Record<string, string> = {};
  for (const [col, field] of [["curpEnc", "curp"], ["rfcEnc", "rfc"], ["nssEnc", "nss"], ["addressEnc", "address"]] as const) {
    const v = e[col];
    if (v && keyIdOf(v) !== current) data[col] = encrypt(decrypt(v, e.companyId, field), e.companyId, field);
  }
  if (Object.keys(data).length) (await db.employee.update({ where: { id: e.id }, data }), n++);
}
for (const b of await db.bankAccount.findMany({ select: { id: true, companyId: true, clabeEnc: true } })) {
  if (keyIdOf(b.clabeEnc) !== current) (await db.bankAccount.update({ where: { id: b.id }, data: { clabeEnc: encrypt(decrypt(b.clabeEnc, b.companyId, "clabe"), b.companyId, "clabe") } }), n++);
}
console.log(`Registros re-cifrados con ${current}: ${n}`);
await db.$disconnect();
