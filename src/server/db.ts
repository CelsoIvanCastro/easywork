import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "@/generated/prisma/client";
import { env } from "./env";

// Sesión en UTC: las columnas timestamp guardan UTC y now() debe coincidir.
const g = globalThis as unknown as { prisma?: PrismaClient };
export const db = g.prisma ?? new PrismaClient({ adapter: new PrismaPg({ connectionString: env.databaseUrl, options: "-c TimeZone=UTC" }) });
if (!env.isProd) g.prisma = db;

export type Tx = Prisma.TransactionClient;
export { Prisma };
export const Decimal = Prisma.Decimal;
export type Decimal = Prisma.Decimal;
