import Link from "next/link";
import { allowOr404, getCtx, load } from "@/server/web";
import { can } from "@/server/context";
import { listDocuments, listFolders } from "@/server/services/documents";
import { ACCEPT } from "@/server/files";
import { DOC_CATEGORIES } from "@/lib/catalogs";
import { ActionForm, Field, Select } from "@/components/ActionForm";
import { Badge, Empty, PageHead, fmtCivil, fmtDateTime, Pager } from "@/components/ui";
import * as A from "./actions";

type SP = { folder?: string; q?: string; page?: string; archived?: string };

export default async function Documentos({ params, searchParams }: { params: Promise<{ companyId: string }>; searchParams: Promise<SP> }) {
  const { companyId } = await params;
  const sp = await searchParams;
  const ctx = await getCtx(companyId);
  allowOr404(can(ctx, "documents.view"));
  const folderId = sp.folder === undefined ? undefined : sp.folder === "raiz" ? null : sp.folder;
  const [list, folders] = await Promise.all([load(listDocuments(ctx, { folderId, q: sp.q, page: Number(sp.page ?? 1), archived: sp.archived === "1" })), listFolders(ctx)]);
  const qs = (p: number) => `?${new URLSearchParams({ ...(Object.fromEntries(Object.entries(sp).filter(([, v]) => v)) as Record<string, string>), page: String(p) })}`;
  const c = <input type="hidden" name="c" value={companyId} />;
  return (
    <>
      <PageHead title="Documentos" description="Repositorio privado. Cada archivo conserva sus versiones y su historial." />
      <form className="filters" role="search" aria-label="Filtrar documentos">
        <label>Buscar por título<input name="q" defaultValue={sp.q} /></label>
        <label>Carpeta<select name="folder" defaultValue={sp.folder ?? ""}><option value="">Todas</option><option value="raiz">Sin carpeta</option>{folders.map((f) => <option key={f.id} value={f.id}>{f.name}{f.confidential ? " (confidencial)" : ""}</option>)}</select></label>
        <label className="inline"><input type="checkbox" name="archived" value="1" defaultChecked={sp.archived === "1"} /> Ver archivados</label>
        <div><button>Filtrar</button></div>
      </form>
      {list.rows.length === 0 ? <Empty title="Sin documentos">No hay documentos visibles con estos filtros.</Empty> : (
        <div className="table-wrap stackable">
          <table>
            <thead><tr><th>Título</th><th>Ubicación / vínculo</th><th>Versión</th><th>Actualizado</th></tr></thead>
            <tbody>
              {list.rows.map((d) => (
                <tr key={d.id}>
                  <td data-label="Título"><Link href={`/e/${companyId}/documentos/${d.id}`}>{d.title}</Link> {d.confidential && <Badge tone="warn">Confidencial</Badge>}</td>
                  <td data-label="Ubicación" className="small">
                    {d.employee ? `Expediente: ${d.employee.firstName} ${d.employee.lastName}` : d.supplier ? `Proveedor: ${d.supplier.name}` : d.asset ? `Activo ${d.asset.code}` : d.purchase ? `Compra ${d.purchase.code}` : d.folder?.name ?? "Sin carpeta"}
                    {d.category && ` · ${d.category}`}
                  </td>
                  <td data-label="Versión">v{d.currentVersionNo}{d.expiresOn && <div className="small muted">Vence {fmtCivil(d.expiresOn)}</div>}</td>
                  <td data-label="Actualizado">{fmtDateTime(d.updatedAt, ctx.company.timezone)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={list.page} total={list.total} pageSize={list.pageSize} href={qs} />
      {can(ctx, "documents.upload") && (
        <section className="card">
          <h2>Subir documento</h2>
          <p className="small muted">PDF, JPG, PNG o WEBP hasta 10 MB. Los archivos se guardan en almacenamiento privado.</p>
          <ActionForm action={A.uploadAction} submit="Subir">
            {c}
            <div className="fields">
              <Field label="Título" name="title" required maxLength={200} />
              <Select label="Categoría" name="category" options={[["", "—"], ...DOC_CATEGORIES.map((x) => [x, x] as [string, string])]} />
              <Select label="Carpeta" name="folderId" options={[["", "Sin carpeta"], ...folders.map((f) => [f.id, f.name] as [string, string])]} />
              <Field label="Vence (opcional)" name="expiresOn" type="date" />
              <Field label="Archivo" name="file" type="file" accept={ACCEPT} required />
            </div>
            {can(ctx, "documents.confidential") && <label className="inline"><input type="checkbox" name="confidential" /> Confidencial</label>}
          </ActionForm>
        </section>
      )}
      {can(ctx, "documents.manage") && (
        <section className="card">
          <h2>Nueva carpeta</h2>
          <ActionForm action={A.folderAction} submit="Crear carpeta" reset>
            {c}
            <div className="fields">
              <Field label="Nombre" name="name" required maxLength={120} />
              <Select label="Dentro de" name="parentId" options={[["", "Raíz"], ...folders.map((f) => [f.id, f.name] as [string, string])]} />
            </div>
            {can(ctx, "documents.confidential") && <label className="inline"><input type="checkbox" name="confidential" /> Confidencial (su contenido hereda la restricción)</label>}
          </ActionForm>
        </section>
      )}
    </>
  );
}
