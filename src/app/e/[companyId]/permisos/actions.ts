"use server";
import * as c from "@/server/services/companies";
import { getCtx, run, type ActionResult } from "@/server/web";

type A = (prev: ActionResult | null, f: FormData) => Promise<ActionResult>;
const ctx = (f: FormData) => getCtx(String(f.get("c")));
const path = (f: FormData) => `/e/${f.get("c")}/permisos`;

export const fullAccessAction: A = async (_, f) =>
  run(async () => c.setFullAccess(await ctx(f), String(f.get("membershipId")), f.get("enabled") === "1"), "Acceso completo actualizado.", path(f));
export const addGrantAction: A = async (_, f) =>
  run(
    async () =>
      c.addGrant(await ctx(f), {
        subjectType: String(f.get("subject")).split(":")[0],
        subjectId: String(f.get("subject")).split(":")[1],
        permission: f.get("permission"),
        effect: f.get("effect"),
        scope: f.get("scope"),
        scopeDepartmentIds: f.getAll("scopeDepartmentIds").map(String),
      }),
    "Concesión guardada. Surte efecto en la siguiente solicitud de la persona.",
    path(f),
  );
export const removeGrantAction: A = async (_, f) => run(async () => c.removeGrant(await ctx(f), String(f.get("grantId"))), "Concesión retirada.", path(f));
