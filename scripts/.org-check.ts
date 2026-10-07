try { process.loadEnvFile(".env"); } catch {}
const { db } = await import("../src/server/db");
const { loadCtx } = await import("../src/server/context");
const { canSeeOrgChart } = await import("../src/server/services/structure");
const u = (await db.user.findMany({ select: { id: true, name: true, lastName: true } })).find((x) => `${x.name} ${x.lastName}` === process.argv[2])!;
for (const m of await db.membership.findMany({ where: { userId: u.id }, include: { company: true } }))
  console.log(`${m.company.tradeName}: ${m.company.ownerId === u.id ? "propietario" : "empleado"} → organigrama ${canSeeOrgChart(await loadCtx(u.id, m.companyId)) ? "VISIBLE" : "oculto"}`);
process.exit(0);
