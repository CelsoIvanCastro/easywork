import { defineConfig } from "prisma/config";

try { process.loadEnvFile(".env"); } catch {}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx scripts/seed.ts" },
  datasource: { url: process.env.MIGRATE_DATABASE_URL },
});
