-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "JoinRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GrantSubject" AS ENUM ('MEMBER', 'POSITION', 'DEPARTMENT');

-- CreateEnum
CREATE TYPE "GrantScope" AS ENUM ('OWN', 'DEPARTMENTS', 'COMPANY');

-- CreateEnum
CREATE TYPE "GrantEffect" AS ENUM ('ALLOW', 'DENY');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'OFFBOARDING', 'FORMER');

-- CreateEnum
CREATE TYPE "TerminationReason" AS ENUM ('RESIGNATION', 'DISMISSAL', 'CONTRACT_END', 'OTHER');

-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('PENDING', 'CLEAN', 'INFECTED', 'UNSCANNED');

-- CreateEnum
CREATE TYPE "TrackingModel" AS ENUM ('STOCK', 'ASSET');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('INITIAL', 'IN', 'OUT', 'ADJUST', 'REVERSAL', 'RECEIPT', 'RECEIPT_REVERSAL');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('ACTIVE', 'IN_MAINTENANCE', 'OUT_OF_SERVICE', 'SOLD', 'DISPOSED');

-- CreateEnum
CREATE TYPE "UsageKind" AS ENUM ('NONE', 'KM', 'HOURS');

-- CreateEnum
CREATE TYPE "ReadingKind" AS ENUM ('NORMAL', 'CORRECTION', 'METER_REPLACEMENT');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'PARTIAL', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LineKind" AS ENUM ('STOCK', 'ASSET', 'SERVICE');

-- CreateEnum
CREATE TYPE "MaintenanceType" AS ENUM ('PREVENTIVE', 'CORRECTIVE');

-- CreateEnum
CREATE TYPE "MaintenanceStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lastName" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "twoFactorEnabled" BOOLEAN DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,
    "reauthAt" TIMESTAMP(3),

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "two_factor" (
    "id" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "backupCodes" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "verified" BOOLEAN DEFAULT true,
    "failedVerificationCount" INTEGER DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),

    CONSTRAINT "two_factor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "lastRequest" BIGINT NOT NULL,

    CONSTRAINT "rate_limit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "joinCode" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "tradeName" TEXT NOT NULL,
    "rfc" TEXT,
    "fiscalAddress" TEXT,
    "activity" TEXT,
    "description" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "logoKey" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/Mexico_City',
    "ownerId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_settings" (
    "companyId" TEXT NOT NULL,
    "docExpiryLeadDays" INTEGER NOT NULL DEFAULT 30,
    "contractExpiryLeadDays" INTEGER NOT NULL DEFAULT 30,
    "maintenanceLeadDays" INTEGER NOT NULL DEFAULT 7,
    "requiredEmployeeFields" TEXT[] DEFAULT ARRAY['firstName', 'lastName', 'birthDate', 'curp', 'rfc', 'nss', 'phone', 'address']::TEXT[],
    "requiredDocTypes" TEXT[] DEFAULT ARRAY['INE_FRONT', 'INE_BACK', 'CSF', 'BIRTH_CERT', 'PROOF_ADDRESS', 'CURP_DOC', 'NSS_DOC']::TEXT[],
    "retentionYearsAfterExit" INTEGER,
    "aiEnabled" BOOLEAN NOT NULL DEFAULT false,
    "aiAcknowledgedAt" TIMESTAMP(3),
    "aiAcknowledgedById" TEXT,
    "aiMonthlyRequestLimit" INTEGER NOT NULL DEFAULT 300,
    "aiDailyUserLimit" INTEGER NOT NULL DEFAULT 40,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_settings_pkey" PRIMARY KEY ("companyId")
);

-- CreateTable
CREATE TABLE "company_module" (
    "companyId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "company_module_pkey" PRIMARY KEY ("companyId","module")
);

-- CreateTable
CREATE TABLE "counter" (
    "companyId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "counter_pkey" PRIMARY KEY ("companyId","key")
);

