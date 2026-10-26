import { afterEach, describe, expect, it, vi } from "vitest";
const { request } = vi.hoisted(() => ({ request: vi.fn<typeof fetch>() }));
vi.mock("aws4fetch", () => ({ AwsClient: class { fetch = request; } }));
import { S3Storage, newKey } from "../src/server/storage";

afterEach(() => { request.mockReset(); vi.unstubAllEnvs(); });

function store(endpoint: string) {
  vi.stubEnv("S3_ENDPOINT", endpoint);
  vi.stubEnv("S3_BUCKET", "test-bucket");
  return new S3Storage();
}

describe("Compatibilidad de las cargas S3", () => {
  it("B2 comprueba la UUID y omite la cabecera no implementada", async () => {
    request.mockResolvedValueOnce(new Response(null, { status: 404 })).mockResolvedValueOnce(new Response(null, { status: 200 }));
    await store("https://s3.us-east-005.backblazeb2.com").put(newKey(), Buffer.from("prueba"), "text/plain");
    expect(request.mock.calls[0][1]?.method).toBe("HEAD");
    expect(request.mock.calls[1][1]?.method).toBe("PUT");
    expect(request.mock.calls[1][1]?.headers).not.toHaveProperty("if-none-match");
  });
  it("B2 rechaza una clave existente sin sobrescribirla", async () => {
    request.mockResolvedValueOnce(new Response(null, { status: 200 }));
    await expect(store("https://s3.us-east-005.backblazeb2.com").put(newKey(), Buffer.from("prueba"), "text/plain")).rejects.toThrow("ya existe");
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("los demás proveedores conservan la escritura condicional", async () => {
    request.mockResolvedValueOnce(new Response(null, { status: 412 }));
    await expect(store("https://s3.us-east-1.amazonaws.com").put(newKey(), Buffer.from("prueba"), "text/plain")).rejects.toThrow("412");
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][1]?.headers).toHaveProperty("if-none-match", "*");
  });
});
