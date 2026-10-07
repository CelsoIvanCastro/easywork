import { useEffect, useState } from "react";
import { ChevronRight, Download, Eye } from "lucide-react";
import { DOC_TYPES } from "@shared/catalogs";
import { fetchFile, rpc, upload } from "../api";
import { isCapacitor, openBlob, pickPhoto, platformName } from "../platform";
import { href } from "../router";
import { Async, Badge, Empty, ErrorView, Form, PageHead, fmtDate, fmtDateTime, useData } from "../ui";
import { useCompany } from "./company";
import type { ApiFailure } from "../api";

type DocRow = { id: string; title: string; confidential: boolean; currentVersionNo: number; updatedAt: string; expiresOn: string | null; employee: { firstName: string; lastName: string } | null; folder: { name: string } | null };

export function Documents({ base }: { base: string }) {
  const { c } = useCompany();
  const [q, setQ] = useState("");
  const [applied, setApplied] = useState("");
  const [page, setPage] = useState(1);
  const data = useData(() => rpc<{ rows: DocRow[]; total: number; pageSize: number }>("documents.list", { q: applied || undefined, page }, c.id), [c.id, applied, page]);
  return (
    <>
      <PageHead title="Documentos" description="Repositorio privado con versiones e historial." />
      <form className="filters" role="search" onSubmit={(e) => { e.preventDefault(); setPage(1); setApplied(q); }}>
        <label>Buscar por título<input type="search" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <div><button>Buscar</button></div>
      </form>
      <Async q={data}>
        {(d) => (
          <>
            {d.rows.length ? (
              <ol className="agenda">
                {d.rows.map((x) => (
                  <li key={x.id}>
                    <a href={href(`${base}/documentos/${x.id}`)}>
                      <span className="folio" translate="no">v{x.currentVersionNo}</span>
                      <span className="what"><span>{x.title} {x.confidential && <Badge tone="warn">Confidencial</Badge>}</span><small>{x.employee ? `Expediente: ${x.employee.firstName} ${x.employee.lastName}` : x.folder?.name ?? "Sin carpeta"}{x.expiresOn ? ` · vence ${fmtDate(x.expiresOn)}` : ""}</small></span>
                      <ChevronRight className="icon go" aria-hidden="true" />
                    </a>
                  </li>
                ))}
              </ol>
            ) : <Empty title="Sin documentos visibles" />}
            <nav className="pager">{page > 1 && <button className="secondary" onClick={() => setPage(page - 1)}>Anterior</button>}<span className="muted">{d.total} resultado(s)</span>{page * d.pageSize < d.total && <button className="secondary" onClick={() => setPage(page + 1)}>Siguiente</button>}</nav>
          </>
        )}
      </Async>
    </>
  );
}

type Ver = { id: string; number: number; author: string; createdAt: string; size: number; mime: string; scanStatus: "CLEAN" | "UNSCANNED" | "PENDING" | "INFECTED"; purgedAt: string | null; originalName: string; restoredFrom: number | null };
type Doc = { doc: { id: string; title: string; docType: string | null; currentVersionNo: number; versionCount: number; expiresOn: string | null; archivedAt: string | null; employeeId: string | null; effectiveConfidential: boolean }; versions: Ver[]; can: { preview: boolean; download: boolean; version: boolean } };
const SCAN = { CLEAN: ["Analizado", "ok"], UNSCANNED: ["Sin analizar", "warn"], PENDING: ["En cuarentena", "bad"], INFECTED: ["Bloqueado", "bad"] } as const;
const readable = (v: Ver) => !v.purgedAt && (v.scanStatus === "CLEAN" || v.scanStatus === "UNSCANNED");

