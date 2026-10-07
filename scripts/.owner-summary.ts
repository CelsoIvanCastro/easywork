try { process.loadEnvFile(".env"); } catch {}
const { db } = await import("../src/server/db");
const u = (await db.user.findMany({ select: { id: true, name: true, lastName: true } })).find((x) => `${x.name} ${x.lastName}` === process.argv[2])!;
const cs = await db.company.findMany({ where: { ownerId: u.id }, select: { id: true, tradeName: true } });
for (const c of cs) {
  const w = { companyId: c.id };
  const [act, ex, dep, pos, doc, it, as, sup, po, al] = await Promise.all([
    db.employee.count({ where: { ...w, status: "ACTIVE" } }), db.employee.count({ where: { ...w, NOT: { status: "ACTIVE" } } }),
    db.department.count({ where: w }), db.position.count({ where: w }), db.document.count({ where: w }), db.item.count({ where: w }),
    db.asset.count({ where: w }), db.supplier.count({ where: w }), db.purchase.count({ where: w }), db.alert.count({ where: w }),
  ]);
  console.log(`${c.tradeName}: ${act} activos, ${ex} exempleados, ${dep} deptos, ${pos} puestos, ${doc} docs, ${it} artículos, ${as} activos fijos, ${sup} proveedores, ${po} compras, ${al} alertas`);
}
process.exit(0);
