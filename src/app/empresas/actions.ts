"use server";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import * as companies from "@/server/services/companies";
import { clientIp, requireUser, run, fd, type ActionResult } from "@/server/web";

export async function createCompanyAction(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  let id = "";
  const r = await run(async () => {
    const s = await requireUser();
    const u = await db.user.findUniqueOrThrow({ where: { id: s.user.id } });
    id = (await companies.createCompany(u, fd(f))).id;
  });
  if (r.ok) redirect(`/e/${id}`);
  return r;
}

export async function lookupAction(_: ActionResult | null, f: FormData) {
  return run(async () => {
    const s = await requireUser();
    return companies.lookupJoinCode(s.user.id, await clientIp(), String(f.get("code") ?? ""));
  }, "Empresa encontrada.");
}

export async function joinAction(_: ActionResult | null, f: FormData) {
  return run(async () => {
    const s = await requireUser();
    await companies.requestJoin(s.user.id, await clientIp(), String(f.get("code") ?? ""), String(f.get("message") ?? ""));
  }, "Solicitud enviada. La empresa la revisará.", "/empresas");
}

export async function cancelRequestAction(_: ActionResult | null, f: FormData) {
  return run(async () => {
    const s = await requireUser();
    await companies.cancelMyRequest(s.user.id, String(f.get("id")));
  }, "Solicitud cancelada.", "/empresas");
}

export async function acceptTransferAction(_: ActionResult | null, f: FormData) {
  const { acceptTransfer } = await import("@/server/services/accounts");
  return run(async () => {
    const s = await requireUser();
    await acceptTransfer(s.user.id, { id: s.session.id, reauthAt: (s.session as { reauthAt?: Date | null }).reauthAt ?? null, twoFactorEnabled: !!s.user.twoFactorEnabled }, String(f.get("id")));
  }, "Ahora eres el propietario de la empresa.", "/empresas");
}
