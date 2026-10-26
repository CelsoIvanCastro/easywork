import { describe, expect, it, vi } from "vitest";
import { sendViaBrevo } from "../src/server/brevo";

const mail = { to: "prueba@example.test", subject: "Verificar", text: "Enlace de prueba" };

describe("Correo por HTTPS para el servidor gratuito", () => {
  it("envía el remitente verificado y el texto sin usar SMTP", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 201 }));
    await sendViaBrevo(mail, "EasyWork <remitente@example.test>", "clave-de-prueba", request);
    const [url, options] = request.mock.calls[0];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(options?.headers).toMatchObject({ "api-key": "clave-de-prueba" });
    expect(JSON.parse(String(options?.body))).toMatchObject({ sender: { name: "EasyWork", email: "remitente@example.test" }, to: [{ email: mail.to }], textContent: mail.text });
    expect(options?.redirect).toBe("error");
  });
  it("no finge éxito si el proveedor rechaza y no filtra su respuesta", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response("dato-secreto", { status: 401 }));
    await expect(sendViaBrevo(mail, "a@example.test", "clave", request)).rejects.toThrow(/^Brevo rechazó el correo \(HTTP 401\)$/);
  });
  it("rechaza falta de clave y remitente inválido antes de enviar", async () => {
    const request = vi.fn<typeof fetch>();
    await expect(sendViaBrevo(mail, "a@example.test", undefined, request)).rejects.toThrow("BREVO_API_KEY");
    await expect(sendViaBrevo(mail, "sin-correo", "clave", request)).rejects.toThrow("MAIL_FROM");
    expect(request).not.toHaveBeenCalled();
  });
  it("oculta los detalles de errores de red", async () => {
    const request = vi.fn<typeof fetch>().mockRejectedValue(new Error("dato-secreto"));
    await expect(sendViaBrevo(mail, "a@example.test", "clave", request)).rejects.toThrow(/^No se pudo conectar con Brevo para enviar el correo$/);
  });
});
