import Link from "next/link";
import { getCtx, load } from "@/server/web";
import { getDocument, listFolders } from "@/server/services/documents";
import { ACCEPT } from "@/server/files";
import { DOC_TYPES } from "@/lib/catalogs";
import { ActionForm, Field, Select } from "@/components/ActionForm";
import { Badge, PageHead, fmtCivil, fmtDateTime } from "@/components/ui";
import * as A from "../actions";

const SCAN = { CLEAN: ["Analizado", "ok"], UNSCANNED: ["Sin analizar (analizador no configurado)", "warn"], PENDING: ["En cuarentena", "warn"], INFECTED: ["Bloqueado", "bad"] } as const;

export default async function Documento({ params }: { params: Promise<{ companyId: string; id: string }> }) {
  const { companyId, id } = await params;
  const ctx = await getCtx(companyId);
  const { doc, versions, history, can } = await load(getDocument(ctx, id));
  const tz = ctx.company.timezone;
  const folders = can.manage ? await listFolders(ctx) : [];
  const current = versions.find((v) => v.number === doc.currentVersionNo);
  const file = (vid: string, mode: string) => `/api/archivos/${companyId}/${vid}${mode === "d" ? "?modo=descargar" : ""}`;
  const h = (<><input type="hidden" name="c" value={companyId} /><input type="hidden" name="id" value={id} /></>);
  const back = doc.employeeId ? `/e/${companyId}/personal/${doc.employeeId}?tab=documentos` : `/e/${companyId}/documentos`;
  return (
    <>
      <PageHead
        back={{ href: back, label: doc.employeeId ? "Expediente" : "Documentos" }}
        title={doc.title}
        status={<>{doc.effectiveConfidential && <Badge tone="warn">Confidencial</Badge>}{doc.archivedAt && <Badge>Archivado</Badge>}{current && (current.scanStatus === "PENDING" || current.scanStatus === "INFECTED") && <Badge tone="bad">{SCAN[current.scanStatus][0]}</Badge>}</>}
        actions={current && can.download && !current.purgedAt && (current.scanStatus === "CLEAN" || current.scanStatus === "UNSCANNED") ? <a className="btn secondary" href={file(current.id, "d")}>Descargar vigente</a> : undefined}
      />
      {current?.scanStatus === "PENDING" && <p className="msg warn" role="status">Este archivo está en cuarentena: no se puede ver ni descargar hasta que termine el análisis antimalware.</p>}
      <dl className="kv card" style={{ marginTop: 0 }}>
        <dt>Tipo</dt><dd>{doc.docType ? DOC_TYPES[doc.docType as keyof typeof DOC_TYPES] : doc.category ?? "—"}</dd>
        <dt>Versión vigente</dt><dd>v{doc.currentVersionNo} de {doc.versionCount}</dd>
        <dt>Vence</dt><dd>{fmtCivil(doc.expiresOn)}</dd>
      </dl>
      {current && can.preview && (current.scanStatus === "CLEAN" || current.scanStatus === "UNSCANNED") && !current.purgedAt && (
        <section className="card">
          <h2>Vista previa</h2>
          <p className="small muted">La vista previa no impide copiar lo que se muestra en pantalla.</p>
          {current.mime.startsWith("image/") ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={file(current.id, "p")} alt={`Vista previa de ${doc.title}`} style={{ maxWidth: "100%", height: "auto" }} />
          ) : (
            <iframe src={file(current.id, "p")} title={`Vista previa de ${doc.title}`} style={{ width: "100%", height: "70vh", border: "1px solid var(--line)" }} />
          )}
        </section>
      )}
      <section className="card">
        <h2>Versiones</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Versión</th><th>Autor</th><th>Fecha</th><th>Tamaño</th><th>Análisis</th><th>Acciones</th></tr></thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v.id}>
                  <td>v{v.number}{v.number === doc.currentVersionNo && " (vigente)"}{v.restoredFrom && <span className="small muted"> restaurada de v{v.restoredFrom}</span>}</td>
                  <td>{v.author}</td>
                  <td>{fmtDateTime(v.createdAt, tz)}</td>
                  <td>{Math.ceil(v.size / 1024)} KB</td>
                  <td><Badge tone={SCAN[v.scanStatus][1]}>{SCAN[v.scanStatus][0]}</Badge></td>
                  <td className="row">
                    {v.purgedAt ? <span className="muted">Archivo eliminado por retención</span> : (
                      <>
                        {can.download && <a href={file(v.id, "d")}>Descargar</a>}
                        {can.version && v.number !== doc.currentVersionNo && !doc.archivedAt && (
                          <ActionForm action={A.restoreAction} submit="Restaurar como vigente" className="">{h}<input type="hidden" name="number" value={v.number} /></ActionForm>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {can.version && !doc.archivedAt && (
          <>
            <h3>Reemplazar (nueva versión)</h3>
            <p className="small muted">La versión anterior se conserva.</p>
            <ActionForm action={A.versionAction} submit="Subir nueva versión" reset>
              {h}
              <Field label="Archivo" name="file" type="file" accept={ACCEPT} required />
            </ActionForm>
          </>
        )}
      </section>
      {(can.manage || can.version) && (
        <section className="card">
          <h2>Gestión</h2>
          <ActionForm action={A.archiveAction} submit={doc.archivedAt ? "Desarchivar" : "Archivar"} className="" confirm={doc.archivedAt ? undefined : "Archivar retira el documento de las vistas normales; su historial se conserva."}>
            {h}<input type="hidden" name="archived" value={doc.archivedAt ? "0" : "1"} />
          </ActionForm>
          {can.manage && (
            <ActionForm action={A.moveAction} submit="Mover">
              {h}
              <Select label="Mover a carpeta" name="folderId" options={[["", "Sin carpeta"], ...folders.map((f) => [f.id, f.name] as [string, string])]} defaultValue={doc.folderId ?? ""} />
              <p className="small muted">Mover nunca amplía el acceso: si estaba en una carpeta confidencial, sigue siendo confidencial.</p>
            </ActionForm>
          )}
          {can.manage && (
            <ActionForm action={A.confidentialAction} submit="Guardar confidencialidad">
              {h}
              <label className="inline"><input type="checkbox" name="confidential" defaultChecked={doc.confidential} /> Confidencial</label>
            </ActionForm>
          )}
        </section>
      )}
      {history.length > 0 && (
        <section className="card">
          <h2>Historial</h2>
          <ul>{history.map((x) => <li key={x.id}>{fmtDateTime(x.createdAt, tz)} · {x.actorLabel} · {x.action}{x.summary ? ` — ${x.summary}` : ""}</li>)}</ul>
        </section>
      )}
    </>
  );
}
