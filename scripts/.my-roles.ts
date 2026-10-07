try { process.loadEnvFile(".env"); } catch {}
const { db } = await import("../src/server/db");
const u = (await db.user.findMany({ select: { id: true, name: true, lastName: true } })).find((x) => `${x.name} ${x.lastName}` === process.argv[2])!;
const ms = await db.membership.findMany({ where: { userId: u.id }, include: { company: { select: { tradeName: true, ownerId: true } } } });
for (const m of ms) {
  const g = await db.grant.count({ where: { companyId: m.companyId, membershipId: m.id } });
  const e = await db.employee.findFirst({ where: { companyId: m.companyId, userId: u.id }, select: { position: { select: { title: true } } } });
  const n = await db.employee.count({ where: { companyId: m.companyId, status: "ACTIVE" } });
  console.log(`${m.company.tradeName}: ${m.company.ownerId === u.id ? "PROPIETARIO" : "empleado"} · ${e?.position?.title ?? "—"} · ${g} permisos · ${n} personas`);
}
process.exit(0);
