"use server";
import * as n from "@/server/services/notifications";
import { getCtx, run, type ActionResult } from "@/server/web";

type A = (prev: ActionResult | null, f: FormData) => Promise<ActionResult>;
const ctx = (f: FormData) => getCtx(String(f.get("c")));
const path = (f: FormData) => `/e/${f.get("c")}/notificaciones`;

export const opAction: A = async (_, f) => run(async () => n.updateNotification(await ctx(f), String(f.get("id")), String(f.get("op")) as "read"), "Listo.", path(f));
export const allReadAction: A = async (_, f) => run(async () => n.markAllRead(await ctx(f)), "Todas marcadas como leídas.", path(f));
export const prefsAction: A = async (_, f) => {
  const all = Object.keys(n.ALERT_TYPES);
  const on = new Set(f.getAll("on").map(String));
  return run(async () => n.setMutedTypes(await ctx(f), all.filter((t) => !on.has(t))), "Preferencias guardadas.", path(f));
};
