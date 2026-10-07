import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { env } from "./env";

export type Mail = { to: string; subject: string; text: string };

// Proveedor intercambiable. "local" guarda los mensajes en .local/mailbox (no envía nada real).
export async function sendMail(mail: Mail): Promise<void> {
  if (env.mailDriver === "smtp") {
    const { createTransport } = await import("nodemailer");
    await createTransport(process.env.SMTP_URL).sendMail({ from: env.mailFrom, ...mail });
    return;
  }
  const dir = process.env.MAILBOX_DIR ?? ".local/mailbox";
  await mkdir(dir, { recursive: true });
  const file = `${dir}/${Date.now()}-${randomUUID().slice(0, 8)}.json`;
  await writeFile(file, JSON.stringify({ ...mail, from: env.mailFrom, at: new Date().toISOString() }, null, 2), { mode: 0o600 });
  console.log(`[correo local] "${mail.subject}" guardado en ${dir}`);
}
