"use server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { requireUser, run, type ActionResult } from "@/server/web";

const profile = z.object({
  name: z.string().trim().min(1, "Requerido").max(80),
  lastName: z.string().trim().min(1, "Requerido").max(120),
  phone: z.string().trim().regex(/^[0-9+ ()-]{8,20}$/, "Teléfono inválido"),
});

// Solo cambia el perfil global. Los expedientes de cada empresa son copias laborales y no se reescriben.
export async function updateProfile(_: ActionResult | null, f: FormData) {
  return run(async () => {
    await requireUser();
    const data = profile.parse(Object.fromEntries(f));
    await auth.api.updateUser({ body: data as never, headers: await headers() });
  }, "Perfil actualizado. Los expedientes de tus empresas no cambian automáticamente.", "/cuenta");
}

// Por id y limitado a las sesiones propias: los tokens nunca llegan al navegador.
export async function revokeSession(_: ActionResult | null, f: FormData) {
  return run(async () => {
    const s = await requireUser();
    await db.session.deleteMany({ where: { id: String(f.get("id")), userId: s.user.id } });
  }, "Sesión cerrada.", "/cuenta");
}

export async function revokeOthers(_: ActionResult | null) {
  return run(async () => {
    await requireUser();
    await auth.api.revokeOtherSessions({ headers: await headers() });
  }, "Se cerraron las demás sesiones.", "/cuenta");
}

export async function photoAction(_: ActionResult | null, f: FormData) {
  const { setProfilePhoto } = await import("@/server/services/images");
  return run(async () => {
    const s = await requireUser();
    await setProfilePhoto(s.user.id, f.get("file") as File);
  }, "Fotografía actualizada.", "/cuenta");
}

export async function deleteAccountAction(_: ActionResult | null, f: FormData) {
  const { deleteAccount } = await import("@/server/services/accounts");
  const r = await run(async () => {
    const s = await requireUser();
    await deleteAccount(s.user.id, { id: s.session.id, reauthAt: (s.session as { reauthAt?: Date | null }).reauthAt ?? null, twoFactorEnabled: !!s.user.twoFactorEnabled }, String(f.get("confirm") ?? ""));
  }, "Tu cuenta fue eliminada.");
  if (r.ok) {
    const { redirect } = await import("next/navigation");
    redirect("/entrar?eliminada=1");
  }
  return r;
}
