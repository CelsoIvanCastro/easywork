import { useState } from "react";
import { Camera, ChevronRight, FileUp, Image as ImageIcon } from "lucide-react";
import { DOC_TYPES, EMPLOYEE_STATUS, TERMINATION_REASONS } from "@shared/catalogs";
import { rpc, upload } from "../api";
import { isCapacitor, pickPhoto } from "../platform";
import { href } from "../router";
import { Async, Badge, Empty, Form, PageHead, fmtDate, fmtDateTime, useData } from "../ui";
import { useCompany } from "./company";

type Row = { id: string; number: string; firstName: string; lastName: string; status: keyof typeof EMPLOYEE_STATUS; department: { name: string } | null; position: { title: string } | null; hireDate: string | null };
type Page<T> = { rows: T[]; total: number; page: number; pageSize: number; restricted?: boolean };
const tone = (s: string) => (s === "ACTIVE" ? "ok" : s === "FORMER" ? undefined : "warn");

export function People({ base, former }: { base: string; former: boolean }) {
  const { c } = useCompany();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [applied, setApplied] = useState("");
  const data = useData(() => rpc<Page<Row>>("employees.list", { view: former ? "former" : "active", q: applied || undefined, page }, c.id), [c.id, former, applied, page]);
  return (
    <>
      <PageHead title={former ? "Exempleados" : "Personal activo"} description={former ? "Sus expedientes e historial se conservan." : undefined} actions={<a className="btn secondary" href={href(`${base}/personal${former ? "" : "?view=former"}`)}>{former ? "Ver activos" : "Ver exempleados"}</a>} />
      <form className="filters" role="search" onSubmit={(e) => { e.preventDefault(); setPage(1); setApplied(q); }}>
        <label>Buscar<input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre, folio o correo" /></label>
        <div><button>Buscar</button></div>
      </form>
      <Async q={data}>
        {(d) => (
          <>
            {d.restricted && <p className="msg info">No tienes permiso para buscar por datos personales sensibles.</p>}
            {d.rows.length ? (
              <ol className="agenda">
                {d.rows.map((e) => (
                  <li key={e.id}>
                    <a href={href(`${base}/personal/${e.id}`)}>
                      <span className="folio" translate="no">{e.number}</span>
                      <span className="what"><span>{e.firstName} {e.lastName}</span><small>{[e.position?.title, e.department?.name].filter(Boolean).join(" · ") || "Sin puesto"}</small></span>
                      <Badge tone={tone(e.status)}>{EMPLOYEE_STATUS[e.status]}</Badge>
                    </a>
                  </li>
                ))}
              </ol>
            ) : <Empty title="Sin resultados" />}
            <nav className="pager" aria-label="Paginación">
              {page > 1 && <button className="secondary" onClick={() => setPage(page - 1)}>Anterior</button>}
              <span className="muted">{d.total} resultado(s)</span>
              {page * d.pageSize < d.total && <button className="secondary" onClick={() => setPage(page + 1)}>Siguiente</button>}
            </nav>
          </>
        )}
      </Async>
    </>
  );
}

type Emp = {
  access: Record<string, boolean>;
  employee: { id: string; number: string; firstName: string; lastName: string; email: string | null; status: string; hireDate: string | null; version: number; isOwnerRecord: boolean; anonymizedAt: string | null };
  department: { name: string } | null; position: { title: string } | null; supervisors: { name: string }[];
  personal: Record<string, string | null> | null; revealed: boolean;
  periods: { id: string; number: number; startDate: string; endDate: string | null; terminationReason: string | null }[];
  assignments: { id: string; startedAt: string; endedAt: string | null; department: { name: string } | null; position: { title: string } | null; reason: string | null }[];
  bank: { id: string; holderName: string; masked: string; bankName: string | null; bankCode: string; isCurrent: boolean }[];
  documents: { id: string; title: string; docType: string | null; currentVersionNo: number; expiresOn: string | null }[];
  missing: string[]; required: string[];
};

