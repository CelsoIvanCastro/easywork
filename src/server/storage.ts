import "server-only";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { env } from "./env";

// Almacenamiento privado con interfaz mínima. Local (fuera de /public) en desarrollo; S3 compatible en producción.
export interface Storage {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
  /** Claves con antigüedad mayor a `olderThanMs` (para limpiar huérfanos). */
  listOld(olderThanMs: number): Promise<string[]>;
}

const KEY_RE = /^[a-f0-9-]{36}$/;
export const newKey = () => randomUUID();
function safeKey(key: string) {
  // Las claves las genera el servidor; aun así se validan para impedir path traversal.
  if (!KEY_RE.test(key)) throw new Error("Clave de almacenamiento inválida");
  return key;
}

class LocalStorage implements Storage {
  root = resolve(env.storageDir, "objects");
  path = (k: string) => join(this.root, safeKey(k).slice(0, 2), k);
  async put(key: string, data: Buffer) {
    const p = this.path(key);
    await mkdir(join(p, ".."), { recursive: true, mode: 0o700 });
    await writeFile(p, data, { flag: "wx", mode: 0o600 }); // wx: nunca sobrescribe
  }
  get = (key: string) => readFile(this.path(key));
  remove = (key: string) => rm(this.path(key), { force: true });
  async listOld(olderThanMs: number) {
    const out: string[] = [];
    const now = Date.now();
    for (const d of await readdir(this.root).catch(() => [] as string[])) {
      for (const f of await readdir(join(this.root, d)).catch(() => [] as string[])) {
        if (KEY_RE.test(f) && now - (await stat(join(this.root, d, f))).mtimeMs > olderThanMs) out.push(f);
      }
    }
    return out;
  }
}

export class S3Storage implements Storage {
  private isBackblaze = new URL(process.env.S3_ENDPOINT!).hostname.endsWith(".backblazeb2.com");
  private client = import("aws4fetch").then(
    ({ AwsClient }) => new AwsClient({ accessKeyId: process.env.S3_ACCESS_KEY_ID!, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!, region: process.env.S3_REGION, service: "s3" }),
  );
  private url = (k = "") => `${process.env.S3_ENDPOINT!.replace(/\/$/, "")}/${process.env.S3_BUCKET}/${k}`;
  private async call(url: string, init?: RequestInit) {
    const r = await (await this.client).fetch(url, init);
    if (!r.ok && r.status !== 404) throw new Error(`S3 respondió ${r.status}`);
    return r;
  }
  async put(key: string, data: Buffer, contentType: string) {
    const url = this.url(safeKey(key));
    if (this.isBackblaze) {
      // B2 devuelve 501 con If-None-Match en PUT. Las claves UUID nuevas se generan
      // exclusivamente en el servidor por cada versión; HEAD evita reutilizarlas por error.
      // Esta comprobación no equivale a un PUT condicional atómico.
      const existing = await this.call(url, { method: "HEAD" });
      if (existing.status !== 404) throw new Error("La clave de almacenamiento ya existe");
    }
    const headers: Record<string, string> = { "content-type": contentType };
    if (!this.isBackblaze) headers["if-none-match"] = "*";
    await this.call(url, { method: "PUT", body: new Uint8Array(data), headers });
  }
  async get(key: string) {
    const r = await this.call(this.url(safeKey(key)));
    if (r.status === 404) throw new Error("Archivo no encontrado en almacenamiento");
    return Buffer.from(await r.arrayBuffer());
  }
  async remove(key: string) {
    await this.call(this.url(safeKey(key)), { method: "DELETE" });
  }
  async listOld(olderThanMs: number) {
    const xml = await (await this.call(`${this.url()}?list-type=2&max-keys=1000`)).text();
    const cutoff = Date.now() - olderThanMs;
    return [...xml.matchAll(/<Contents>.*?<Key>(.*?)<\/Key>.*?<LastModified>(.*?)<\/LastModified>.*?<\/Contents>/gs)]
      .filter(([, k, d]) => KEY_RE.test(k) && Date.parse(d) < cutoff)
      .map(([, k]) => k);
  }
}

export const storage: Storage = env.storageDriver === "s3" ? new S3Storage() : new LocalStorage();

export async function storageHealthy(): Promise<boolean> {
  if (env.storageDriver === "s3") return storage.listOld(Number.MAX_SAFE_INTEGER).then(() => true, () => false);
  const dir = resolve(env.storageDir);
  await mkdir(dir, { recursive: true });
  const probe = join(dir, ".health");
  await writeFile(probe, "ok");
  return (await readFile(probe, "utf8")) === "ok";
}
