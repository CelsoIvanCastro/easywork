-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'CANCELLED', 'EXPIRED');

-- AlterTable
ALTER TABLE "company" ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "closedReason" TEXT,
ALTER COLUMN "ownerId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "company_settings" ADD COLUMN     "aiMonthlyTokenLimit" INTEGER NOT NULL DEFAULT 2000000;

-- CreateTable
CREATE TABLE "ownership_transfer" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "status" "TransferStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ownership_transfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erasure_log" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "companyId" TEXT,
    "summary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "erasure_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ownership_transfer_companyId_status_idx" ON "ownership_transfer"("companyId", "status");

-- CreateIndex
CREATE INDEX "ownership_transfer_toUserId_status_idx" ON "ownership_transfer"("toUserId", "status");

-- CreateIndex
CREATE INDEX "erasure_log_kind_subject_idx" ON "erasure_log"("kind", "subject");

-- Seudonimizar al autor en la auditoría cuando se elimina una cuenta (las acciones se conservan).
CREATE FUNCTION audit_redact_actor(p_user text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  PERFORM set_config('app.audit_redact', 'on', true);
  UPDATE "audit_log" SET "actorLabel" = 'Cuenta eliminada' WHERE "actorUserId" = p_user;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM set_config('app.audit_redact', 'off', true);
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION audit_redact_actor(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION audit_redact_actor(text) TO easywork_app;
