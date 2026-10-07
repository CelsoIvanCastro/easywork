import { describe, expect, it } from "vitest";
import * as img from "@/server/services/images";
import { addMember, expectError, makeCompany, makeUser, pdfFile, pngFile } from "./helpers";

describe("logotipo y foto de perfil", () => {
  it("solo miembros ven el logotipo; la foto solo quien comparte empresa; solo imágenes", async () => {
    const { ctx, owner } = await makeCompany("Logo");
    const outsider = await makeUser("Fuera");
    await expectError(img.setCompanyLogo(ctx, pdfFile()), "VALIDATION");
    await img.setCompanyLogo(ctx, await pngFile());
    const m = await addMember(ctx);
    expect(await img.readCompanyLogo(m.user.id, ctx.companyId)).not.toBeNull();
    expect(await img.readCompanyLogo(outsider.id, ctx.companyId)).toBeNull();
    await img.setProfilePhoto(owner.id, await pngFile());
    expect(await img.readProfilePhoto(m.user.id, owner.id)).not.toBeNull();
    expect(await img.readProfilePhoto(outsider.id, owner.id)).toBeNull();
  });
});