-- CreateTable
CREATE TABLE "membership" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "fullAccess" BOOLEAN NOT NULL DEFAULT false,
    "fullAccessById" TEXT,
    "fullAccessAt" TIMESTAMP(3),
    "employeeId" TEXT,
    "mutedAlertTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "join_request" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "JoinRequestStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "employeeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "join_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grant" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "subjectType" "GrantSubject" NOT NULL,
    "membershipId" TEXT,
    "positionId" TEXT,
    "departmentId" TEXT,
    "permission" TEXT NOT NULL,
    "effect" "GrantEffect" NOT NULL DEFAULT 'ALLOW',
    "scope" "GrantScope" NOT NULL DEFAULT 'COMPANY',
    "scopeDepartmentIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "department" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "parentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "position" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "parentPositionId" TEXT,
    "headcount" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "userId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL DEFAULT '',
    "birthDate" DATE,
    "email" TEXT,
    "phone" TEXT,
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "departmentId" TEXT,
    "positionId" TEXT,
    "hireDate" DATE,
    "curpEnc" TEXT,
    "rfcEnc" TEXT,
    "nssEnc" TEXT,
    "addressEnc" TEXT,
    "curpBidx" TEXT,
    "rfcBidx" TEXT,
    "nssBidx" TEXT,
    "legalHold" BOOLEAN NOT NULL DEFAULT false,
    "anonymizedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employment_period" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "terminationReason" "TerminationReason",
    "terminationNotes" TEXT,
    "closedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employment_period_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_history" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "departmentId" TEXT,
    "positionId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "actorId" TEXT,
    "reason" TEXT,

    CONSTRAINT "assignment_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_note" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'NOTE',
    "body" TEXT NOT NULL,
    "occurredOn" DATE,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_contract" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "notes" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_account" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "holderName" TEXT NOT NULL,
    "clabeEnc" TEXT NOT NULL,
    "clabeLast4" TEXT NOT NULL,
    "bankCode" TEXT NOT NULL,
    "bankName" TEXT,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "replacedAt" TIMESTAMP(3),

    CONSTRAINT "bank_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "folder" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "confidential" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "folder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "folderId" TEXT,
    "title" TEXT NOT NULL,
    "category" TEXT,
    "docType" TEXT,
    "confidential" BOOLEAN NOT NULL DEFAULT false,
    "employeeId" TEXT,
    "supplierId" TEXT,
    "purchaseId" TEXT,
    "assetId" TEXT,
    "maintenanceId" TEXT,
    "contractId" TEXT,
    "expiresOn" DATE,
    "currentVersionNo" INTEGER NOT NULL DEFAULT 0,
    "versionCount" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_version" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "scanStatus" "ScanStatus" NOT NULL DEFAULT 'PENDING',
    "restoredFrom" INTEGER,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purgedAt" TIMESTAMP(3),

    CONSTRAINT "document_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "actorUserId" TEXT,
    "actorLabel" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "departmentId" TEXT,
    "result" TEXT NOT NULL DEFAULT 'SUCCESS',
    "summary" TEXT,
    "changes" JSONB,
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tracking" "TrackingModel" NOT NULL,
    "parentId" TEXT,
    "suggestedKey" TEXT,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "minQuantity" DECIMAL(18,4),
    "location" TEXT,
    "notes" TEXT,
    "archivedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movement" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "type" "MovementType" NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "balanceAfter" DECIMAL(18,4) NOT NULL,
    "reason" TEXT,
    "actorId" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "reversesId" TEXT,
    "receiptLineId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "serial" TEXT,
    "brand" TEXT,
    "model" TEXT,
    "year" INTEGER,
    "status" "AssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "acquiredOn" DATE,
    "costAmount" DECIMAL(18,2),
    "costCurrency" TEXT,
    "supplierId" TEXT,
    "warrantyUntil" DATE,
    "location" TEXT,
    "usageKind" "UsageKind" NOT NULL DEFAULT 'NONE',
    "readingOffset" DECIMAL(14,1) NOT NULL DEFAULT 0,
    "currentReading" DECIMAL(14,1),
    "readingAt" TIMESTAMP(3),
    "soldOn" DATE,
    "saleAmount" DECIMAL(18,2),
    "saleCurrency" TEXT,
    "responsibleLabel" TEXT,
    "notes" TEXT,
    "receiptLineId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_event" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fromStatus" "AssetStatus",
    "toStatus" "AssetStatus",
    "notes" TEXT,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_reading" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "kind" "ReadingKind" NOT NULL DEFAULT 'NORMAL',
    "rawValue" DECIMAL(14,1) NOT NULL,
    "effectiveValue" DECIMAL(14,1) NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_reading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "rfc" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "contactName" TEXT,
    "address" TEXT,
    "categories" TEXT,
    "notes" TEXT,
    "archivedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "supplierName" TEXT NOT NULL,
    "orderedOn" DATE NOT NULL,
    "reference" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'MXN',
    "pricesIncludeTax" BOOLEAN NOT NULL DEFAULT false,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'DRAFT',
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_line" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "kind" "LineKind" NOT NULL,
    "itemId" TEXT,
    "categoryId" TEXT,
    "description" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unitPrice" DECIMAL(18,4) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "receivedQty" DECIMAL(18,4) NOT NULL DEFAULT 0,

    CONSTRAINT "purchase_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipt" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "receivedOn" DATE NOT NULL,
    "notes" TEXT,
    "actorId" TEXT NOT NULL,
    "reversedAt" TIMESTAMP(3),
    "reversedById" TEXT,
    "reversalReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipt_line" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "movementId" TEXT,

    CONSTRAINT "receipt_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_record" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "itemId" TEXT,
    "purchaseLineId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "pricesIncludeTax" BOOLEAN NOT NULL,
    "unitPrice" DECIMAL(18,4) NOT NULL,
    "observedOn" DATE NOT NULL,
    "voidedAt" TIMESTAMP(3),

    CONSTRAINT "price_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_plan" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "intervalDays" INTEGER,
    "intervalReading" DECIMAL(14,1),
    "leadReading" DECIMAL(14,1),
    "lastServiceOn" DATE,
    "lastServiceReading" DECIMAL(14,1),
    "nextDueOn" DATE,
    "nextDueReading" DECIMAL(14,1),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenance_plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_record" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "planId" TEXT,
    "type" "MaintenanceType" NOT NULL,
    "status" "MaintenanceStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduledOn" DATE,
    "performedOn" DATE,
    "description" TEXT NOT NULL,
    "costAmount" DECIMAL(18,2),
    "costCurrency" TEXT,
    "supplierId" TEXT,
    "workshop" TEXT,
    "notes" TEXT,
    "reading" DECIMAL(14,1),
    "createdById" TEXT NOT NULL,
    "completedById" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenance_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcement" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "allCompany" BOOLEAN NOT NULL DEFAULT true,
    "authorId" TEXT NOT NULL,
    "authorLabel" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcement_department" (
    "companyId" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,

    CONSTRAINT "announcement_department_pkey" PRIMARY KEY ("announcementId","departmentId")
);

