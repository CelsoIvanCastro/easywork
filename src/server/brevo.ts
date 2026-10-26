import type { Mail } from "./mail";

/** HTTPS evita los puertos SMTP bloqueados en el plan gratuito de Render. */
export async function sendViaBrevo(mail: Mail, from: string, key: string | undefined, request: typeof fetch = fetch) {
  if (!key?.trim()) throw new Error("Falta BREVO_API_KEY");
  const match = from.match(/^(.*?)\s*<([^<>]+)>$/);
  const email = (match?.[2] ?? from).trim();
  if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(email)) throw new Error("MAIL_FROM no contiene un correo válido");
  const name = match?.[1].trim().replace(/^\"|\"$/g, "");
  let response: Response;
  try {
    response = await request("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": key, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ sender: { email, ...(name ? { name } : {}) }, to: [{ email: mail.to }], subject: mail.subject, textContent: mail.text }),
      signal: AbortSignal.timeout(20_000),
      redirect: "error",
    });
  } catch {
    throw new Error("No se pudo conectar con Brevo para enviar el correo");
  }
  // No incluir el cuerpo del proveedor: podría contener correos, enlaces o credenciales.
  if (!response.ok) throw new Error(`Brevo rechazó el correo (HTTP ${response.status})`);
}
