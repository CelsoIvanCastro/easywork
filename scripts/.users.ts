try { process.loadEnvFile(".env"); } catch {}
const { db } = await import("../src/server/db");
const us = await db.user.findMany({ where: { NOT: { email: { endsWith: ".test" } } }, select: { email: true, name: true, lastName: true, emailVerified: true, createdAt: true } });
console.log(us.map(u => `${u.email.replace(/^(.{3}).*@/, "$1***@")} | ${u.name} ${u.lastName} | verif=${u.emailVerified} | ${u.createdAt.toISOString()}`).join("\n"));
process.exit(0);
