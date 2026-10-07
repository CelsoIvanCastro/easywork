try { process.loadEnvFile(".env"); } catch {}
const { db } = await import("../src/server/db");
const { loadCtx, can, employeeScope } = await import("../src/server/context");
const { PERMISSIONS } = await import("../src/server/permissions");
const u = (await db.user.findMany({ select: { id: true, name: true, lastName: true } })).find((x) => `${x.name} ${x.lastName}` === process.argv[2])!;
for (const m of await db.membership.findMany({ where: { userId: u.id }, include: { company: true } })) {
  if (m.company.ownerId === u.id) continue;
  const ctx = await loadCtx(u.id, m.companyId);
  const on = Object.keys(PERMISSIONS).filter((p) => can(ctx, p as never));
  const g = await db.grant.findMany({ where: { companyId: m.companyId }, select: { subjectType: true, permission: true } });
  const bySubj = g.reduce((a, x) => ({ ...a, [x.subjectType]: (a[x.subjectType] ?? 0) + 1 }), {} as Record<string, number>);
  console.log(`\n${m.company.tradeName} · fullAccess=${m.fullAccess} · concesiones en la empresa: ${JSON.stringify(bySubj)}`);
  const sc = employeeScope(ctx, "employees.read");
  const vis = sc ? await db.employee.count({ where: { AND: [sc, { status: "ACTIVE" }] } }) : 0;
  const tot = await db.employee.count({ where: { companyId: m.companyId, status: "ACTIVE" } });
  console.log(`  expedientes visibles: ${vis} de ${tot}`);
  console.log(`  efectivos (${on.length}): ${on.join(", ")}`);
}
process.exit(0);
