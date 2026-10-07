// Verifica una restauración: relaciones, integridad de archivos, descifrado y control de acceso a un documento.
export {};
const { readFileSync } = await import("node:fs");
const { createHash } = await import("node:crypto");
const { db } = await import("../src/server/db");
const { loadCtx } = await import("../src/server/context");
const { readVersion } = await import("../src/server/services/documents");
const { decrypt } = await import("../src/server/crypto");
const { storage } = await import("../src/server/storage");

const manifest = JSON.parse(readFileSync(process.env.RESTORE_MANIFEST!, "utf8")) as { sha256: Record<string, string> };
const ok = (c: boolean, m: string) => {
  if (!c) throw new Error(`✗ ${m}`);
  console.log(`✓ ${m}`);
};
const counts = { companies: await db.company.count(), employees: await db.employee.count(), versions: await db.documentVersion.count(), audit: await db.auditLog.count() };
console.log("Conteos:", counts);
ok(counts.companies > 0 && counts.versions > 0, "La base restaurada contiene empresas y documentos");
const orphanEmp = await db.$queryRaw<{ n: bigint }[]>`SELECT count(*) n FROM employee e LEFT JOIN company c ON c.id = e."companyId" WHERE c.id IS NULL`;
ok(Number(orphanEmp[0].n) === 0, "Relaciones empresa–expediente coherentes");
const fk = await db.$queryRaw<{ n: bigint }[]>`SELECT count(*) n FROM pg_constraint WHERE contype = 'f' AND conrelid::regclass::text IN ('document','employee','purchase_line')`;
ok(Number(fk[0].n) > 5, "Claves foráneas compuestas presentes");
const trig = await db.$queryRaw<{ n: bigint }[]>`SELECT count(*) n FROM pg_trigger WHERE tgname = 'audit_log_immutable'`;
ok(Number(trig[0].n) === 1, "Protección de auditoría presente");
const versions = await db.documentVersion.findMany({ where: { purgedAt: null } });
let checked = 0;
for (const v of versions) {
  const data = await storage.get(v.storageKey);
  if (createHash("sha256").update(data).digest("hex") !== v.sha256 || manifest.sha256[v.storageKey] !== v.sha256) throw new Error(`✗ Archivo alterado o ausente: ${v.id}`);
  checked++;
}
ok(checked === versions.length, `Integridad de ${checked} archivo(s) privados`);
const enc = await db.employee.findFirst({ where: { curpEnc: { not: null } } });
if (enc) ok(decrypt(enc.curpEnc!, enc.companyId, "curp").length === 18, "Campos cifrados legibles con las claves actuales");
// Acceso a un documento: el propietario puede leerlo; alguien de otra empresa no.
const v = versions.find((x) => x.mime === "application/pdf")!;
const company = await db.company.findUniqueOrThrow({ where: { id: v.companyId } });
const owner = await loadCtx(company.ownerId!, company.id);
ok((await readVersion(owner, v.id, "download")).data.length === v.size, "El propietario descarga un documento restaurado");
const other = await db.company.findFirst({ where: { id: { not: company.id }, ownerId: { not: null }, closedAt: null } });
if (other) {
  const outsider = await loadCtx(other.ownerId!, other.id);
  const denied = await readVersion(outsider, v.id, "download").then(() => false, () => true);
  ok(denied, "Otra empresa no puede acceder al documento restaurado");
}
await db.$disconnect();
console.log("Restauración verificada.");