-- CreateTable
CREATE TABLE "alert" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'OPEN',
    "severity" TEXT NOT NULL DEFAULT 'warning',
    "title" TEXT NOT NULL,
    "link" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "requiredPermission" TEXT NOT NULL,
    "departmentId" TEXT,
    "employeeId" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "alertId" TEXT,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "snoozedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "companyId" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "dedupeKey" TEXT,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "lockedBy" TEXT,
    "lockedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worker_heartbeat" (
    "workerId" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "worker_heartbeat_pkey" PRIMARY KEY ("workerId")
);

-- CreateTable
CREATE TABLE "ai_usage" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "toolCalls" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE INDEX "two_factor_secret_idx" ON "two_factor"("secret");

-- CreateIndex
CREATE INDEX "two_factor_userId_idx" ON "two_factor"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "rate_limit_key_key" ON "rate_limit"("key");

-- CreateIndex
CREATE UNIQUE INDEX "company_code_key" ON "company"("code");

-- CreateIndex
CREATE UNIQUE INDEX "company_joinCode_key" ON "company"("joinCode");

-- CreateIndex
CREATE INDEX "membership_userId_idx" ON "membership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "membership_companyId_userId_key" ON "membership"("companyId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "membership_companyId_id_key" ON "membership"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "membership_companyId_employeeId_key" ON "membership"("companyId", "employeeId");

-- CreateIndex
CREATE INDEX "join_request_companyId_status_idx" ON "join_request"("companyId", "status");

