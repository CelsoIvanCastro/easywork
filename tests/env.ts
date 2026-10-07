// Fuerza la base de pruebas. Se niega a correr contra una base cuyo nombre no termine en _test.
try { process.loadEnvFile(".env"); } catch {}
const url = process.env.TEST_DATABASE_URL ?? "";
if (!/\/[a-z0-9_]+_test(\?|$)/.test(url)) throw new Error("TEST_DATABASE_URL debe apuntar a una base *_test");
process.env.DATABASE_URL = url;
process.env.STORAGE_DIR = ".local/test-storage";
process.env.MAILBOX_DIR = ".local/test-mailbox";
process.env.AI_PROVIDER = "none";
process.env.ERASURE_LEDGER = ".local/test-erasure-ledger.jsonl";