export function DocumentView({ id, base }: { id: string; base: string }) {
  const { c } = useCompany();
  const q = useData(() => rpc<Doc>("documents.get", { id }, c.id), [c.id, id]);
  const [preview, setPreview] = useState<{ url: string; mime: string } | null>(null);
  const [err, setErr] = useState<ApiFailure | null>(null);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);
  const open = async (v: Ver, download: boolean) => {
    setErr(null);
    try {
      const blob = await fetchFile(c.id, v.id, download);
      // Android WebView no muestra PDF: se abre con la app del sistema mediante compartir.
      if (download || (v.mime === "application/pdf" && platformName === "android")) return openBlob(blob, v.originalName);
      setPreview({ url: URL.createObjectURL(blob), mime: v.mime });
    } catch (e) {
      setErr(e as ApiFailure);
    }
  };
  return (
    <Async q={q}>
      {(d) => {
        const current = d.versions.find((v) => v.number === d.doc.currentVersionNo);
        return (
          <>
            <PageHead back={{ to: d.doc.employeeId ? `${base}/personal/${d.doc.employeeId}` : `${base}/documentos`, label: d.doc.employeeId ? "Expediente" : "Documentos" }} title={d.doc.title}
              status={<>{d.doc.effectiveConfidential && <Badge tone="warn">Confidencial</Badge>}{current && <Badge tone={SCAN[current.scanStatus][1]}>{SCAN[current.scanStatus][0]}</Badge>}</>}
              actions={current && readable(current) ? <>{d.can.preview && <button className="secondary" onClick={() => open(current, false)}><Eye className="icon" aria-hidden="true" />Ver</button>}{d.can.download && <button className="secondary" onClick={() => open(current, true)}><Download className="icon" aria-hidden="true" />{isCapacitor ? "Abrir o compartir" : "Descargar"}</button>}</> : undefined} />
            {current?.scanStatus === "PENDING" && <p className="msg warn">En cuarentena hasta completar el análisis antimalware: aún no se puede abrir.</p>}
            {err && <ErrorView error={err} />}
            {preview && (
              <section className="card">
                <div className="panel-title"><h2>Vista previa</h2><button className="secondary" onClick={() => setPreview(null)}>Cerrar</button></div>
                <p className="small muted">La vista previa no impide copiar lo que se muestra.</p>
                {preview.mime.startsWith("image/") ? <img src={preview.url} alt={`Vista previa de ${d.doc.title}`} style={{ maxWidth: "100%" }} /> : <iframe src={preview.url} title={`Vista previa de ${d.doc.title}`} style={{ width: "100%", height: "70vh", border: "1px solid var(--line)" }} />}
              </section>
            )}
            <dl className="kv card"><dt>Tipo</dt><dd>{d.doc.docType ? DOC_TYPES[d.doc.docType as keyof typeof DOC_TYPES] : "—"}</dd><dt>Versión vigente</dt><dd>v{d.doc.currentVersionNo} de {d.doc.versionCount}</dd><dt>Vence</dt><dd>{fmtDate(d.doc.expiresOn)}</dd></dl>
            <section className="card">
              <h2>Versiones</h2>
              <ul className="stack" style={{ listStyle: "none", padding: 0, maxWidth: "none", gap: 8 }}>
                {d.versions.map((v) => (
                  <li key={v.id} className="spread" style={{ borderBottom: "1px solid var(--line)", paddingBottom: 8 }}>
                    <span><span className="folio" translate="no">v{v.number}</span> {v.number === d.doc.currentVersionNo && <Badge tone="ok">Vigente</Badge>} {v.author} · {fmtDateTime(v.createdAt, c.timezone)} · {Math.ceil(v.size / 1024)} KB {v.restoredFrom && <span className="small muted">restaurada de v{v.restoredFrom}</span>}</span>
                    <span className="row">
                      {readable(v) && d.can.download && <button className="secondary" onClick={() => open(v, true)}>Descargar</button>}
                      {d.can.version && v.number !== d.doc.currentVersionNo && readable(v) && !d.doc.archivedAt && <button className="secondary" onClick={async () => { await rpc("documents.restore", { id, number: v.number }, c.id); q.reload(); }}>Restaurar</button>}
                      {v.purgedAt && <span className="small muted">Eliminado por retención</span>}
                    </span>
                  </li>
                ))}
              </ul>
              {d.can.version && !d.doc.archivedAt && <NewVersion id={id} onDone={q.reload} />}
            </section>
          </>
        );
      }}
    </Async>
  );
}

function NewVersion({ id, onDone }: { id: string; onDone: () => void }) {
  const { c } = useCompany();
  const [file, setFile] = useState<File | null>(null);
  return (
    <>
      <h3>Reemplazar (nueva versión)</h3>
      {isCapacitor && <p><button type="button" className="secondary" onClick={async () => setFile(await pickPhoto("camera"))}>Tomar foto</button></p>}
      <Form submit="Subir nueva versión" onSubmit={async (f) => {
        const chosen = file ?? (f.get("file") as File);
        if (!chosen || !chosen.size) throw { error: { code: "VALIDATION", message: "Elige un archivo." } };
        const form = new FormData();
        form.set("companyId", c.id);
        form.set("documentId", id);
        form.set("file", chosen);
        await upload(form);
        setFile(null);
        onDone();
        return "Nueva versión guardada; la anterior se conserva.";
      }}>
        {file ? <p className="small">{file.name} listo para subir</p> : <label>Archivo<input name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*" /></label>}
      </Form>
    </>
  );
}