-- CreateIndex
CREATE INDEX "join_request_userId_idx" ON "join_request"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "join_request_companyId_id_key" ON "join_request"("companyId", "id");

-- CreateIndex
CREATE INDEX "grant_companyId_membershipId_idx" ON "grant"("companyId", "membershipId");

-- CreateIndex
CREATE INDEX "grant_companyId_positionId_idx" ON "grant"("companyId", "positionId");

-- CreateIndex
CREATE INDEX "grant_companyId_departmentId_idx" ON "grant"("companyId", "departmentId");

-- CreateIndex
CREATE INDEX "department_companyId_archivedAt_idx" ON "department"("companyId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "department_companyId_id_key" ON "department"("companyId", "id");

-- CreateIndex
CREATE INDEX "position_companyId_departmentId_idx" ON "position"("companyId", "departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "position_companyId_id_key" ON "position"("companyId", "id");

-- CreateIndex
CREATE INDEX "employee_companyId_status_idx" ON "employee"("companyId", "status");

-- CreateIndex
CREATE INDEX "employee_companyId_departmentId_idx" ON "employee"("companyId", "departmentId");

-- CreateIndex
CREATE INDEX "employee_companyId_lastName_firstName_idx" ON "employee"("companyId", "lastName", "firstName");

-- CreateIndex
CREATE UNIQUE INDEX "employee_companyId_id_key" ON "employee"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "employee_companyId_number_key" ON "employee"("companyId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "employee_companyId_curpBidx_key" ON "employee"("companyId", "curpBidx");

-- CreateIndex
CREATE UNIQUE INDEX "employee_companyId_userId_key" ON "employee"("companyId", "userId");

-- CreateIndex
CREATE INDEX "employment_period_companyId_endDate_idx" ON "employment_period"("companyId", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "employment_period_employeeId_number_key" ON "employment_period"("employeeId", "number");

-- CreateIndex
CREATE INDEX "assignment_history_companyId_employeeId_idx" ON "assignment_history"("companyId", "employeeId");

-- CreateIndex
CREATE INDEX "assignment_history_companyId_departmentId_idx" ON "assignment_history"("companyId", "departmentId");

-- CreateIndex
CREATE INDEX "employee_note_companyId_employeeId_idx" ON "employee_note"("companyId", "employeeId");

-- CreateIndex
CREATE INDEX "employee_contract_companyId_endDate_idx" ON "employee_contract"("companyId", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "employee_contract_companyId_id_key" ON "employee_contract"("companyId", "id");

-- CreateIndex
CREATE INDEX "bank_account_companyId_employeeId_idx" ON "bank_account"("companyId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "folder_companyId_id_key" ON "folder"("companyId", "id");

-- CreateIndex
CREATE INDEX "document_companyId_folderId_idx" ON "document"("companyId", "folderId");

-- CreateIndex
CREATE INDEX "document_companyId_employeeId_idx" ON "document"("companyId", "employeeId");

-- CreateIndex
CREATE INDEX "document_companyId_expiresOn_idx" ON "document"("companyId", "expiresOn");

-- CreateIndex
CREATE UNIQUE INDEX "document_companyId_id_key" ON "document"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "document_version_storageKey_key" ON "document_version"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "document_version_documentId_number_key" ON "document_version"("documentId", "number");

-- CreateIndex
CREATE INDEX "audit_log_companyId_createdAt_idx" ON "audit_log"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_log_companyId_entityType_entityId_idx" ON "audit_log"("companyId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_log_companyId_module_createdAt_idx" ON "audit_log"("companyId", "module", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "category_companyId_id_key" ON "category"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "category_companyId_suggestedKey_key" ON "category"("companyId", "suggestedKey");

-- CreateIndex
CREATE INDEX "item_companyId_name_idx" ON "item"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "item_companyId_id_key" ON "item"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "item_companyId_code_key" ON "item"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movement_reversesId_key" ON "stock_movement"("reversesId");

-- CreateIndex
CREATE INDEX "stock_movement_companyId_itemId_createdAt_idx" ON "stock_movement"("companyId", "itemId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movement_companyId_id_key" ON "stock_movement"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movement_companyId_idempotencyKey_key" ON "stock_movement"("companyId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "asset_companyId_status_idx" ON "asset"("companyId", "status");

-- CreateIndex
CREATE INDEX "asset_companyId_serial_idx" ON "asset"("companyId", "serial");

-- CreateIndex
CREATE UNIQUE INDEX "asset_companyId_id_key" ON "asset"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "asset_companyId_code_key" ON "asset"("companyId", "code");

-- CreateIndex
CREATE INDEX "asset_event_companyId_assetId_createdAt_idx" ON "asset_event"("companyId", "assetId", "createdAt");

-- CreateIndex
CREATE INDEX "usage_reading_companyId_assetId_readAt_idx" ON "usage_reading"("companyId", "assetId", "readAt");

-- CreateIndex
CREATE INDEX "supplier_companyId_name_idx" ON "supplier"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_companyId_id_key" ON "supplier"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_companyId_code_key" ON "supplier"("companyId", "code");

-- CreateIndex
CREATE INDEX "purchase_companyId_status_idx" ON "purchase"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_companyId_id_key" ON "purchase"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_companyId_code_key" ON "purchase"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_line_companyId_id_key" ON "purchase_line"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_line_purchaseId_lineNo_key" ON "purchase_line"("purchaseId", "lineNo");

-- CreateIndex
CREATE UNIQUE INDEX "receipt_companyId_id_key" ON "receipt"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "receipt_companyId_idempotencyKey_key" ON "receipt"("companyId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "receipt_purchaseId_number_key" ON "receipt"("purchaseId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "receipt_line_movementId_key" ON "receipt_line"("movementId");

-- CreateIndex
CREATE UNIQUE INDEX "receipt_line_companyId_id_key" ON "receipt_line"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "price_record_purchaseLineId_key" ON "price_record"("purchaseLineId");

-- CreateIndex
CREATE INDEX "price_record_companyId_itemId_observedOn_idx" ON "price_record"("companyId", "itemId", "observedOn");

-- CreateIndex
CREATE UNIQUE INDEX "price_record_companyId_purchaseLineId_key" ON "price_record"("companyId", "purchaseLineId");

-- CreateIndex
CREATE INDEX "maintenance_plan_companyId_nextDueOn_idx" ON "maintenance_plan"("companyId", "nextDueOn");

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_plan_companyId_id_key" ON "maintenance_plan"("companyId", "id");

-- CreateIndex
CREATE INDEX "maintenance_record_companyId_assetId_idx" ON "maintenance_record"("companyId", "assetId");

-- CreateIndex
CREATE INDEX "maintenance_record_companyId_status_idx" ON "maintenance_record"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_record_companyId_id_key" ON "maintenance_record"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_record_companyId_code_key" ON "maintenance_record"("companyId", "code");

-- CreateIndex
CREATE INDEX "announcement_companyId_publishedAt_idx" ON "announcement"("companyId", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "announcement_companyId_id_key" ON "announcement"("companyId", "id");

-- CreateIndex
CREATE INDEX "alert_companyId_status_idx" ON "alert"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "alert_companyId_id_key" ON "alert"("companyId", "id");

-- CreateIndex
CREATE INDEX "notification_companyId_userId_createdAt_idx" ON "notification"("companyId", "userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "notification_userId_alertId_key" ON "notification"("userId", "alertId");

-- CreateIndex
CREATE UNIQUE INDEX "job_dedupeKey_key" ON "job"("dedupeKey");

-- CreateIndex
CREATE INDEX "job_status_runAt_idx" ON "job"("status", "runAt");

-- CreateIndex
CREATE INDEX "ai_usage_companyId_createdAt_idx" ON "ai_usage"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_usage_companyId_userId_createdAt_idx" ON "ai_usage"("companyId", "userId", "createdAt");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company" ADD CONSTRAINT "company_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_module" ADD CONSTRAINT "company_module_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counter" ADD CONSTRAINT "counter_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership" ADD CONSTRAINT "membership_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership" ADD CONSTRAINT "membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership" ADD CONSTRAINT "membership_companyId_employeeId_fkey" FOREIGN KEY ("companyId", "employeeId") REFERENCES "employee"("companyId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "join_request" ADD CONSTRAINT "join_request_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "join_request" ADD CONSTRAINT "join_request_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grant" ADD CONSTRAINT "grant_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grant" ADD CONSTRAINT "grant_companyId_membershipId_fkey" FOREIGN KEY ("companyId", "membershipId") REFERENCES "membership"("companyId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grant" ADD CONSTRAINT "grant_companyId_positionId_fkey" FOREIGN KEY ("companyId", "positionId") REFERENCES "position"("companyId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grant" ADD CONSTRAINT "grant_companyId_departmentId_fkey" FOREIGN KEY ("companyId", "departmentId") REFERENCES "department"("companyId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department" ADD CONSTRAINT "department_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department" ADD CONSTRAINT "department_companyId_parentId_fkey" FOREIGN KEY ("companyId", "parentId") REFERENCES "department"("companyId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "position" ADD CONSTRAINT "position_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "position" ADD CONSTRAINT "position_companyId_departmentId_fkey" FOREIGN KEY ("companyId", "departmentId") REFERENCES "department"("companyId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "position" ADD CONSTRAINT "position_companyId_parentPositionId_fkey" FOREIGN KEY ("companyId", "parentPositionId") REFERENCES "position"("companyId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_companyId_departmentId_fkey" FOREIGN KEY ("companyId", "departmentId") REFERENCES "department"("companyId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_companyId_positionId_fkey" FOREIGN KEY ("companyId", "positionId") REFERENCES "position"("companyId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employment_period" ADD CONSTRAINT "employment_period_companyId_employeeId_fkey" FOREIGN KEY ("companyId", "employeeId") REFERENCES "employee"("companyId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_history" ADD CONSTRAINT "assignment_history_companyId_employeeId_fkey" FOREIGN KEY ("companyId", "employeeId") REFERENCES "employee"("companyId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_history" ADD CONSTRAINT "assignment_history_companyId_departmentId_fkey" FOREIGN KEY ("companyId", "departmentId") REFERENCES "department"("companyId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_history" ADD CONSTRAINT "assignment_history_companyId_positionId_fkey" FOREIGN KEY ("companyId", "positionId") REFERENCES "position"("companyId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_note" ADD CONSTRAINT "employee_note_companyId_employeeId_fkey" FOREIGN KEY ("companyId", "employeeId") REFERENCES "employee"("companyId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_contract" ADD CONSTRAINT "employee_contract_companyId_employeeId_fkey" FOREIGN KEY ("companyId", "employeeId") REFERENCES "employee"("companyId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_account" ADD CONSTRAINT "bank_account_companyId_employeeId_fkey" FOREIGN KEY ("companyId", "employeeId") REFERENCES "employee"("companyId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folder" ADD CONSTRAINT "folder_companyId_parentId_fkey" FOREIGN KEY ("companyId", "parentId") REFERENCES "folder"("companyId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_companyId_folderId_fkey" FOREIGN KEY ("companyId", "folderId") REFERENCES "folder"("companyId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_companyId_employeeId_fkey" FOREIGN KEY ("companyId", "employeeId") REFERENCES "employee"("companyId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_companyId_supplierId_fkey" FOREIGN KEY ("companyId", "supplierId") REFERENCES "supplier"("companyId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_companyId_purchaseId_fkey" FOREIGN KEY ("companyId", "purchaseId") REFERENCES "purchase"("companyId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_companyId_assetId_fkey" FOREIGN KEY ("companyId", "assetId") REFERENCES "asset"("companyId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_companyId_maintenanceId_fkey" FOREIGN KEY ("companyId", "maintenanceId") REFERENCES "maintenance_record"("companyId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_companyId_contractId_fkey" FOREIGN KEY ("companyId", "contractId") REFERENCES "employee_contract"("companyId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_version" ADD CONSTRAINT "document_version_companyId_documentId_fkey" FOREIGN KEY ("companyId", "documentId") REFERENCES "document"("companyId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category" ADD CONSTRAINT "category_companyId_parentId_fkey" FOREIGN KEY ("companyId", "parentId") REFERENCES "category"("companyId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item" ADD CONSTRAINT "item_companyId_categoryId_fkey" FOREIGN KEY ("companyId", "categoryId") REFERENCES "category"("companyId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_companyId_itemId_fkey" FOREIGN KEY ("companyId", "itemId") REFERENCES "item"("companyId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset" ADD CONSTRAINT "asset_companyId_categoryId_fkey" FOREIGN KEY ("companyId", "categoryId") REFERENCES "category"("companyId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset" ADD CONSTRAINT "asset_companyId_supplierId_fkey" FOREIGN KEY ("companyId", "supplierId") REFERENCES "supplier"("companyId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_event" ADD CONSTRAINT "asset_event_companyId_assetId_fkey" FOREIGN KEY ("companyId", "assetId") REFERENCES "asset"("companyId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_reading" ADD CONSTRAINT "usage_reading_companyId_assetId_fkey" FOREIGN KEY ("companyId", "assetId") REFERENCES "asset"("companyId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase" ADD CONSTRAINT "purchase_companyId_supplierId_fkey" FOREIGN KEY ("companyId", "supplierId") REFERENCES "supplier"("companyId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_line" ADD CONSTRAINT "purchase_line_companyId_purchaseId_fkey" FOREIGN KEY ("companyId", "purchaseId") REFERENCES "purchase"("companyId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_line" ADD CONSTRAINT "purchase_line_companyId_itemId_fkey" FOREIGN KEY ("companyId", "itemId") REFERENCES "item"("companyId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_line" ADD CONSTRAINT "purchase_line_companyId_categoryId_fkey" FOREIGN KEY ("companyId", "categoryId") REFERENCES "category"("companyId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt" ADD CONSTRAINT "receipt_companyId_purchaseId_fkey" FOREIGN KEY ("companyId", "purchaseId") REFERENCES "purchase"("companyId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_line" ADD CONSTRAINT "receipt_line_companyId_receiptId_fkey" FOREIGN KEY ("companyId", "receiptId") REFERENCES "receipt"("companyId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_line" ADD CONSTRAINT "receipt_line_companyId_lineId_fkey" FOREIGN KEY ("companyId", "lineId") REFERENCES "purchase_line"("companyId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_record" ADD CONSTRAINT "price_record_companyId_supplierId_fkey" FOREIGN KEY ("companyId", "supplierId") REFERENCES "supplier"("companyId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_record" ADD CONSTRAINT "price_record_companyId_itemId_fkey" FOREIGN KEY ("companyId", "itemId") REFERENCES "item"("companyId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_record" ADD CONSTRAINT "price_record_companyId_purchaseLineId_fkey" FOREIGN KEY ("companyId", "purchaseLineId") REFERENCES "purchase_line"("companyId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_plan" ADD CONSTRAINT "maintenance_plan_companyId_assetId_fkey" FOREIGN KEY ("companyId", "assetId") REFERENCES "asset"("companyId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_record" ADD CONSTRAINT "maintenance_record_companyId_assetId_fkey" FOREIGN KEY ("companyId", "assetId") REFERENCES "asset"("companyId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_record" ADD CONSTRAINT "maintenance_record_companyId_planId_fkey" FOREIGN KEY ("companyId", "planId") REFERENCES "maintenance_plan"("companyId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_record" ADD CONSTRAINT "maintenance_record_companyId_supplierId_fkey" FOREIGN KEY ("companyId", "supplierId") REFERENCES "supplier"("companyId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_department" ADD CONSTRAINT "announcement_department_companyId_announcementId_fkey" FOREIGN KEY ("companyId", "announcementId") REFERENCES "announcement"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_department" ADD CONSTRAINT "announcement_department_companyId_departmentId_fkey" FOREIGN KEY ("companyId", "departmentId") REFERENCES "department"("companyId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_companyId_alertId_fkey" FOREIGN KEY ("companyId", "alertId") REFERENCES "alert"("companyId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- ───────── Restricciones que Prisma no expresa ─────────

-- Solo una solicitud pendiente por persona y empresa (concurrencia segura).
CREATE UNIQUE INDEX "join_request_pending_unique" ON "join_request" ("companyId", "userId") WHERE status = 'PENDING';
-- Solo un periodo laboral abierto por expediente.
CREATE UNIQUE INDEX "employment_period_open_unique" ON "employment_period" ("employeeId") WHERE "endDate" IS NULL;
-- Una sola alerta no resuelta por condición.
CREATE UNIQUE INDEX "alert_open_dedupe" ON "alert" ("companyId", "dedupeKey") WHERE status = 'OPEN';
-- Una sola cuenta bancaria vigente por expediente.
CREATE UNIQUE INDEX "bank_account_current_unique" ON "bank_account" ("employeeId") WHERE "isCurrent";

-- Un documento se vincula como máximo a una entidad.
ALTER TABLE "document" ADD CONSTRAINT "document_single_link" CHECK (
  (("employeeId" IS NOT NULL)::int + ("supplierId" IS NOT NULL)::int + ("purchaseId" IS NOT NULL)::int
   + ("assetId" IS NOT NULL)::int + ("maintenanceId" IS NOT NULL)::int) <= 1
);
ALTER TABLE "item" ADD CONSTRAINT "item_quantity_nonnegative" CHECK (quantity >= 0);
ALTER TABLE "purchase_line" ADD CONSTRAINT "purchase_line_positive" CHECK (quantity > 0 AND "unitPrice" >= 0 AND "receivedQty" >= 0 AND "receivedQty" <= quantity);
ALTER TABLE "receipt_line" ADD CONSTRAINT "receipt_line_positive" CHECK (quantity > 0);
ALTER TABLE "department" ADD CONSTRAINT "department_no_self_parent" CHECK ("parentId" IS NULL OR "parentId" <> id);
ALTER TABLE "position" ADD CONSTRAINT "position_no_self_parent" CHECK ("parentPositionId" IS NULL OR "parentPositionId" <> id);
ALTER TABLE "employment_period" ADD CONSTRAINT "employment_period_dates" CHECK ("endDate" IS NULL OR "endDate" >= "startDate");
ALTER TABLE "bank_account" ADD CONSTRAINT "bank_account_code" CHECK ("bankCode" ~ '^[0-9]{3}$' AND "clabeLast4" ~ '^[0-9]{4}$');
ALTER TABLE "grant" ADD CONSTRAINT "grant_subject" CHECK (
  ("subjectType" = 'MEMBER' AND "membershipId" IS NOT NULL AND "positionId" IS NULL AND "departmentId" IS NULL) OR
  ("subjectType" = 'POSITION' AND "positionId" IS NOT NULL AND "membershipId" IS NULL AND "departmentId" IS NULL) OR
  ("subjectType" = 'DEPARTMENT' AND "departmentId" IS NOT NULL AND "membershipId" IS NULL AND "positionId" IS NULL)
);

-- ───────── Auditoría inmutable desde la aplicación ─────────
-- UPDATE/DELETE bloqueados salvo dentro de audit_redact_entity (retención autorizada).
-- Límite: un superusuario de la base puede desactivar el trigger; ver docs/OPERACION.md.
CREATE FUNCTION audit_log_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.audit_redact', true) = 'on' AND TG_OP = 'UPDATE' THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'audit_log es de solo inserción';
END $$;
CREATE TRIGGER audit_log_immutable BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION audit_log_guard();

CREATE FUNCTION audit_redact_entity(p_company text, p_entity_type text, p_entity_id text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  PERFORM set_config('app.audit_redact', 'on', true);
  UPDATE "audit_log" SET changes = NULL, summary = '[datos eliminados por retención]'
   WHERE "companyId" = p_company AND "entityType" = p_entity_type AND "entityId" = p_entity_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM set_config('app.audit_redact', 'off', true);
  RETURN n;
END $$;

-- ───────── Privilegios mínimos del rol de la aplicación ─────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'easywork_app') THEN
    CREATE ROLE easywork_app NOLOGIN;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO easywork_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO easywork_app;
DO $$ BEGIN
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    REVOKE ALL ON "_prisma_migrations" FROM easywork_app;
  END IF;
END $$;
REVOKE UPDATE, DELETE, TRUNCATE ON "audit_log" FROM easywork_app;
REVOKE ALL ON FUNCTION audit_redact_entity(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION audit_redact_entity(text, text, text) TO easywork_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO easywork_app;
