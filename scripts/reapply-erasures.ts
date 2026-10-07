// Tras restaurar una copia ANTIGUA, reaplica las eliminaciones registradas después de esa copia
// (libro ERASURE_LEDGER, guardado fuera de la base). Idempotente.
export {};
try { process.loadEnvFile(".env"); } catch {}
const { readFileSync, existsSync } = await import("node:fs");
const { db } = await import("../src/server/db");
const { accountFingerprint } = await import("../src/server/security");
const { anonymizeCore } = await import("../src/server/services/employees");
const { scheduleFileDeletion } = await import("../src/server/services/documents");

const file = process.env.ERASURE_LEDGER ?? ".local/erasure-ledger.jsonl";
if (!existsSync(file)) {
  console.log("Sin libro de eliminaciones.");
  process.exit(0);
}
const entries = readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { kind: string; subject: string; companyId?: string });
let applied = 0;
const users = entries.some((e) => e.kind === "ACCOUNT") ? await db.user.findMany({ select: { id: true, email: true } }) : [];
for (const e of entries) {
  if (e.kind === "EMPLOYEE" && e.companyId) {
    const emp = await db.employee.findFirst({ where: { id: e.subject, companyId: e.companyId, anonymizedAt: null } });
    if (!emp) continue;
    const keys = await db.$transaction((tx) => anonymizeCore(tx, { companyId: e.companyId!, userId: "system", userLabel: "Sistema (reaplicación)" }, emp.id));
    await scheduleFileDeletion(keys);
    applied++;
  }
  if (e.kind === "ACCOUNT") {
    const u = users.find((x) => accountFingerprint(x.email) === e.subject);
    if (!u) continue;
    await db.$transaction(async (tx) => {
      await tx.company.updateMany({ where: { ownerId: u.id, closedAt: { not: null } }, data: { ownerId: null } });
      await tx.employee.updateMany({ where: { userId: u.id }, data: { userId: null } });
      await tx.$queryRaw`SELECT audit_redact_actor(${u.id})`;
      await tx.user.delete({ where: { id: u.id } });
    });
    applied++;
  }
}
console.log(`Eliminaciones reaplicadas: ${applied}`);
await db.$disconnect();
