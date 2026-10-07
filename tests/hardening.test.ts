import { afterEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:net";
import { db } from "@/server/db";
import { env } from "@/server/env";
import * as docs from "@/server/services/documents";
import { claim, rescanPending, runJob } from "@/server/jobs";
import { storage } from "@/server/storage";
import { ipFrom } from "@/server/web";
import { expectError, makeCompany, pdfFile } from "./helpers";

const fakeClamd = (reply: string) =>
  new Promise<Server>((resolve) => {
    const s = createServer((sock) => {
      sock.on("data", (d) => {
        // Fin del flujo INSTREAM: bloque de longitud cero.
        if ((d as Buffer).subarray(-4).readUInt32BE(0) === 0) sock.end(reply);
      });
    });
    s.listen(0, "127.0.0.1", () => resolve(s));
  });

describe("análisis obligatorio de archivos", () => {
  const saved = { scan: env.fileScan, req: env.fileScanRequired, port: process.env.CLAMAV_PORT };
  afterEach(() => {
    env.fileScan = saved.scan;
    env.fileScanRequired = saved.req;
    process.env.CLAMAV_PORT = saved.port;
  });

  it("analizador caído → cuarentena sin descarga; al volver, el worker lo libera (también versiones antiguas)", async () => {
    const { ctx } = await makeCompany("Scan1");
    env.fileScan = "clamav";
    env.fileScanRequired = true;
    process.env.CLAMAV_PORT = "1"; // nadie escucha
    const d = await docs.uploadDocument(ctx, { title: "Contrato" }, pdfFile("c.pdf", "v1"));
    const v = await db.documentVersion.findFirstOrThrow({ where: { documentId: d.id } });
    expect(v.scanStatus).toBe("PENDING");
    await expectError(docs.readVersion(ctx, v.id, "download"), "VALIDATION");
    await expectError(docs.readVersion(ctx, v.id, "preview"), "VALIDATION");
    const ok = await fakeClamd("stream: OK\0");
    process.env.CLAMAV_PORT = String((ok.address() as { port: number }).port);
    await rescanPending();
    ok.close();
    expect((await db.documentVersion.findUniqueOrThrow({ where: { id: v.id } })).scanStatus).toBe("CLEAN");
    expect((await docs.readVersion(ctx, v.id, "download")).data.length).toBeGreaterThan(0);
  });

  it("infectado se rechaza al subir; sin analizador y no obligatorio queda visible como sin analizar; obligatorio bloquea UNSCANNED", async () => {
    const { ctx } = await makeCompany("Scan2");
    env.fileScan = "clamav";
    const bad = await fakeClamd("stream: Eicar-Test-Signature FOUND\0");
    process.env.CLAMAV_PORT = String((bad.address() as { port: number }).port);
    await expectError(docs.uploadDocument(ctx, { title: "virus" }, pdfFile()), "VALIDATION");
    bad.close();
    env.fileScan = "off";
    env.fileScanRequired = false;
    const d = await docs.uploadDocument(ctx, { title: "sin analizar" }, pdfFile());
    const v = await db.documentVersion.findFirstOrThrow({ where: { documentId: d.id } });
    expect(v.scanStatus).toBe("UNSCANNED");
    env.fileScanRequired = true;
    await expectError(docs.readVersion(ctx, v.id, "download"), "VALIDATION");
  });
});

describe("proxy y borrado durable", () => {
  it("X-Forwarded-For inventado por el cliente no sustituye la IP añadida por el proxy", () => {
    const h = new Headers({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" });
    expect(ipFrom(h, "x-forwarded-for")).toBe("203.0.113.9");
    expect(ipFrom(new Headers({ "x-real-ip": "198.51.100.4", "x-forwarded-for": "6.6.6.6" }), "x-real-ip")).toBe("198.51.100.4");
  });

  it("el borrado de archivos se encola y es idempotente", async () => {
    const key = (await import("node:crypto")).randomUUID();
    await storage.remove(key);
    await storage.put(key, Buffer.from("x"), "application/pdf");
    await docs.scheduleFileDeletion([key]);
    await docs.scheduleFileDeletion([key]);
    expect(await db.job.count({ where: { dedupeKey: `storage.delete:${key}` } })).toBe(1);
    let job = await claim("t");
    while (job && (job.payload as { key?: string }).key !== key) {
      await runJob(job).catch(() => {});
      job = await claim("t");
    }
    await runJob(job!);
    await expect(storage.get(key)).rejects.toThrow();
  });
});