export function Person({ id, base }: { id: string; base: string }) {
  const { c } = useCompany();
  const [reveal, setReveal] = useState(false);
  const [tab, setTab] = useState("datos");
  const q = useData(() => rpc<Emp>("employees.get", { id, reveal }, c.id), [c.id, id, reveal]);
  return (
    <Async q={q}>
      {(x) => {
        const e = x.employee, a = x.access;
        const tabs: [string, string][] = [["datos", "Datos"], ...(a.docsView ? [["documentos", "Documentos"] as [string, string]] : []), ["historial", "Historial"], ...(a.bankRead ? [["banco", "Banco"] as [string, string]] : []), ...(a.offboard ? [["estado", "Estado y baja"] as [string, string]] : [])];
        return (
          <>
            <PageHead back={c.can["employees.read"] ? { to: `${base}/personal`, label: "Personal" } : undefined} title={`${e.firstName} ${e.lastName}`} folio={e.number} status={<Badge tone={tone(e.status)}>{EMPLOYEE_STATUS[e.status as keyof typeof EMPLOYEE_STATUS]}</Badge>} description={[x.position?.title, x.department?.name].filter(Boolean).join(" · ") || "Sin puesto asignado"} />
            {x.missing.length > 0 && (
              <details className="msg info" style={{ display: "block" }}>
                <summary>Expediente incompleto: faltan {x.missing.length} de {x.required.length}</summary>
                <ul>{x.missing.map((m) => <li key={m}>{m}</li>)}</ul>
              </details>
            )}
            <div className="tabs" role="tablist">
              {tabs.map(([k, l]) => <a key={k} role="tab" href="#" aria-selected={tab === k} aria-current={tab === k ? "page" : undefined} onClick={(ev) => { ev.preventDefault(); setTab(k); }}>{l}</a>)}
            </div>
            {tab === "datos" && (
              <>
                <section className="card">
                  <h2>Datos laborales</h2>
                  <dl className="kv">
                    <dt>Departamento</dt><dd>{x.department?.name ?? "—"}</dd>
                    <dt>Puesto</dt><dd>{x.position?.title ?? "—"}</dd>
                    <dt>Supervisor(es)</dt><dd>{x.supervisors.map((s) => s.name).join(", ") || "—"}</dd>
                    <dt>Ingreso</dt><dd>{fmtDate(e.hireDate)}</dd>
                    <dt>Correo</dt><dd>{e.email ?? "—"}</dd>
                  </dl>
                </section>
                <section className="card">
                  <div className="panel-title"><h2>Datos personales</h2>{x.personal && !x.revealed && <button className="secondary" onClick={() => setReveal(true)}>Mostrar completos</button>}</div>
                  {x.personal ? (
                    <>
                      {!x.revealed && <p className="small muted">Ocultos por privacidad. Mostrarlos queda registrado en la auditoría.</p>}
                      <dl className="kv">
                        <dt>Nacimiento</dt><dd>{fmtDate(x.personal.birthDate)}</dd>
                        <dt>Teléfono</dt><dd>{x.personal.phone ?? "—"}</dd>
                        <dt>CURP</dt><dd>{x.personal.curp ?? "—"}</dd>
                        <dt>RFC</dt><dd>{x.personal.rfc ?? "—"}</dd>
                        <dt>NSS</dt><dd>{x.personal.nss ?? "—"}</dd>
                        <dt>Domicilio</dt><dd>{x.personal.address ?? "—"}</dd>
                      </dl>
                      {a.personalEdit && x.revealed && (
                        <details className="disclosure">
                          <summary>{a.self ? "Completar mis datos" : "Editar datos personales"}</summary>
                          <Form submit="Guardar" onSubmit={async (f) => { await rpc("employees.updatePersonal", { id, version: e.version, data: Object.fromEntries(f) }, c.id); q.reload(); return "Datos guardados."; }}>
                            <label>Fecha de nacimiento<input name="birthDate" type="date" defaultValue={x.personal.birthDate?.slice(0, 10) ?? ""} /></label>
                            <label>Teléfono<input name="phone" type="tel" inputMode="tel" defaultValue={x.personal.phone ?? ""} /></label>
                            <label>CURP<input name="curp" maxLength={18} autoCapitalize="characters" defaultValue={x.personal.curp ?? ""} /></label>
                            <label>RFC<input name="rfc" maxLength={13} autoCapitalize="characters" defaultValue={x.personal.rfc ?? ""} /></label>
                            <label>NSS<input name="nss" maxLength={11} inputMode="numeric" defaultValue={x.personal.nss ?? ""} /></label>
                            <label>Domicilio<textarea name="address" maxLength={400} defaultValue={x.personal.address ?? ""} /></label>
                          </Form>
                        </details>
                      )}
                    </>
                  ) : <p className="muted">No tienes permiso para ver estos datos.</p>}
                </section>
              </>
            )}
            {tab === "documentos" && <PersonDocs x={x} base={base} reload={q.reload} />}
            {tab === "historial" && (
              <section className="card">
                <h2>Periodos laborales</h2>
                <ul>{x.periods.map((p) => <li key={p.id}>#{p.number}: {fmtDate(p.startDate)} → {p.endDate ? fmtDate(p.endDate) : "vigente"}{p.terminationReason && ` · ${TERMINATION_REASONS[p.terminationReason as keyof typeof TERMINATION_REASONS]}`}</li>)}</ul>
                <h3>Puestos</h3>
                <ul>{x.assignments.map((h) => <li key={h.id}>{fmtDateTime(h.startedAt, c.timezone)}: {h.position?.title ?? "sin puesto"} · {h.department?.name ?? "sin departamento"}</li>)}</ul>
              </section>
            )}
            {tab === "banco" && (
              <section className="card">
                <h2>Información bancaria</h2>
                <p className="small muted">Se valida la estructura de la CLABE; eso no confirma la titularidad.</p>
                {x.bank.length ? <ul>{x.bank.map((b) => <li key={b.id}>{b.isCurrent ? <Badge tone="ok">Vigente</Badge> : <Badge>Anterior</Badge>} {b.holderName} · {b.masked} · {b.bankName ?? `Banco ${b.bankCode}`} <Reveal bankId={b.id} /></li>)}</ul> : <Empty>Sin cuenta registrada.</Empty>}
              </section>
            )}
            {tab === "estado" && a.offboard && (
              <section className="card danger-zone">
                <h2>Estado y baja</h2>
                {e.status !== "FORMER" ? (
                  <>
                    <p className="small">Dar de baja retirará el acceso a esta empresa y conservará el expediente, documentos e historial.</p>
                    <Form submit="Dar de baja" danger confirm="¿Confirmas la baja?" onSubmit={async (f) => { await rpc("employees.terminate", { id, data: Object.fromEntries(f) }, c.id); q.reload(); return "Baja registrada."; }}>
                      <label>Fecha de baja<input name="date" type="date" required /></label>
                      <label>Motivo<select name="reason" required defaultValue=""><option value="" disabled>Elige…</option>{Object.entries(TERMINATION_REASONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                      <label>Notas<textarea name="notes" maxLength={2000} /></label>
                    </Form>
                  </>
                ) : !e.anonymizedAt && (
                  <Form submit="Recontratar" onSubmit={async (f) => { await rpc("employees.rehire", { id, data: Object.fromEntries(f) }, c.id); q.reload(); return "Recontratación registrada."; }}>
                    <p className="small">Crea un nuevo periodo laboral; no restaura permisos anteriores.</p>
                    <label>Fecha de reingreso<input name="date" type="date" required /></label>
                  </Form>
                )}
              </section>
            )}
          </>
        );
      }}
    </Async>
  );
}

function Reveal({ bankId }: { bankId: string }) {
  const { c } = useCompany();
  const [v, setV] = useState<string | null>(null);
  return v ? <code> {v}</code> : <button className="secondary" onClick={async () => setV((await rpc<{ clabe: string }>("employees.revealClabe", { bankId }, c.id)).clabe)}>Mostrar CLABE</button>;
}

function PersonDocs({ x, base, reload }: { x: Emp; base: string; reload: () => void }) {
  const { c } = useCompany();
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const take = async (src: "camera" | "photos") => {
    const f = await pickPhoto(src);
    if (f) setFile(f);
    else setNote("No se obtuvo la foto (cancelada o sin permiso). Puedes elegir un archivo.");
  };
  return (
    <section className="card">
      <h2>Documentos</h2>
      {x.documents.length ? (
        <ol className="agenda">
          {x.documents.map((d) => (
            <li key={d.id}><a href={href(`${base}/documentos/${d.id}`)}><span className="folio" translate="no">v{d.currentVersionNo}</span><span className="what"><span>{d.title}</span><small>{d.docType ? DOC_TYPES[d.docType as keyof typeof DOC_TYPES] : ""}{d.expiresOn ? ` · vence ${fmtDate(d.expiresOn)}` : ""}</small></span><ChevronRight className="icon go" aria-hidden="true" /></a></li>
          ))}
        </ol>
      ) : <Empty>Sin documentos.</Empty>}
      {x.access.docsUpload && (
        <>
          <h3>Subir documento</h3>
          {isCapacitor && (
            <div className="row" style={{ marginBottom: 12 }}>
              <button type="button" className="secondary" onClick={() => take("camera")}><Camera className="icon" aria-hidden="true" />Tomar foto</button>
              <button type="button" className="secondary" onClick={() => take("photos")}><ImageIcon className="icon" aria-hidden="true" />Elegir foto</button>
            </div>
          )}
          {note && <p className="msg warn">{note}</p>}
          <Form submit="Subir" onSubmit={async (f) => {
            const chosen = file ?? (f.get("file") as File);
            if (!chosen || !chosen.size) throw { error: { code: "VALIDATION", message: "Elige un archivo o toma una foto." } };
            const form = new FormData();
            form.set("companyId", c.id);
            form.set("employeeId", x.employee.id);
            form.set("title", String(f.get("title")));
            form.set("docType", String(f.get("docType")));
            form.set("file", chosen);
            await upload(form);
            setFile(null);
            reload();
            return "Documento subido.";
          }}>
            <label>Tipo<select name="docType">{Object.entries(DOC_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label>Título<input name="title" required maxLength={200} /></label>
            {file ? <p className="small"><FileUp className="icon" aria-hidden="true" /> {file.name} listo para subir</p> : <label>Archivo (PDF, JPG, PNG, WEBP · máx. 10 MB)<input name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*" /></label>}
          </Form>
        </>
      )}
    </section>
  );
}

type Node = { id: string; title: string; department: string; headcount: number | null; occupants: { id: string; name: string; status: string }[]; children: Node[] };
export function OrgChart({ base }: { base: string }) {
  const { c } = useCompany();
  const q = useData(() => rpc<{ roots: Node[]; unassigned: { id: string; name: string }[]; openable: string[] }>("structure.orgChart", {}, c.id), [c.id]);
  return (
    <>
      <PageHead title="Organigrama" description="Puestos y ocupantes actuales. No incluye exempleados." />
      <Async q={q}>
        {(o) => {
          const open = new Set(o.openable);
          const N = ({ n }: { n: Node }) => {
            const vac = n.headcount ? Math.max(0, n.headcount - n.occupants.length) : n.occupants.length ? 0 : 1;
            return (
              <li>
                <details open>
                  <summary className="node"><strong>{n.title}</strong> <span className="small muted">· {n.department}</span>
                    <div className="small">{n.occupants.map((p, i) => <span key={p.id}>{i > 0 && ", "}{open.has(p.id) ? <a href={href(`${base}/personal/${p.id}`)}>{p.name}</a> : p.name}</span>)}{vac > 0 && <span className="badge warn" style={{ marginLeft: 6 }}>{vac} vacante{vac > 1 ? "s" : ""}</span>}</div>
                  </summary>
                  {n.children.length > 0 && <ul>{n.children.map((ch) => <N key={ch.id} n={ch} />)}</ul>}
                </details>
              </li>
            );
          };
          return o.roots.length ? <div className="tree card"><ul>{o.roots.map((n) => <N key={n.id} n={n} />)}</ul></div> : <Empty>Aún no hay puestos.</Empty>;
        }}
      </Async>
    </>
  );
}

type Req = { id: string; createdAt: string; message: string | null; user: { name: string; lastName: string; email: string } };
export function JoinRequests() {
  const { c } = useCompany();
  const q = useData(() => rpc<Req[]>("joinRequests.list", { status: "PENDING" }, c.id), [c.id]);
  return (
    <>
      <PageHead title="Solicitudes de ingreso" />
      <Async q={q}>
        {(list) => list.length ? list.map((r) => (
          <section key={r.id} className="card">
            <strong>{r.user.name} {r.user.lastName}</strong> <span className="muted small">· {r.user.email}</span>
            {r.message && <p>“{r.message}”</p>}
            <div className="split">
              <Form submit="Aprobar (expediente nuevo)" onSubmit={async () => { await rpc("joinRequests.approve", { id: r.id, data: { mode: "new" } }, c.id); q.reload(); return "Aprobada."; }} />
              <Form submit="Rechazar" danger onSubmit={async (f) => { await rpc("joinRequests.reject", { id: r.id, note: String(f.get("note") ?? "") }, c.id); q.reload(); return "Rechazada."; }}>
                <label>Motivo (visible para la persona)<input name="note" maxLength={300} /></label>
              </Form>
            </div>
          </section>
        )) : <Empty title="No hay solicitudes pendientes" />}
      </Async>
    </>
  );
}
