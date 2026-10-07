import { allowOr404, getCtx, load } from "@/server/web";
import { listAnnouncements } from "@/server/services/announcements";
import { listDepartments } from "@/server/services/structure";
import { ActionForm, Area, Field, Select } from "@/components/ActionForm";
import { Badge, Empty, fmtDateTime, Pager } from "@/components/ui";
import * as A from "./actions";

export default async function Avisos({ params, searchParams }: { params: Promise<{ companyId: string }>; searchParams: Promise<{ page?: string; archived?: string }> }) {
  const { companyId } = await params;
  const sp = await searchParams;
  const ctx = await getCtx(companyId);
  allowOr404(ctx.modules.has("announcements"));
  const list = await load(listAnnouncements(ctx, { archived: sp.archived === "1", page: Number(sp.page ?? 1) }));
  const depts = list.publisher ? await listDepartments(ctx) : [];
  const c = <input type="hidden" name="c" value={companyId} />;
  const audience = (ids: string[] = [], all = true) => (
    <>
      <Select label="Audiencia" name="audience" options={[["all", "Toda la empresa"], ["departments", "Departamentos seleccionados"]]} defaultValue={all ? "all" : "departments"} />
      <fieldset><legend>Departamentos</legend><div className="fields">{depts.map((d) => <label key={d.id} className="inline"><input type="checkbox" name="departmentIds" value={d.id} defaultChecked={ids.includes(d.id)} /> {d.name}</label>)}</div></fieldset>
    </>
  );
  return (
    <>
      <div className="spread"><h1>Avisos</h1>{list.publisher && <a href={sp.archived === "1" ? "?" : "?archived=1"}>{sp.archived === "1" ? "Ver vigentes" : "Ver archivados"}</a>}</div>
      {list.rows.length === 0 ? <Empty>No hay avisos para ti.</Empty> : list.rows.map((a) => (
        <article key={a.id} className="card">
          <h2>{a.title}</h2>
          <p className="small muted">{a.authorLabel} · {fmtDateTime(a.publishedAt, ctx.company.timezone)} · {a.allCompany ? "Toda la empresa" : a.departments.map((d) => d.department.name).join(", ")} {a.archivedAt && <Badge>Archivado</Badge>}</p>
          <p style={{ whiteSpace: "pre-wrap" }}>{a.body}</p>
          {list.publisher && !a.archivedAt && (
            <details>
              <summary>Editar o archivar</summary>
              <ActionForm action={A.editAction}>
                {c}<input type="hidden" name="id" value={a.id} /><input type="hidden" name="version" value={a.version} />
                <Field label="Título" name="title" defaultValue={a.title} required />
                <Area label="Contenido" name="body" defaultValue={a.body} required />
                {audience(a.departments.map((d) => d.departmentId), a.allCompany)}
              </ActionForm>
              <ActionForm action={A.archiveAction} submit="Archivar" className="">{c}<input type="hidden" name="id" value={a.id} /></ActionForm>
            </details>
          )}
        </article>
      ))}
      <Pager page={list.page} total={list.total} pageSize={list.pageSize} href={(p) => `?page=${p}`} />
      {list.publisher && (
        <section className="card">
          <h2>Publicar aviso</h2>
          <ActionForm action={A.publishAction} submit="Publicar" reset>
            {c}
            <Field label="Título" name="title" required maxLength={160} />
            <Area label="Contenido (texto)" name="body" required maxLength={10000} />
            {audience()}
          </ActionForm>
        </section>
      )}
    </>
  );
}
