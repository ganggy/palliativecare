import {
  buildCandidateAliveSql,
  buildCandidateSql,
  clinicRules,
  getPatientUnitOverride,
  serviceUnits,
} from "./clinic-rules";
import { hashPassword, issueAuthToken, verifyAuthToken, verifyPassword } from "./auth";
import { getPool, isDbConfigured } from "./db";
import {
  addCommentRecord,
  addVisitRecord,
  authenticateUser,
  cancelPatientRegistration,
  createUserByAdmin,
  deleteUserByAdmin,
  getAuthUserById,
  getPendingUsers,
  getSnapshot,
  importStmBatch,
  registerUserRequest as registerUserRequestMock,
  reviewPendingUser,
  registerPatientFromCandidate,
  renameUser,
  updateUserByAdmin,
  updatePatientRecord,
  updateVisitAdvanceCarePlanRecord,
  updateVisitRecord,
} from "./mock-store";
import {
  buildClaimChecklist,
  buildVisitWindow,
  classifyCandidateDxGroup,
  defaultVisitChecklist,
  describeEligibility,
  isLctExcludedPatientName,
  isDateWithinWindow,
  isOpioidEligibleCode,
  monthKey,
  normalizeVisitChecklist,
  REQUIRED_COMPLETE_VISITS,
  toDateKey,
  validateVisitSubmission,
} from "./rules";
import type {
  AdvanceCarePlanDocument,
  AdvanceCarePlanForm,
  AppSnapshot,
  AppUser,
  AuthSessionUser,
  CandidateVisitHistory,
  CandidateDxGroup,
  CandidateFilterMode,
  HosPatientDetail,
  HosPatientDiagItem,
  HosPatientLabItem,
  HosPatientSearchItem,
  HosPatientServiceItem,
  HosProgressSummary,
  HosCandidate,
  PendingUserRequest,
  PatientComment,
  PalliativePatient,
  PalliativeVisit,
  ServiceUnit,
  StmBatch,
  StmRow,
  UnitSummary,
  UserApprovalStatus,
  UserRole,
  VisitClinicalAssessment,
  VisitChecklist,
} from "./types";

interface CandidateRow {
  hn?: unknown;
  cid?: unknown;
  fullname?: unknown;
  age?: unknown;
  birthday?: unknown;
  sex?: unknown;
  unitId?: unknown;
  clinicName?: unknown;
  clinicShortName?: unknown;
  pttype?: unknown;
  pdx?: unknown;
  primaryDxName?: unknown;
  TelNo?: unknown;
  full_address?: unknown;
  serviceCount?: unknown;
  incompleteVisitCount?: unknown;
  lastServiceAt?: unknown;
  visitDate?: unknown;
  diagZ515?: unknown;
  diagZ718?: unknown;
  adp30001?: unknown;
  eva001?: unknown;
  cons01?: unknown;
}

interface DbUserRow {
  id: string;
  username: string;
  displayName: string;
  role: AppUser["role"];
  unitId: string;
  active: number;
  approvalStatus?: UserApprovalStatus;
  approvedAt?: string | null;
  approvedByUserId?: string | null;
  passwordHash?: string | null;
  requestedAt?: string | null;
  reviewNote?: string | null;
}

interface DbPatientRow {
  id: number;
  hn: string;
  cid: string;
  fullName: string;
  age: number;
  birthday?: string | null;
  sex: "M" | "F";
  insuranceGroup?: string | null;
  assignedUnitId: string;
  assignedUnitName: string;
  assignedUnitKind: PalliativePatient["assignedUnitKind"];
  primaryDxCode: string;
  primaryDxName: string;
  careStatus: PalliativePatient["careStatus"];
  eligibleReason: string;
  phone?: string | null;
  relativePhone?: string | null;
  lineId?: string | null;
  address?: string | null;
  notes?: string | null;
  registeredAt: string;
  registeredByUserId: string;
  lastVisitAt?: string | null;
  nextVisitAt?: string | null;
  serviceMonthCount: number;
  visitWindowStart: string;
  visitWindowEnd: string;
  claimChecklistJson: string;
  cancellationReason?: string | null;
  dischargedAt?: string | null;
}

interface HosVisitDateRow {
  hn: string;
  visitDate: string;
}

interface DbVisitRow {
  id: number;
  patientId: number;
  unitId: string;
  visitDate: string;
  scheduledDate: string;
  rescheduledFrom?: string | null;
  status: PalliativeVisit["status"];
  visitorUserId: string;
  visitorName: string;
  authenCode?: string | null;
  symptoms: string;
  note: string;
  checklistJson: string;
  clinicalJson?: string | null;
  acpJson?: string | null;
  photosJson: string;
  createdAt: string;
}

interface DbCommentRow {
  id: string;
  patientId: number;
  unitId: string;
  authorUserId: string;
  authorName: string;
  audience: PatientComment["audience"];
  body: string;
  createdAt: string;
}

interface DbStmBatchRow {
  id: string;
  fileName: string;
  importedAt: string;
  importedByUserId: string;
  importedByName: string;
  defaultSplitPercent: number;
}

interface DbStmRow {
  id: string;
  batchId: string;
  hn: string;
  patientName: string;
  amount: number;
  unitId: string;
  claimMonth: string;
  note?: string | null;
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function looksCorruptedThai(value: string): boolean {
  if (!value) return false;
  if (value.includes("�") || value.includes("เน�")) return true;
  const mojibakeTokens = (value.match(/เธ/g)?.length ?? 0) + (value.match(/เน�/g)?.length ?? 0);
  return mojibakeTokens >= 2;
}

const canonicalUserDisplayNameByUsername: Record<string, string> = {
  hosadmin: "ผู้ดูแลระบบโรงพยาบาล",
  "case.manager": "Case Manager โรงพยาบาล",
  executive: "ผู้บริหาร",
  rukchanoke: "ผู้บริหาร",
  "card.room": "ห้องบัตร",
  "pcu.hospital": "ทีม PCU โรงพยาบาล",
  "huey.manager": "หัวหน้าทีมห้วยหีบ",
  "huey.nurse": "พยาบาลห้วยหีบ",
  "muang.manager": "หัวหน้าทีมม่วงไข",
  "phon.manager": "หัวหน้าทีมโพนทองวัฒนา",
  "banlao.manager": "หัวหน้าทีมบ้านเหล่าโพนค้อ",
  "khok.manager": "หัวหน้าทีมโคกนาดี",
};

function roleFallbackLabel(role: AppUser["role"]): string {
  if (role === "hospital_admin") return "ผู้ดูแลระบบโรงพยาบาล";
  if (role === "hospital_case_manager") return "Case Manager โรงพยาบาล";
  if (role === "hospital_executive") return "ผู้บริหาร";
  if (role === "hospital_card_room") return "ห้องบัตร";
  if (role === "hospital_pcu") return "ทีม PCU โรงพยาบาล";
  if (role === "unit_manager") return "หัวหน้าหน่วย";
  return "พยาบาลหน่วย";
}

function normalizeDbUsers(
  rows: DbUserRow[],
  units: ServiceUnit[],
): AppUser[] {
  const unitShortNameById = new Map(
    units.map((unit) => [unit.id, unit.shortName] as const),
  );
  return rows.map((row) => {
    const rawDisplayName = String(row.displayName ?? "").trim();
    const canonicalByUsername =
      canonicalUserDisplayNameByUsername[String(row.username ?? "").trim()];
    const unitShortName = unitShortNameById.get(row.unitId) ?? "";
    const fallback =
      canonicalByUsername ??
      (unitShortName
        ? `${roleFallbackLabel(row.role)} ${unitShortName}`
        : roleFallbackLabel(row.role));
    const shouldUseFallback =
      !rawDisplayName || looksCorruptedThai(rawDisplayName);

    return {
      ...row,
      displayName: shouldUseFallback ? fallback : rawDisplayName,
      active: Boolean(row.active),
      approvalStatus: (row.approvalStatus ?? "approved") as UserApprovalStatus,
      approvedAt: row.approvedAt ?? undefined,
      approvedByUserId: row.approvedByUserId ?? undefined,
    };
  });
}

function normalizedUserDisplayName(
  username: string,
  role: AppUser["role"],
  unitId: string,
  rawDisplayName?: string | null,
): string {
  const canonicalByUsername =
    canonicalUserDisplayNameByUsername[String(username ?? "").trim()];
  const unitShortName =
    serviceUnits.find((unit) => unit.id === unitId)?.shortName ?? "";
  const fallback =
    canonicalByUsername ??
    (unitShortName
      ? `${roleFallbackLabel(role)} ${unitShortName}`
      : roleFallbackLabel(role));
  const raw = String(rawDisplayName ?? "").trim();
  return !raw || looksCorruptedThai(raw) ? fallback : raw;
}

function mapUnits(rows: Array<Record<string, unknown>>): ServiceUnit[] {
  if (!rows.length) {
    return serviceUnits;
  }

  const canonicalById = new Map(serviceUnits.map((unit) => [unit.id, unit] as const));
  const canonicalByCode = new Map(serviceUnits.map((unit) => [unit.code, unit] as const));

  return rows.map((row) => {
    const id = String(row.id);
    const code = String(row.code);
    const shortName = String(row.shortName ?? "");
    const name = String(row.name ?? "");
    const canonical = canonicalById.get(id) ?? canonicalByCode.get(code);
    const shouldUseCanonicalText =
      Boolean(canonical) &&
      (looksCorruptedThai(shortName) || looksCorruptedThai(name) || !shortName || !name);

    return {
      id,
      code,
      shortName: shouldUseCanonicalText
        ? canonical?.shortName ?? shortName
        : shortName,
      name: shouldUseCanonicalText ? canonical?.name ?? name : name,
      kind: (row.kind as ServiceUnit["kind"]) ?? canonical?.kind ?? "rphst",
      color: String(row.color ?? canonical?.color ?? "#6be2d3"),
      description: String(row.description ?? canonical?.description ?? ""),
    };
  });
}

async function ensureAuthSchema() {
  if (!isDbConfigured("palliative")) return;
  const pool = getPool("palliative");
  const [columnsRaw] = await pool.query(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'palliative_users'
  `);
  const columns = new Set(
    (columnsRaw as Array<{ COLUMN_NAME?: string }>)
      .map((row) => String(row.COLUMN_NAME ?? "").toLowerCase())
      .filter(Boolean),
  );

  const migrations: string[] = [];
  if (!columns.has("password_hash")) {
    migrations.push(`ALTER TABLE palliative_users ADD COLUMN password_hash VARCHAR(255) NULL AFTER active`);
  }
  if (!columns.has("approval_status")) {
    migrations.push(
      `ALTER TABLE palliative_users ADD COLUMN approval_status ENUM('approved','pending','rejected') NOT NULL DEFAULT 'approved' AFTER password_hash`,
    );
  }
  if (!columns.has("requested_at")) {
    migrations.push(`ALTER TABLE palliative_users ADD COLUMN requested_at TIMESTAMP NULL AFTER approval_status`);
  }
  if (!columns.has("approved_at")) {
    migrations.push(`ALTER TABLE palliative_users ADD COLUMN approved_at TIMESTAMP NULL AFTER requested_at`);
  }
  if (!columns.has("approved_by_user_id")) {
    migrations.push(`ALTER TABLE palliative_users ADD COLUMN approved_by_user_id VARCHAR(50) NULL AFTER approved_at`);
  }
  if (!columns.has("review_note")) {
    migrations.push(`ALTER TABLE palliative_users ADD COLUMN review_note VARCHAR(255) NULL AFTER approved_by_user_id`);
  }
  if (columns.has("role")) {
    const [roleColumnRows] = await pool.query(`
      SELECT COLUMN_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'palliative_users'
        AND COLUMN_NAME = 'role'
      LIMIT 1
    `);
    const roleColumnType = String(
      (roleColumnRows as Array<{ COLUMN_TYPE?: string }>)[0]?.COLUMN_TYPE ?? "",
    );
    if (!roleColumnType.includes("hospital_executive") || !roleColumnType.includes("hospital_card_room")) {
      migrations.push(`
        ALTER TABLE palliative_users
        MODIFY role ENUM(
          'hospital_admin',
          'hospital_case_manager',
          'hospital_executive',
          'hospital_card_room',
          'hospital_pcu',
          'unit_manager',
          'unit_nurse'
        ) NOT NULL
      `);
    }
  }

  for (const sql of migrations) {
    await pool.query(sql);
  }

  await pool.query(
    `
      UPDATE palliative_users
      SET role = 'hospital_executive',
          unit_id = 'hospital-core',
          active = 1
      WHERE LOWER(username) = 'rukchanoke'
    `,
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS palliative_auth_sessions (
      token_hash VARCHAR(128) NOT NULL,
      user_id VARCHAR(50) NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (token_hash),
      KEY idx_auth_sessions_user (user_id),
      CONSTRAINT fk_auth_sessions_user
        FOREIGN KEY (user_id)
        REFERENCES palliative_users (id)
        ON DELETE CASCADE
    )
  `);

  const [rows] = await pool.query(`
    SELECT id, username
    FROM palliative_users
    WHERE password_hash IS NULL OR password_hash = ''
  `);
  for (const row of rows as Array<{ id: string; username: string }>) {
    const isAdmin = row.username === "hosadmin";
    await pool.query(
      `
        UPDATE palliative_users
        SET
          password_hash = ?,
          approval_status = COALESCE(NULLIF(approval_status, ''), 'approved'),
          requested_at = COALESCE(requested_at, CURRENT_TIMESTAMP),
          approved_at = COALESCE(approved_at, CURRENT_TIMESTAMP)
        WHERE id = ?
      `,
      [hashPassword(isAdmin ? "admin123" : "123456"), row.id],
    );
  }
}

async function ensureHosSyncCacheSchema() {
  if (!isDbConfigured("palliative")) return;
  const pool = getPool("palliative");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS palliative_hos_sync_cache (
      cache_key VARCHAR(80) NOT NULL,
      payload_json JSON NOT NULL,
      refreshed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (cache_key)
    )
  `);
}

async function ensureVisitClinicalSchema() {
  if (!isDbConfigured("palliative")) return;
  const pool = getPool("palliative");
  const [columnsRaw] = await pool.query(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'palliative_visits'
  `);
  const columns = new Set(
    (columnsRaw as Array<{ COLUMN_NAME: string }>).map((row) => row.COLUMN_NAME),
  );
  if (!columns.has("clinical_json")) {
    await pool.query(
      `ALTER TABLE palliative_visits ADD COLUMN clinical_json JSON NULL AFTER checklist_json`,
    );
  }
  if (!columns.has("acp_json")) {
    await pool.query(
      `ALTER TABLE palliative_visits ADD COLUMN acp_json JSON NULL AFTER clinical_json`,
    );
  }
}

async function ensureRegistryDemographicsSchema() {
  if (!isDbConfigured("palliative")) return;
  const pool = getPool("palliative");
  const [columnsRaw] = await pool.query(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'palliative_registry'
  `);
  const columns = new Set(
    (columnsRaw as Array<{ COLUMN_NAME: string }>).map((row) => row.COLUMN_NAME),
  );
  if (!columns.has("birthday")) {
    await pool.query(
      `ALTER TABLE palliative_registry ADD COLUMN birthday DATE NULL AFTER age`,
    );
  }
  if (!columns.has("insurance_group")) {
    await pool.query(
      `ALTER TABLE palliative_registry ADD COLUMN insurance_group VARCHAR(50) NULL AFTER sex`,
    );
  }
}

async function applyLctRegistryExclusions() {
  if (!isDbConfigured("palliative")) return;
  const pool = getPool("palliative");
  const [rows] = await pool.query(`
    SELECT id, full_name AS fullName
    FROM palliative_registry
    WHERE care_status <> 'cancelled'
  `);
  const excludedIds = (rows as Array<{ id: number; fullName: string }>)
    .filter((row) => isLctExcludedPatientName(row.fullName))
    .map((row) => row.id);
  if (!excludedIds.length) return;

  await pool.query(
    `
      UPDATE palliative_registry
      SET care_status = 'cancelled',
          cancellation_reason = 'อยู่ในระบบ LCT แล้ว',
          next_visit_at = NULL
      WHERE id IN (?)
    `,
    [excludedIds],
  );
}

async function applyRegistryUnitOverrides() {
  if (!isDbConfigured("palliative")) return;
  const pool = getPool("palliative");
  const [rows] = await pool.query(`
    SELECT id, hn, assigned_unit_id AS assignedUnitId
    FROM palliative_registry
    WHERE care_status <> 'cancelled'
  `);

  for (const row of rows as Array<{ id: number; hn: string; assignedUnitId: string }>) {
    const unit = getPatientUnitOverride(row.hn);
    if (!unit || row.assignedUnitId === unit.id) continue;
    await pool.query(
      `
        UPDATE palliative_registry
        SET assigned_unit_id = ?,
            assigned_unit_name = ?,
            assigned_unit_kind = ?
        WHERE id = ?
      `,
      [unit.id, unit.name, unit.kind, row.id],
    );
  }
}

function buildSnapshotFromCollections(
  users: AppUser[],
  units: ServiceUnit[],
  patients: PalliativePatient[],
  visits: PalliativeVisit[],
  comments: PatientComment[],
  stmBatches: StmBatch[],
): AppSnapshot {
  const patientMap = patients.map((patient) => ({ ...patient }));

  for (const patient of patientMap) {
    const linkedComments = comments
      .filter((item) => item.patientId === patient.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const linkedVisits = visits
      .filter((item) => item.patientId === patient.id)
      .sort((a, b) => b.visitDate.localeCompare(a.visitDate));
    patient.commentCount = linkedComments.length;
    patient.latestCommentAt = linkedComments[0]?.createdAt;
    patient.lastVisitAt = linkedVisits[0]?.visitDate ?? patient.lastVisitAt;
    patient.claimChecklist.hasPhoto =
      linkedVisits.some((item) => item.photos.length > 0) ||
      patient.claimChecklist.hasPhoto;
    patient.claimChecklist.hasAuthentication =
      linkedVisits.some((item) => Boolean(item.authenCode)) ||
      patient.claimChecklist.hasAuthentication;
    patient.claimChecklist.hasHomeVisitReport =
      linkedVisits.length > 0 || patient.claimChecklist.hasHomeVisitReport;
    patient.claimChecklist.readyForClaim = Boolean(
      patient.claimChecklist.diagZ515 &&
      patient.claimChecklist.diagZ718 &&
      patient.claimChecklist.adp30001 &&
      patient.claimChecklist.eva001 &&
      patient.claimChecklist.cons01 &&
      patient.claimChecklist.hasAuthentication &&
      patient.claimChecklist.hasHomeVisitReport,
    );
  }

  const today = toDateKey();
  const currentMonth = monthKey(today);
  const weekCutoff = new Date(`${today}T00:00:00`);
  weekCutoff.setDate(weekCutoff.getDate() + 7);
  const weekEnd = toDateKey(weekCutoff);

  const unitSummaries: UnitSummary[] = units
    .filter((unit) => unit.kind !== "hospital")
    .map((unit) => {
      const unitPatients = patientMap.filter(
        (patient) =>
          patient.assignedUnitId === unit.id &&
          patient.careStatus !== "cancelled",
      );
      return {
        unitId: unit.id,
        unitName: unit.name,
        unitKind: unit.kind,
        activePatients: unitPatients.filter(
          (patient) => !["completed", "deceased"].includes(patient.careStatus),
        ).length,
        dueThisWeek: unitPatients.filter(
          (patient) =>
            patient.nextVisitAt &&
            patient.nextVisitAt >= today &&
            patient.nextVisitAt <= weekEnd,
        ).length,
        claimReady: unitPatients.filter(
          (patient) => patient.claimChecklist.readyForClaim,
        ).length,
        visitsThisMonth: visits.filter(
          (visit) =>
            visit.unitId === unit.id &&
            monthKey(visit.visitDate) === currentMonth,
        ).length,
        pendingPhotos: unitPatients.filter(
          (patient) => !patient.claimChecklist.hasPhoto,
        ).length,
      };
    });

  const guides = getSnapshot().guides;

  return {
    generatedAt: new Date().toISOString(),
    currentDate: today,
    users,
    units,
    clinicRules,
    patients: patientMap.sort(
      (a, b) =>
        (a.nextVisitAt ?? "9999-12-31").localeCompare(
          b.nextVisitAt ?? "9999-12-31",
        ) || a.fullName.localeCompare(b.fullName),
    ),
    visits: visits.sort(
      (a, b) => b.visitDate.localeCompare(a.visitDate) || b.id - a.id,
    ),
    comments: comments.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    guides,
    unitSummaries,
    dashboard: {
      registeredCount: patientMap.filter(
        (patient) => patient.careStatus !== "cancelled",
      ).length,
      dueToday: patientMap.filter((patient) => patient.nextVisitAt === today)
        .length,
      dueThisWeek: patientMap.filter(
        (patient) =>
          patient.nextVisitAt &&
          patient.nextVisitAt >= today &&
          patient.nextVisitAt <= weekEnd,
      ).length,
      claimReadyCount: patientMap.filter(
        (patient) => patient.claimChecklist.readyForClaim,
      ).length,
      completedThisMonth: visits.filter(
        (visit) => monthKey(visit.visitDate) === currentMonth,
      ).length,
      cancelledCount: patientMap.filter(
        (patient) => patient.careStatus === "cancelled",
      ).length,
      opioidCount: patientMap.filter(
        (patient) => patient.claimChecklist.opioidEligible,
      ).length,
      unreadCoordinationCount: comments.filter(
        (comment) => comment.createdAt.slice(0, 10) >= today,
      ).length,
    },
    stmBatches: stmBatches.sort((a, b) =>
      b.importedAt.localeCompare(a.importedAt),
    ),
  };
}

async function loadDbSnapshot(): Promise<AppSnapshot> {
  await ensureAuthSchema();
  await ensureVisitClinicalSchema();
  await ensureRegistryDemographicsSchema();
  await applyLctRegistryExclusions();
  await applyRegistryUnitOverrides();
  const pool = getPool("palliative");
  const [unitRows] = await pool.query(
    `SELECT id, code, short_name AS shortName, name, kind, color, description FROM palliative_units ORDER BY sort_order ASC, name ASC`,
  );
  const [userRows] = await pool.query(
    `
      SELECT
        id,
        username,
        display_name AS displayName,
        role,
        unit_id AS unitId,
        active,
        approval_status AS approvalStatus,
        approved_at AS approvedAt,
        approved_by_user_id AS approvedByUserId
      FROM palliative_users
      ORDER BY username ASC
    `,
  );
  const [patientRows] = await pool.query(`
    SELECT
      id,
      hn,
      cid,
      full_name AS fullName,
      age,
      birthday,
      sex,
      insurance_group AS insuranceGroup,
      assigned_unit_id AS assignedUnitId,
      assigned_unit_name AS assignedUnitName,
      assigned_unit_kind AS assignedUnitKind,
      primary_dx_code AS primaryDxCode,
      primary_dx_name AS primaryDxName,
      care_status AS careStatus,
      eligible_reason AS eligibleReason,
      phone,
      relative_phone AS relativePhone,
      line_id AS lineId,
      address,
      notes,
      registered_at AS registeredAt,
      registered_by_user_id AS registeredByUserId,
      last_visit_at AS lastVisitAt,
      next_visit_at AS nextVisitAt,
      service_month_count AS serviceMonthCount,
      visit_window_start AS visitWindowStart,
      visit_window_end AS visitWindowEnd,
      claim_checklist_json AS claimChecklistJson,
      cancellation_reason AS cancellationReason,
      discharged_at AS dischargedAt
    FROM palliative_registry
  `);
  const [visitRows] = await pool.query(`
    SELECT
      id,
      patient_id AS patientId,
      unit_id AS unitId,
      visit_date AS visitDate,
      scheduled_date AS scheduledDate,
      rescheduled_from AS rescheduledFrom,
      status,
      visitor_user_id AS visitorUserId,
      visitor_name AS visitorName,
      authen_code AS authenCode,
      symptoms,
      note,
      checklist_json AS checklistJson,
      clinical_json AS clinicalJson,
      acp_json AS acpJson,
      photos_json AS photosJson,
      created_at AS createdAt
    FROM palliative_visits
  `);
  const [commentRows] = await pool.query(`
    SELECT
      id,
      patient_id AS patientId,
      unit_id AS unitId,
      author_user_id AS authorUserId,
      author_name AS authorName,
      audience,
      body,
      created_at AS createdAt
    FROM palliative_comments
  `);
  const [batchRows] = await pool.query(`
    SELECT
      id,
      file_name AS fileName,
      imported_at AS importedAt,
      imported_by_user_id AS importedByUserId,
      imported_by_name AS importedByName,
      default_split_percent AS defaultSplitPercent
    FROM palliative_stm_batches
  `);
  const [stmRows] = await pool.query(`
    SELECT
      id,
      batch_id AS batchId,
      hn,
      patient_name AS patientName,
      amount,
      unit_id AS unitId,
      claim_month AS claimMonth,
      note
    FROM palliative_stm_rows
  `);

  const units = mapUnits(unitRows as Array<Record<string, unknown>>);
  const users = normalizeDbUsers(userRows as DbUserRow[], units);
  const unitNameById = new Map(units.map((unit) => [unit.id, unit.name] as const));
  const unitKindById = new Map(units.map((unit) => [unit.id, unit.kind] as const));
  const patients: PalliativePatient[] = (patientRows as DbPatientRow[])
    .map((row) => ({
      ...row,
      birthday: asDateKey(row.birthday) || undefined,
      insuranceGroup: row.insuranceGroup ?? undefined,
      assignedUnitName: unitNameById.get(row.assignedUnitId) ?? row.assignedUnitName,
      assignedUnitKind:
        (unitKindById.get(row.assignedUnitId) as
          | PalliativePatient["assignedUnitKind"]
          | undefined) ?? row.assignedUnitKind,
      phone: row.phone ?? undefined,
      relativePhone: row.relativePhone ?? undefined,
      lineId: row.lineId ?? undefined,
      address: row.address ?? undefined,
      notes: row.notes ?? "",
      lastVisitAt: row.lastVisitAt ?? undefined,
      nextVisitAt: row.nextVisitAt ?? undefined,
      cancellationReason: row.cancellationReason ?? undefined,
      dischargedAt: row.dischargedAt ?? undefined,
      visitWindow: {
        startDate: row.visitWindowStart,
        endDate: row.visitWindowEnd,
      },
      claimChecklist: parseJson(row.claimChecklistJson, buildClaimChecklist({})),
      historicalVisitDates: [],
      commentCount: 0,
    }))
    .filter((patient) => !isLctExcludedPatientName(patient.fullName));
  const visits = (visitRows as DbVisitRow[]).map((row) => ({
    ...row,
    rescheduledFrom: row.rescheduledFrom ?? undefined,
    authenCode: row.authenCode ?? undefined,
    checklist: parseJson<VisitChecklist>(
      row.checklistJson,
      defaultVisitChecklist(),
    ),
    clinical: parseJson<VisitClinicalAssessment | undefined>(
      row.clinicalJson,
      undefined,
    ),
    advanceCarePlan: parseJson<AdvanceCarePlanDocument | undefined>(
      row.acpJson,
      undefined,
    ),
    photos: parseJson(row.photosJson, []),
  }));
  const comments = (commentRows as DbCommentRow[]).map((row) => ({ ...row }));
  const rowsByBatch = new Map<string, StmRow[]>();
  for (const row of stmRows as DbStmRow[]) {
    const list = rowsByBatch.get(row.batchId) ?? [];
    list.push({
      id: row.id,
      batchId: row.batchId,
      hn: row.hn,
      patientName: row.patientName,
      amount: Number(row.amount),
      unitId: row.unitId,
      claimMonth: row.claimMonth,
      note: row.note ?? undefined,
    });
    rowsByBatch.set(row.batchId, list);
  }
  const stmBatches = (batchRows as DbStmBatchRow[]).map((batch) => {
    const rows = rowsByBatch.get(batch.id) ?? [];
    const allocationsMap = new Map<
      string,
      { totalAmount: number; rowCount: number }
    >();
    rows.forEach((row) => {
      const current = allocationsMap.get(row.unitId) ?? {
        totalAmount: 0,
        rowCount: 0,
      };
      current.totalAmount += row.amount;
      current.rowCount += 1;
      allocationsMap.set(row.unitId, current);
    });

    return {
      ...batch,
      rows,
      allocations: [...allocationsMap.entries()].map(([unitId, summary]) => ({
        unitId,
        unitName: units.find((item) => item.id === unitId)?.name ?? unitId,
        percent: batch.defaultSplitPercent,
        totalAmount: summary.totalAmount,
        allocatedAmount: Math.round(
          (summary.totalAmount * batch.defaultSplitPercent) / 100,
        ),
        rowCount: summary.rowCount,
      })),
    };
  });

  if (patients.length && isDbConfigured("hos")) {
    const hosPool = getPool("hos");
    const visitDateMap = new Map<string, string[]>();
    const hns = [...new Set(patients.map((patient) => patient.hn).filter(Boolean))];
    const chunkSize = 120;
    for (let start = 0; start < hns.length; start += chunkSize) {
      const chunk = hns.slice(start, start + chunkSize);
      const placeholders = chunk.map(() => "?").join(", ");
      const [visitDateRows] = await hosPool.query(
        `
          SELECT
            o.hn,
            o.vstdate AS visitDate
          FROM ovst o
          WHERE o.hn IN (${placeholders})
            AND EXISTS (
              SELECT 1 FROM ovstdiag d0
              WHERE d0.vn = o.vn
                AND UPPER(REPLACE(d0.icd10, '.', '')) REGEXP '^(B2[0-4]|C|D[0-4]|I5|I6|J44|K704|K717|K72|N185)'
            )
            AND EXISTS (
              SELECT 1 FROM ovstdiag d1
              WHERE d1.vn = o.vn
                AND UPPER(REPLACE(d1.icd10, '.', '')) = 'Z515'
            )
            AND EXISTS (
              SELECT 1 FROM ovstdiag d2
              WHERE d2.vn = o.vn
                AND UPPER(REPLACE(d2.icd10, '.', '')) = 'Z718'
            )
            AND EXISTS (
              SELECT 1
              FROM opitemrece op1
              LEFT JOIN drugitems di1 ON di1.icode = op1.icode
              LEFT JOIN s_drugitems sdi1 ON sdi1.icode = op1.icode
              WHERE op1.vn = o.vn
                AND UPPER(COALESCE(di1.nhso_adp_code, sdi1.nhso_adp_code, '')) = 'EVA001'
            )
            AND EXISTS (
              SELECT 1
              FROM opitemrece op2
              LEFT JOIN drugitems di2 ON di2.icode = op2.icode
              LEFT JOIN s_drugitems sdi2 ON sdi2.icode = op2.icode
              WHERE op2.vn = o.vn
                AND UPPER(COALESCE(di2.nhso_adp_code, sdi2.nhso_adp_code, '')) = 'CONS01'
            )
          ORDER BY o.hn, o.vstdate ASC, o.vn ASC
        `,
        chunk,
      );

      for (const row of visitDateRows as HosVisitDateRow[]) {
        const key = String(row.hn ?? "").trim();
        const visitDate = asDateKey(row.visitDate);
        if (!key || !visitDate) continue;
        const current = visitDateMap.get(key) ?? [];
        if (!current.includes(visitDate) && current.length < REQUIRED_COMPLETE_VISITS) {
          current.push(visitDate);
          visitDateMap.set(key, current);
        }
      }
    }

    for (const patient of patients) {
      patient.historicalVisitDates = visitDateMap.get(patient.hn) ?? [];
    }
  }

  return buildSnapshotFromCollections(
    users,
    units,
    patients,
    visits,
    comments,
    stmBatches,
  );
}

export async function getAppSnapshot(): Promise<AppSnapshot> {
  if (!isDbConfigured("palliative")) {
    return getSnapshot();
  }

  try {
    return await loadDbSnapshot();
  } catch {
    return getSnapshot();
  }
}

function bool(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || value === "Y";
}

function normalizeInsuranceGroup(value?: string): string {
  return (value ?? "").toUpperCase().replaceAll(/\s+/g, "").trim();
}

function hasAllowedInsuranceGroup(value?: string): boolean {
  const normalized = normalizeInsuranceGroup(value);
  return normalized === "UCS" || normalized === "WEL";
}

function matchesCandidateInsuranceGroup(value?: string): boolean {
  const normalized = normalizeInsuranceGroup(value);
  if (!normalized) return true;
  return hasAllowedInsuranceGroup(normalized);
}

function matchesCandidateMode(
  candidate: Pick<HosCandidate, "claimChecklist" | "serviceCount">,
  mode: CandidateFilterMode,
): boolean {
  const checklist = candidate.claimChecklist;
  if (mode === "missing_any_z") {
    return !checklist.diagZ515 || !checklist.diagZ718;
  }
  if (mode === "missing_both_z") {
    return !checklist.diagZ515 && !checklist.diagZ718;
  }
  if (mode === "z_done_but_visit_incomplete") {
    return (
      checklist.diagZ515 &&
      checklist.diagZ718 &&
      candidate.serviceCount < REQUIRED_COMPLETE_VISITS
    );
  }
  return true;
}

function matchesCandidateDxGroup(
  primaryDxCode: string,
  dxGroup: CandidateDxGroup,
): boolean {
  if (dxGroup === "all") return true;
  return classifyCandidateDxGroup(primaryDxCode) === dxGroup;
}

function normalizeCode(code?: string): string {
  return (code ?? "").toUpperCase().replaceAll(".", "").trim();
}

function asDateKey(value?: unknown): string {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return text.slice(0, 10);
}

function isDiseaseDiagCode(code: string): boolean {
  const normalized = normalizeCode(code);
  if (!normalized) return false;
  return /^(B2[0-4]|C|D[0-4]|I5|I6|J44|K704|K717|K72|N185)/.test(normalized);
}

function buildVisitCriteriaStatus(diagCodes: string[], adpCodes: string[]) {
  const normalizedDiag = diagCodes.map((code) => normalizeCode(code));
  const normalizedAdp = new Set(adpCodes.map((code) => normalizeCode(code)));
  const hasDiseaseDiag = normalizedDiag.some((code) => isDiseaseDiagCode(code));
  const hasZ515 = normalizedDiag.includes("Z515");
  const hasZ718 = normalizedDiag.includes("Z718");
  const hasEva001 = normalizedAdp.has("EVA001");
  const hasCons01 = normalizedAdp.has("CONS01");

  const missingCriteria: string[] = [];
  if (!hasDiseaseDiag) missingCriteria.push("Diag กลุ่มโรค");
  if (!hasZ515) missingCriteria.push("Z51.5");
  if (!hasZ718) missingCriteria.push("Z71.8");
  if (!hasEva001) missingCriteria.push("EVA001");
  if (!hasCons01) missingCriteria.push("CONS01");

  return {
    isCompleteByCriteria: missingCriteria.length === 0,
    missingCriteria,
  };
}

function hasBothZCodes(diagCodes: string[]): boolean {
  const normalized = diagCodes.map((code) => normalizeCode(code));
  return normalized.includes("Z515") && normalized.includes("Z718");
}

function candidateIdentityKey(candidate: HosCandidate): string {
  if (candidate.hn.trim()) return `hn:${candidate.hn.trim()}`;
  if (candidate.cid.trim()) return `cid:${candidate.cid.trim()}`;
  return `${candidate.fullName.trim()}|${candidate.visitDate}`;
}

function candidateUnitWeight(candidate: HosCandidate): number {
  const kind = serviceUnits.find((unit) => unit.id === candidate.unitId)?.kind;
  if (kind === "rphst") return 3;
  if (kind === "pcu") return 2;
  return 1;
}

function pickBetterCandidate(
  current: HosCandidate,
  incoming: HosCandidate,
): HosCandidate {
  const incomingReadySignals =
    Number(incoming.claimChecklist.diagZ515) +
    Number(incoming.claimChecklist.diagZ718) +
    Number(incoming.claimChecklist.adp30001) +
    Number(incoming.claimChecklist.eva001) +
    Number(incoming.claimChecklist.cons01);
  const currentReadySignals =
    Number(current.claimChecklist.diagZ515) +
    Number(current.claimChecklist.diagZ718) +
    Number(current.claimChecklist.adp30001) +
    Number(current.claimChecklist.eva001) +
    Number(current.claimChecklist.cons01);

  if (incomingReadySignals !== currentReadySignals) {
    return incomingReadySignals > currentReadySignals ? incoming : current;
  }

  const incomingWeight = candidateUnitWeight(incoming);
  const currentWeight = candidateUnitWeight(current);
  if (incomingWeight !== currentWeight) {
    return incomingWeight > currentWeight ? incoming : current;
  }

  return current;
}

async function getRegisteredIdentifiers() {
  if (!isDbConfigured("palliative")) {
    const snapshot = getSnapshot();
    const patients = snapshot.patients.filter(
      (patient) => !isLctExcludedPatientName(patient.fullName),
    );
    return {
      hnSet: new Set(patients.map((patient) => patient.hn)),
      cidSet: new Set(patients.map((patient) => patient.cid)),
    };
  }

  const pool = getPool("palliative");
  const [rows] = await pool.query(
    `SELECT hn, cid FROM palliative_registry WHERE care_status <> 'cancelled'`,
  );
  const entries = rows as Array<{ hn?: string; cid?: string }>;
  return {
    hnSet: new Set(entries.map((row) => row.hn).filter(Boolean) as string[]),
    cidSet: new Set(entries.map((row) => row.cid).filter(Boolean) as string[]),
  };
}

export async function getHosCandidates(
  visitDate?: string,
  clinicShortName = "all",
  searchTerm = "",
  candidateMode: CandidateFilterMode = "all",
  dxGroup: CandidateDxGroup = "all",
  includeRegistered = false,
): Promise<HosCandidate[]> {
  const anchorDate = visitDate?.trim() || toDateKey();
  const useDateFilter = Boolean(visitDate?.trim());
  const registered = await getRegisteredIdentifiers();
  if (!isDbConfigured("hos")) {
    const snapshot = getSnapshot();
    return snapshot.patients
      .filter((patient) =>
        clinicShortName === "all"
          ? true
          : patient.assignedUnitName.includes(clinicShortName) ||
            patient.assignedUnitId === clinicShortName,
      )
      .map((patient) => ({
        hn: patient.hn,
        cid: patient.cid,
        fullName: patient.fullName,
        age: patient.age,
        birthday: patient.birthday,
        sex: patient.sex,
        unitId: patient.assignedUnitId,
        clinicName: patient.assignedUnitName,
        clinicShortName: patient.assignedUnitName,
        insuranceGroup: patient.insuranceGroup,
        primaryDxCode: patient.primaryDxCode,
        primaryDxName: patient.primaryDxName,
        phone: patient.phone,
        address: patient.address,
        visitDate: patient.lastVisitAt ?? anchorDate,
        lastServiceAt: patient.lastVisitAt,
        serviceCount: patient.serviceMonthCount,
        incompleteVisitCount: 0,
        eligibleReason: patient.eligibleReason,
        claimChecklist: patient.claimChecklist,
      }))
      .filter((row) =>
        includeRegistered
          ? true
          : !registered.hnSet.has(row.hn) && !registered.cidSet.has(row.cid),
      )
      .filter((row) => !isLctExcludedPatientName(row.fullName))
      .filter(
        (row) =>
          !searchTerm.trim() ||
          `${row.hn} ${row.fullName}`
            .toLowerCase()
            .includes(searchTerm.toLowerCase()),
      )
      .filter((row) => matchesCandidateMode(row, candidateMode))
      .filter((row) => matchesCandidateDxGroup(row.primaryDxCode, dxGroup))
      .filter((row) => matchesCandidateInsuranceGroup(row.insuranceGroup));
  }

  const pool = getPool("hos");
  const rules =
    clinicShortName === "all"
      ? clinicRules
      : clinicRules.filter(
          (rule) =>
            rule.shortName === clinicShortName ||
            rule.unitId === clinicShortName,
        );
  const candidates: HosCandidate[] = [];

  for (const rule of rules) {
    const sql = useDateFilter
      ? buildCandidateSql(rule, "?")
      : buildCandidateAliveSql(rule);
    const params = useDateFilter ? [anchorDate, anchorDate] : [];
    const [rows] = await pool.query(sql, params);
    for (const row of rows as CandidateRow[]) {
      const primaryDxCode = String(row.pdx ?? "");
      const insuranceGroup = String(row.pttype ?? "").trim() || undefined;
      const checklist = buildClaimChecklist({
        diagZ515: bool(row.diagZ515),
        diagZ718: bool(row.diagZ718),
        adp30001: bool(row.adp30001),
        eva001: bool(row.eva001),
        cons01: bool(row.cons01),
        hasAuthentication: false,
        hasHomeVisitReport: false,
        hasPhoto: false,
        opioidEligible: isOpioidEligibleCode(primaryDxCode),
      });

      const candidate: HosCandidate = {
        hn: String(row.hn ?? ""),
        cid: String(row.cid ?? ""),
        fullName: String(row.fullname ?? ""),
        age: Number.parseInt(String(row.age ?? "0"), 10) || 0,
        birthday: asDateKey(row.birthday) || undefined,
        sex: row.sex === "M" ? "M" : "F",
        unitId: String(row.unitId ?? rule.unitId),
        clinicName: String(row.clinicName ?? rule.clinicName),
        clinicShortName: String(row.clinicShortName ?? rule.shortName),
        insuranceGroup,
        primaryDxCode,
        primaryDxName: String(row.primaryDxName ?? primaryDxCode),
        phone: typeof row.TelNo === "string" ? row.TelNo : undefined,
        address:
          typeof row.full_address === "string" ? row.full_address : undefined,
        visitDate:
          typeof row.visitDate === "string" && row.visitDate
            ? row.visitDate
            : anchorDate,
        lastServiceAt:
          typeof row.lastServiceAt === "string" ? row.lastServiceAt : undefined,
        serviceCount: Number.parseInt(String(row.serviceCount ?? "0"), 10) || 0,
        incompleteVisitCount:
          Number.parseInt(String(row.incompleteVisitCount ?? "0"), 10) || 0,
        eligibleReason: describeEligibility(primaryDxCode),
        claimChecklist: checklist,
      };

      const unitOverride = getPatientUnitOverride(candidate.hn);
      if (unitOverride) {
        candidate.unitId = unitOverride.id;
        candidate.clinicName = unitOverride.name;
        candidate.clinicShortName = unitOverride.shortName;
      }

      if (isLctExcludedPatientName(candidate.fullName)) {
        continue;
      }

      const keyword = searchTerm.trim().toLowerCase();
      if (
        keyword &&
        !`${candidate.hn} ${candidate.cid} ${candidate.fullName} ${candidate.primaryDxCode}`
          .toLowerCase()
          .includes(keyword)
      ) {
        continue;
      }
      if (!matchesCandidateMode(candidate, candidateMode)) {
        continue;
      }
      if (!matchesCandidateDxGroup(candidate.primaryDxCode, dxGroup)) {
        continue;
      }
      if (!hasAllowedInsuranceGroup(candidate.insuranceGroup)) {
        continue;
      }
      if (
        !includeRegistered &&
        (registered.hnSet.has(candidate.hn) ||
          registered.cidSet.has(candidate.cid))
      ) {
        continue;
      }
      candidates.push(candidate);
    }
  }

  const deduped = new Map<string, HosCandidate>();
  for (const candidate of candidates) {
    const key = candidateIdentityKey(candidate);
    const current = deduped.get(key);
    if (!current) {
      deduped.set(key, candidate);
      continue;
    }
    deduped.set(key, pickBetterCandidate(current, candidate));
  }

  return [...deduped.values()];
}

export async function getHosCandidateHistory(
  hn: string,
  limit = 12,
): Promise<CandidateVisitHistory[]> {
  const normalizedHn = hn.trim();
  if (!normalizedHn) return [];
  const normalizedLimit = Math.max(1, Math.trunc(limit));
  const fetchLimit = Math.max(normalizedLimit * 10, 60);

  if (!isDbConfigured("hos")) {
    const snapshot = getSnapshot();
    const patient = snapshot.patients.find((item) => item.hn === normalizedHn);
    if (!patient) return [];
    const rows = snapshot.visits
      .filter((visit) => visit.patientId === patient.id)
      .sort((a, b) => b.visitDate.localeCompare(a.visitDate) || b.id - a.id)
      .slice(0, fetchLimit)
      .map((visit) => {
        const diagCodes = [patient.primaryDxCode];
        const adpCodes: string[] = [];
        const criteria = buildVisitCriteriaStatus(diagCodes, adpCodes);
        return {
          vn: String(visit.id),
          visitDate: visit.visitDate,
          primaryDxCode: patient.primaryDxCode,
          diagCodes,
          adpCodes,
          isCompleteByCriteria: criteria.isCompleteByCriteria,
          missingCriteria: criteria.missingCriteria,
          opitems: [],
        };
      });
    return rows
      .filter(
        (visit) =>
          visit.isCompleteByCriteria && hasBothZCodes(visit.diagCodes),
      )
      .slice(0, normalizedLimit);
  }

  const pool = getPool("hos");
  const [visitRows] = await pool.query(
    `
      SELECT
        o.vn,
        o.vstdate AS visitDate,
        COALESCE(vs.pdx, '') AS primaryDxCode
      FROM ovst o
      LEFT JOIN vn_stat vs ON vs.vn = o.vn
      LEFT JOIN patient p ON p.hn = o.hn
      WHERE o.hn = ?
        AND COALESCE(p.death, 'N') <> 'Y'
        AND EXISTS (
          SELECT 1
          FROM ovstdiag d
          WHERE d.vn = o.vn
            AND UPPER(REPLACE(d.icd10, '.', '')) REGEXP '^(B2[0-4]|C|D[0-4]|I5|I6|J44|K704|K717|K72|N185|Z515|Z718)'
        )
      ORDER BY o.vstdate DESC, o.vn DESC
      LIMIT ?
    `,
    [normalizedHn, fetchLimit],
  );
  const visits = visitRows as Array<{
    vn: string;
    visitDate: string;
    primaryDxCode: string;
  }>;
  if (!visits.length) return [];

  const vns = visits.map((visit) => visit.vn);
  const placeholders = vns.map(() => "?").join(", ");

  const [diagRows] = await pool.query(
    `
      SELECT
        vn,
        UPPER(REPLACE(icd10, '.', '')) AS diagCode
      FROM ovstdiag
      WHERE vn IN (${placeholders})
      ORDER BY vn, diagtype, icd10
    `,
    vns,
  );
  let opRows: unknown;
  try {
    const [rowsWithSDrugitems] = await pool.query(
      `
        SELECT
          op.vn,
          op.icode,
          COALESCE(sdi.name, di.name, op.icode) AS itemName,
          UPPER(COALESCE(di.nhso_adp_code, sdi.nhso_adp_code, '')) AS adpCode,
          SUM(COALESCE(op.qty, 0)) AS qty,
          SUM(COALESCE(op.sum_price, 0)) AS totalPrice
        FROM opitemrece op
        LEFT JOIN s_drugitems sdi ON sdi.icode = op.icode
        LEFT JOIN drugitems di ON di.icode = op.icode
        WHERE op.vn IN (${placeholders})
        GROUP BY op.vn, op.icode, itemName, adpCode
        ORDER BY op.vn, op.icode
      `,
      vns,
    );
    opRows = rowsWithSDrugitems;
  } catch {
    const [rowsFallback] = await pool.query(
      `
        SELECT
          op.vn,
          op.icode,
          COALESCE(di.name, op.icode) AS itemName,
          UPPER(COALESCE(di.nhso_adp_code, '')) AS adpCode,
          SUM(COALESCE(op.qty, 0)) AS qty,
          SUM(COALESCE(op.sum_price, 0)) AS totalPrice
        FROM opitemrece op
        LEFT JOIN drugitems di ON di.icode = op.icode
        WHERE op.vn IN (${placeholders})
        GROUP BY op.vn, op.icode, itemName, adpCode
        ORDER BY op.vn, op.icode
      `,
      vns,
    );
    opRows = rowsFallback;
  }

  const diagMap = new Map<string, string[]>();
  for (const row of diagRows as Array<{ vn: string; diagCode?: string }>) {
    const code = String(row.diagCode ?? "").trim();
    if (!code) continue;
    const list = diagMap.get(row.vn) ?? [];
    if (!list.includes(code)) list.push(code);
    diagMap.set(row.vn, list);
  }

  const opitemMap = new Map<string, CandidateVisitHistory["opitems"]>();
  for (const row of opRows as Array<Record<string, unknown>>) {
    const vn = String(row.vn ?? "");
    if (!vn) continue;
    const list = opitemMap.get(vn) ?? [];
    list.push({
      icode: String(row.icode ?? ""),
      itemName: String(row.itemName ?? row.icode ?? ""),
      adpCode: String(row.adpCode ?? "").trim() || undefined,
      qty: Number(row.qty ?? 0),
      totalPrice: Number(row.totalPrice ?? 0),
    });
    opitemMap.set(vn, list);
  }

  const rows = visits.map((visit) => {
    const diagCodes = diagMap.get(visit.vn) ?? [];
    const opitems = opitemMap.get(visit.vn) ?? [];
    const adpCodes = [
      ...new Set(
        opitems
          .map((item) => item.adpCode)
          .filter(Boolean) as string[],
      ),
    ];
    const criteria = buildVisitCriteriaStatus(diagCodes, adpCodes);
    return {
      vn: visit.vn,
      visitDate: visit.visitDate,
      primaryDxCode: visit.primaryDxCode,
      diagCodes,
      adpCodes,
      isCompleteByCriteria: criteria.isCompleteByCriteria,
      missingCriteria: criteria.missingCriteria,
      opitems,
    };
  });

  return rows
    .filter(
      (visit) =>
        visit.isCompleteByCriteria && hasBothZCodes(visit.diagCodes),
    )
    .slice(0, normalizedLimit);
}

async function loadHosCompleteVisitProgressByHns(hns: string[]) {
  const progressByHn = new Map<string, { completeCount: number; lastCompleteAt?: string }>();
  const normalizedHns = [...new Set(hns.map((hn) => hn.trim()).filter(Boolean))];
  if (!normalizedHns.length || !isDbConfigured("hos")) return progressByHn;

  const hosPool = getPool("hos");
  const chunkSize = 200;
  for (let start = 0; start < normalizedHns.length; start += chunkSize) {
    const chunk = normalizedHns.slice(start, start + chunkSize);
    const placeholders = chunk.map(() => "?").join(", ");
    const [countRows] = await hosPool.query(
      `
        SELECT
          o.hn,
          COUNT(DISTINCT o.vn) AS completeCount,
          MAX(o.vstdate) AS lastCompleteAt
        FROM ovst o
        LEFT JOIN patient p ON p.hn = o.hn
        WHERE o.hn IN (${placeholders})
          AND COALESCE(p.death, 'N') <> 'Y'
          AND EXISTS (
            SELECT 1 FROM ovstdiag d0
            WHERE d0.vn = o.vn
              AND UPPER(REPLACE(d0.icd10, '.', '')) REGEXP '^(B2[0-4]|C|D[0-4]|I5|I6|J44|K704|K717|K72|N185)'
          )
          AND EXISTS (
            SELECT 1 FROM ovstdiag d1
            WHERE d1.vn = o.vn AND UPPER(REPLACE(d1.icd10, '.', '')) = 'Z515'
          )
          AND EXISTS (
            SELECT 1 FROM ovstdiag d2
            WHERE d2.vn = o.vn AND UPPER(REPLACE(d2.icd10, '.', '')) = 'Z718'
          )
          AND EXISTS (
          SELECT 1
          FROM opitemrece op1
          LEFT JOIN drugitems di1 ON di1.icode = op1.icode
          LEFT JOIN s_drugitems sdi1 ON sdi1.icode = op1.icode
          WHERE op1.vn = o.vn
            AND UPPER(COALESCE(di1.nhso_adp_code, sdi1.nhso_adp_code, '')) = 'EVA001'
        )
        AND EXISTS (
          SELECT 1
          FROM opitemrece op2
          LEFT JOIN drugitems di2 ON di2.icode = op2.icode
          LEFT JOIN s_drugitems sdi2 ON sdi2.icode = op2.icode
          WHERE op2.vn = o.vn
            AND UPPER(COALESCE(di2.nhso_adp_code, sdi2.nhso_adp_code, '')) = 'CONS01'
        )
      GROUP BY o.hn
      `,
      chunk,
    );
    for (const row of countRows as Array<{ hn: string; completeCount: number; lastCompleteAt?: string }>) {
      progressByHn.set(row.hn, {
        completeCount: Number(row.completeCount ?? 0),
        lastCompleteAt: row.lastCompleteAt ? asDateKey(row.lastCompleteAt) : undefined,
      });
    }
  }

  return progressByHn;
}

export async function getHosProgressSummary(options?: {
  userId?: string;
  clinicShortName?: string;
  forceRefresh?: boolean;
  maxCacheMinutes?: number;
}): Promise<HosProgressSummary> {
  const clinicShortName = options?.clinicShortName ?? "all";
  const forceRefresh = Boolean(options?.forceRefresh);
  const maxCacheMinutes = Math.min(720, Math.max(5, Math.trunc(options?.maxCacheMinutes ?? 60)));

  const buildSummaryFromRegistry = async (): Promise<HosProgressSummary> => {
    if (!isDbConfigured("palliative")) {
      const snapshot = await getAppSnapshot();
      const inProgressCount = snapshot.patients.filter(
        (patient) =>
          patient.claimChecklist.diagZ515 &&
          patient.claimChecklist.diagZ718 &&
          patient.claimChecklist.eva001 &&
          patient.claimChecklist.cons01 &&
          patient.serviceMonthCount > 0 &&
          patient.serviceMonthCount < REQUIRED_COMPLETE_VISITS &&
          patient.careStatus !== "cancelled" &&
          patient.careStatus !== "deceased",
      ).length;
      const completedCount = snapshot.patients.filter(
        (patient) =>
          patient.claimChecklist.diagZ515 &&
          patient.claimChecklist.diagZ718 &&
          patient.claimChecklist.eva001 &&
          patient.claimChecklist.cons01 &&
          patient.serviceMonthCount >= REQUIRED_COMPLETE_VISITS,
      ).length;
      return {
        inProgressCount,
        completedCount,
        importedInProgress: 0,
        importedCompleted: 0,
        refreshedAt: new Date().toISOString(),
        fromCache: true,
      };
    }

    const pool = getPool("palliative");
    const unitClause =
      clinicShortName === "all"
        ? ""
        : " AND assigned_unit_id IN (SELECT id FROM palliative_units WHERE id = ? OR short_name = ?)";
    const queryParams =
      clinicShortName === "all"
        ? [REQUIRED_COMPLETE_VISITS, REQUIRED_COMPLETE_VISITS]
        : [
            REQUIRED_COMPLETE_VISITS,
            REQUIRED_COMPLETE_VISITS,
            clinicShortName,
            clinicShortName,
          ];
    const [rows] = await pool.query(
      `
        SELECT
          SUM(
            CASE
              WHEN care_status NOT IN ('cancelled', 'deceased')
               AND service_month_count > 0
               AND service_month_count < ?
               AND JSON_UNQUOTE(JSON_EXTRACT(claim_checklist_json, '$.diagZ515')) = 'true'
               AND JSON_UNQUOTE(JSON_EXTRACT(claim_checklist_json, '$.diagZ718')) = 'true'
               AND JSON_UNQUOTE(JSON_EXTRACT(claim_checklist_json, '$.eva001')) = 'true'
               AND JSON_UNQUOTE(JSON_EXTRACT(claim_checklist_json, '$.cons01')) = 'true'
              THEN 1 ELSE 0
            END
          ) AS inProgressCount,
          SUM(
            CASE
              WHEN service_month_count >= ?
               AND JSON_UNQUOTE(JSON_EXTRACT(claim_checklist_json, '$.diagZ515')) = 'true'
               AND JSON_UNQUOTE(JSON_EXTRACT(claim_checklist_json, '$.diagZ718')) = 'true'
               AND JSON_UNQUOTE(JSON_EXTRACT(claim_checklist_json, '$.eva001')) = 'true'
               AND JSON_UNQUOTE(JSON_EXTRACT(claim_checklist_json, '$.cons01')) = 'true'
              THEN 1 ELSE 0
            END
          ) AS completedCount
        FROM palliative_registry
        WHERE 1 = 1
        ${unitClause}
      `,
      queryParams,
    );
    const row = (rows as Array<{ inProgressCount?: number; completedCount?: number }>)[0] ?? {};
    return {
      inProgressCount: Number(row.inProgressCount ?? 0),
      completedCount: Number(row.completedCount ?? 0),
      importedInProgress: 0,
      importedCompleted: 0,
      refreshedAt: new Date().toISOString(),
      fromCache: true,
    };
  };

  if (!forceRefresh) {
    return buildSummaryFromRegistry();
  }

  if (!isDbConfigured("hos") || !isDbConfigured("palliative")) {
    return buildSummaryFromRegistry();
  }

  await ensureHosSyncCacheSchema();
  const cachePool = getPool("palliative");
  const cacheKey = `hos-progress:${clinicShortName}`;
  const [cacheRows] = await cachePool.query(
    `
      SELECT payload_json AS payloadJson, refreshed_at AS refreshedAt
      FROM palliative_hos_sync_cache
      WHERE cache_key = ?
      LIMIT 1
    `,
    [cacheKey],
  );
  const cached = (
    cacheRows as Array<{ payloadJson?: string; refreshedAt?: string }>
  )[0];
  if (cached?.payloadJson && cached.refreshedAt && !options?.userId) {
    const ageMs = Date.now() - new Date(String(cached.refreshedAt)).getTime();
    if (ageMs <= maxCacheMinutes * 60_000) {
      const parsed = parseJson<HosProgressSummary>(cached.payloadJson, {
        inProgressCount: 0,
        completedCount: 0,
        importedInProgress: 0,
        importedCompleted: 0,
        refreshedAt: String(cached.refreshedAt),
        fromCache: true,
      });
      return { ...parsed, refreshedAt: String(cached.refreshedAt), fromCache: true };
    }
  }

  const palliativePool = getPool("palliative");
  const [registryRows] = await palliativePool.query(
    `
      SELECT
        id,
        hn,
        care_status AS careStatus,
        service_month_count AS serviceMonthCount
      FROM palliative_registry
      WHERE care_status NOT IN ('cancelled', 'deceased')
    `,
  );
  const registry = registryRows as Array<{
    id: number;
    hn: string;
    careStatus: PalliativePatient["careStatus"];
    serviceMonthCount: number;
  }>;
  if (!registry.length && !options?.userId) {
    const emptySummary = await buildSummaryFromRegistry();
    await palliativePool.query(
      `
        INSERT INTO palliative_hos_sync_cache (cache_key, payload_json, refreshed_at)
        VALUES (?, ?, NOW())
        ON DUPLICATE KEY UPDATE payload_json = VALUES(payload_json), refreshed_at = VALUES(refreshed_at)
      `,
      [cacheKey, JSON.stringify(emptySummary)],
    );
    return { ...emptySummary, fromCache: false };
  }

  const countsByHn = await loadHosCompleteVisitProgressByHns(
    registry.map((item) => item.hn),
  );

  let importedInProgress = 0;
  let importedCompleted = 0;
  for (const row of registry) {
    const progress = countsByHn.get(row.hn);
    if (!progress) continue;
    const careStatus =
      progress.completeCount >= REQUIRED_COMPLETE_VISITS ? "completed" : progress.completeCount > 0 ? "active" : "registered";
    await palliativePool.query(
      `
        UPDATE palliative_registry
        SET
          service_month_count = GREATEST(service_month_count, ?),
          last_visit_at = COALESCE(?, last_visit_at),
          care_status = CASE
            WHEN ? = 'completed' THEN 'completed'
            WHEN ? = 'active' AND care_status <> 'completed' THEN 'active'
            ELSE care_status
          END,
          discharged_at = CASE
            WHEN ? = 'completed' THEN COALESCE(discharged_at, ?)
            ELSE discharged_at
          END
        WHERE id = ?
      `,
      [
        progress.completeCount,
        progress.lastCompleteAt ?? null,
        careStatus,
        careStatus,
        careStatus,
        progress.lastCompleteAt ?? toDateKey(),
        row.id,
      ],
    );
    const previousCount = Number(row.serviceMonthCount ?? 0);
    if (
      careStatus === "completed" &&
      (row.careStatus !== "completed" || progress.completeCount > previousCount)
    ) {
      importedCompleted += 1;
    }
    if (careStatus === "active" && progress.completeCount > previousCount) {
      importedInProgress += 1;
    }
  }

  if (options?.userId) {
    const unregisteredCandidates = await getHosCandidates(
      undefined,
      clinicShortName,
      "",
      "all",
      "all",
      false,
    );
    if (unregisteredCandidates.length) {
      const candidateProgress = await loadHosCompleteVisitProgressByHns(
        unregisteredCandidates.map((candidate) => candidate.hn),
      );
      for (const candidate of unregisteredCandidates) {
        const progress = candidateProgress.get(candidate.hn);
        if (!progress || progress.completeCount < 1) continue;
        const importedStatus: PalliativePatient["careStatus"] =
          progress.completeCount >= REQUIRED_COMPLETE_VISITS
            ? "completed"
            : "active";
        await registerHosCandidate(
          {
            ...candidate,
            serviceCount: progress.completeCount,
            lastServiceAt: progress.lastCompleteAt ?? candidate.lastServiceAt,
            claimChecklist: buildClaimChecklist({
              ...candidate.claimChecklist,
              diagZ515: true,
              diagZ718: true,
              eva001: true,
              cons01: true,
            }),
          },
          {
            assignedUnitId: candidate.unitId,
            note:
              importedStatus === "completed"
                ? "ซิงก์เคสเยี่ยมครบเกณฑ์จาก HOSXP"
                : "ซิงก์เคสกำลังเยี่ยมจาก HOSXP",
            userId: options.userId,
            careStatus: importedStatus,
          },
        );
        if (importedStatus === "completed") {
          importedCompleted += 1;
        } else {
          importedInProgress += 1;
        }
      }
    }
  }

  const refreshedSummary = await buildSummaryFromRegistry();
  const summary: HosProgressSummary = {
    ...refreshedSummary,
    importedInProgress,
    importedCompleted,
    refreshedAt: new Date().toISOString(),
    fromCache: false,
  };
  await palliativePool.query(
    `
      INSERT INTO palliative_hos_sync_cache (cache_key, payload_json, refreshed_at)
      VALUES (?, ?, NOW())
      ON DUPLICATE KEY UPDATE payload_json = VALUES(payload_json), refreshed_at = VALUES(refreshed_at)
    `,
    [cacheKey, JSON.stringify(summary)],
  );
  return summary;
}

export async function searchHosPatients(
  keyword: string,
  limit = 20,
): Promise<HosPatientSearchItem[]> {
  const queryText = keyword.trim();
  const normalizedLimit = Math.min(100, Math.max(1, Math.trunc(limit)));
  if (!queryText) return [];

  if (!isDbConfigured("hos")) {
    const snapshot = getSnapshot();
    const needle = queryText.toLowerCase();
    return snapshot.patients
      .filter((patient) => {
        const haystack =
          `${patient.hn} ${patient.cid} ${patient.fullName} ${patient.primaryDxCode}`.toLowerCase();
        return haystack.includes(needle);
      })
      .slice(0, normalizedLimit)
      .map((patient) => ({
        hn: patient.hn,
        cid: patient.cid,
        fullName: patient.fullName,
        sex: patient.sex,
        age: patient.age,
        phone: patient.phone,
        lastVisitAt: patient.lastVisitAt,
        primaryDxCode: patient.primaryDxCode,
      }));
  }

  const pool = getPool("hos");
  const like = `%${queryText}%`;
  const icdLike = `%${normalizeCode(queryText)}%`;
  const hnExact = queryText.replaceAll("-", "").trim();
  const isHnLike = /^\d{1,9}$/.test(hnExact);
  const hasIcdLikeKeyword = /^[a-zA-Z]\d{1,4}(\.\d{1,4})?$/.test(queryText);

  if (isHnLike) {
    const [hnRows] = await pool.query(
      `
        SELECT
          p.hn,
          COALESCE(p.cid, '') AS cid,
          CONCAT(IFNULL(p.pname, ''), IFNULL(p.fname, ''), ' ', IFNULL(p.lname, '')) AS fullName,
          p.sex,
          TIMESTAMPDIFF(YEAR, p.birthday, CURDATE()) AS age,
          IF(p.mobile_phone_number IS NOT NULL, p.mobile_phone_number, IF(p.hometel IS NOT NULL, p.hometel, p.informtel)) AS phone,
          (
            SELECT MAX(o2.vstdate)
            FROM ovst o2
            WHERE o2.hn = p.hn
          ) AS lastVisitAt
        FROM patient p
        WHERE p.hn = ?
        LIMIT 1
      `,
      [hnExact.padStart(9, "0")],
    );
    const exactRows = hnRows as Array<Record<string, unknown>>;
    if (exactRows.length) {
      return exactRows.map((row) => ({
        hn: String(row.hn ?? ""),
        cid: String(row.cid ?? ""),
        fullName: String(row.fullName ?? ""),
        sex: row.sex === "M" ? "M" : "F",
        age: Number.parseInt(String(row.age ?? "0"), 10) || 0,
        phone: String(row.phone ?? "").trim() || undefined,
        lastVisitAt: asDateKey(row.lastVisitAt) || undefined,
        primaryDxCode: undefined,
      }));
    }
  }

  const searchSql = hasIcdLikeKeyword
    ? `
      SELECT
        p.hn,
        COALESCE(p.cid, '') AS cid,
        CONCAT(IFNULL(p.pname, ''), IFNULL(p.fname, ''), ' ', IFNULL(p.lname, '')) AS fullName,
        p.sex,
        TIMESTAMPDIFF(YEAR, p.birthday, CURDATE()) AS age,
        IF(p.mobile_phone_number IS NOT NULL, p.mobile_phone_number, IF(p.hometel IS NOT NULL, p.hometel, p.informtel)) AS phone,
        MAX(o.vstdate) AS lastVisitAt
      FROM patient p
      LEFT JOIN ovst o ON o.hn = p.hn
      WHERE
        p.hn LIKE ?
        OR COALESCE(p.cid, '') LIKE ?
        OR CONCAT(IFNULL(p.pname, ''), IFNULL(p.fname, ''), ' ', IFNULL(p.lname, '')) LIKE ?
        OR EXISTS (
          SELECT 1
          FROM ovst o3
          INNER JOIN ovstdiag d3 ON d3.vn = o3.vn
          WHERE o3.hn = p.hn
            AND UPPER(REPLACE(d3.icd10, '.', '')) LIKE ?
        )
      GROUP BY p.hn, p.cid, fullName, p.sex, age, phone
      ORDER BY MAX(o.vstdate) DESC, p.hn ASC
      LIMIT ?
    `
    : `
      SELECT
        p.hn,
        COALESCE(p.cid, '') AS cid,
        CONCAT(IFNULL(p.pname, ''), IFNULL(p.fname, ''), ' ', IFNULL(p.lname, '')) AS fullName,
        p.sex,
        TIMESTAMPDIFF(YEAR, p.birthday, CURDATE()) AS age,
        IF(p.mobile_phone_number IS NOT NULL, p.mobile_phone_number, IF(p.hometel IS NOT NULL, p.hometel, p.informtel)) AS phone,
        MAX(o.vstdate) AS lastVisitAt
      FROM patient p
      LEFT JOIN ovst o ON o.hn = p.hn
      WHERE
        p.hn LIKE ?
        OR COALESCE(p.cid, '') LIKE ?
        OR CONCAT(IFNULL(p.pname, ''), IFNULL(p.fname, ''), ' ', IFNULL(p.lname, '')) LIKE ?
      GROUP BY p.hn, p.cid, fullName, p.sex, age, phone
      ORDER BY MAX(o.vstdate) DESC, p.hn ASC
      LIMIT ?
    `;
  const searchParams = hasIcdLikeKeyword
    ? [like, like, like, icdLike, normalizedLimit]
    : [like, like, like, normalizedLimit];
  const [rows] = await pool.query(searchSql, searchParams);

  return (rows as Array<Record<string, unknown>>).map((row) => ({
    hn: String(row.hn ?? ""),
    cid: String(row.cid ?? ""),
    fullName: String(row.fullName ?? ""),
    sex: row.sex === "M" ? "M" : "F",
    age: Number.parseInt(String(row.age ?? "0"), 10) || 0,
    phone: String(row.phone ?? "").trim() || undefined,
    lastVisitAt: asDateKey(row.lastVisitAt) || undefined,
    primaryDxCode: undefined,
  }));
}

export async function getHosPatientDetail(
  hn: string,
  options?: { diagLimit?: number; labLimit?: number; serviceLimit?: number },
): Promise<HosPatientDetail | null> {
  const normalizedHn = hn.trim();
  if (!normalizedHn) return null;
  const diagLimit = Math.min(
    300,
    Math.max(20, Math.trunc(options?.diagLimit ?? 80)),
  );
  const labLimit = Math.min(
    400,
    Math.max(20, Math.trunc(options?.labLimit ?? 60)),
  );
  const serviceLimit = Math.min(
    300,
    Math.max(20, Math.trunc(options?.serviceLimit ?? 50)),
  );

  if (!isDbConfigured("hos")) {
    const snapshot = getSnapshot();
    const patient = snapshot.patients.find((item) => item.hn === normalizedHn);
    if (!patient) return null;
    return {
      profile: {
        hn: patient.hn,
        cid: patient.cid,
        fullName: patient.fullName,
        sex: patient.sex,
        age: patient.age,
        phone: patient.phone,
        address: patient.address,
        lastVisitAt: patient.lastVisitAt,
        primaryDxCode: patient.primaryDxCode,
      },
      diagHistory: [],
      labHistory: [],
      serviceHistory: snapshot.visits
        .filter((visit) => visit.patientId === patient.id)
        .slice(0, serviceLimit)
        .map<HosPatientServiceItem>((visit) => ({
          visitDate: visit.visitDate,
          vn: String(visit.id),
          pdx: patient.primaryDxCode,
          pdxName: patient.primaryDxName,
        })),
    };
  }

  const pool = getPool("hos");
  const [profileRows] = await pool.query(
    `
      SELECT
        p.hn,
        COALESCE(p.cid, '') AS cid,
        CONCAT(IFNULL(p.pname, ''), IFNULL(p.fname, ''), ' ', IFNULL(p.lname, '')) AS fullName,
        p.sex,
        p.birthday,
        TIMESTAMPDIFF(YEAR, p.birthday, CURDATE()) AS age,
        IF(p.mobile_phone_number IS NOT NULL, p.mobile_phone_number, IF(p.hometel IS NOT NULL, p.hometel, p.informtel)) AS phone,
        CONCAT(IFNULL(p.addrpart, ''), ' ม.', IFNULL(p.moopart, ''), ' ต.', IFNULL(ta.name, '')) AS address,
        (
          SELECT MAX(o.vstdate)
          FROM ovst o
          WHERE o.hn = p.hn
        ) AS lastVisitAt,
        (
          SELECT SUBSTRING_INDEX(
            GROUP_CONCAT(
              DISTINCT UPPER(REPLACE(d.icd10, '.', ''))
              ORDER BY o2.vstdate DESC, o2.vn DESC, d.diagtype
              SEPARATOR ','
            ),
            ',',
            1
          )
          FROM ovst o2
          INNER JOIN ovstdiag d ON d.vn = o2.vn
          WHERE o2.hn = p.hn
        ) AS primaryDxCode
      FROM patient p
      LEFT JOIN thaiaddress ta
        ON ta.chwpart = p.chwpart
       AND ta.amppart = p.amppart
       AND ta.tmbpart = p.tmbpart
      WHERE p.hn = ?
      LIMIT 1
    `,
    [normalizedHn],
  );
  const profileRow = (profileRows as Array<Record<string, unknown>>)[0];
  if (!profileRow) return null;

  const [diagRows, labRows, serviceRows] = await Promise.all([
    pool.query(
      `
        SELECT
          o.vstdate AS visitDate,
          o.vn,
          d.diagtype AS diagType,
          UPPER(REPLACE(d.icd10, '.', '')) AS icd10,
          COALESCE(i.name, '') AS diagName
        FROM ovst o
        INNER JOIN ovstdiag d ON d.vn = o.vn
        LEFT JOIN icd101 i
          ON i.code = d.icd10
          OR i.code = UPPER(REPLACE(d.icd10, '.', ''))
        WHERE o.hn = ?
        ORDER BY o.vstdate DESC, o.vn DESC, d.diagtype
        LIMIT ?
      `,
      [normalizedHn, diagLimit],
    ),
    (async () => {
      try {
        return await pool.query(
          `
            SELECT
              COALESCE(lh.report_date, lh.order_date) AS labDate,
              lh.vn,
              lo.lab_items_code AS itemCode,
              COALESCE(li.lab_items_name, lo.lab_items_code) AS itemName,
              CAST(lo.lab_order_result AS CHAR) AS result,
              COALESCE(lo.lab_order_unit, li.lab_items_unit, '') AS unit,
              COALESCE(lo.lab_order_normal_value, '') AS normalValue
            FROM lab_head lh
            INNER JOIN lab_order lo ON lo.lab_order_number = lh.lab_order_number
            LEFT JOIN lab_items li ON li.lab_items_code = lo.lab_items_code
            WHERE lh.hn = ?
            ORDER BY COALESCE(lh.report_date, lh.order_date) DESC, lh.vn DESC
            LIMIT ?
          `,
          [normalizedHn, labLimit],
        );
      } catch {
        return [[]];
      }
    })(),
    (async () => {
      try {
        return await pool.query(
          `
            SELECT
              o.vstdate AS visitDate,
              o.vn,
              COALESCE(vs.pttype, '') AS pttype,
              COALESCE(vs.main_dep, '') AS mainDep,
              COALESCE(vs.pdx, '') AS pdx,
              COALESCE(i.name, '') AS pdxName
            FROM ovst o
            LEFT JOIN vn_stat vs ON vs.vn = o.vn
            LEFT JOIN icd101 i
              ON i.code = vs.pdx
              OR i.code = UPPER(REPLACE(vs.pdx, '.', ''))
            WHERE o.hn = ?
            ORDER BY o.vstdate DESC, o.vn DESC
            LIMIT ?
          `,
          [normalizedHn, serviceLimit],
        );
      } catch {
        return await pool.query(
          `
            SELECT
              o.vstdate AS visitDate,
              o.vn,
              COALESCE(pt.hipdata_code, vs.pttype, '') AS pttype,
              COALESCE(o.main_dep, '') AS mainDep,
              COALESCE(vs.pdx, '') AS pdx,
              COALESCE(i.name, '') AS pdxName
            FROM ovst o
            LEFT JOIN vn_stat vs ON vs.vn = o.vn
            LEFT JOIN pttype pt ON pt.pttype = vs.pttype
            LEFT JOIN icd101 i
              ON i.code = vs.pdx
              OR i.code = UPPER(REPLACE(vs.pdx, '.', ''))
            WHERE o.hn = ?
            ORDER BY o.vstdate DESC, o.vn DESC
            LIMIT ?
          `,
          [normalizedHn, serviceLimit],
        );
      }
    })(),
  ]);

  return {
    profile: {
      hn: String(profileRow.hn ?? ""),
      cid: String(profileRow.cid ?? ""),
      fullName: String(profileRow.fullName ?? ""),
      sex: profileRow.sex === "M" ? "M" : "F",
      age: Number.parseInt(String(profileRow.age ?? "0"), 10) || 0,
      birthday: asDateKey(profileRow.birthday) || undefined,
      phone: String(profileRow.phone ?? "").trim() || undefined,
      address: String(profileRow.address ?? "").trim() || undefined,
      lastVisitAt: asDateKey(profileRow.lastVisitAt) || undefined,
      primaryDxCode: String(profileRow.primaryDxCode ?? "").trim() || undefined,
    },
    diagHistory: (diagRows[0] as Array<Record<string, unknown>>).map<HosPatientDiagItem>(
      (row) => ({
        visitDate: asDateKey(row.visitDate),
        vn: String(row.vn ?? ""),
        diagType: String(row.diagType ?? "").trim() || undefined,
        icd10: String(row.icd10 ?? "").trim(),
        diagName: String(row.diagName ?? "").trim() || undefined,
      }),
    ),
    labHistory: (labRows[0] as Array<Record<string, unknown>>).map<HosPatientLabItem>((row) => ({
      labDate: asDateKey(row.labDate),
      vn: String(row.vn ?? "").trim() || undefined,
      itemCode: String(row.itemCode ?? "").trim(),
      itemName: String(row.itemName ?? row.itemCode ?? "").trim(),
      result: String(row.result ?? "").trim() || undefined,
      unit: String(row.unit ?? "").trim() || undefined,
      normalValue: String(row.normalValue ?? "").trim() || undefined,
    })),
    serviceHistory: (serviceRows[0] as Array<Record<string, unknown>>).map<HosPatientServiceItem>(
      (row) => ({
        visitDate: asDateKey(row.visitDate),
        vn: String(row.vn ?? ""),
        pttype: String(row.pttype ?? "").trim() || undefined,
        mainDep: String(row.mainDep ?? "").trim() || undefined,
        pdx: String(row.pdx ?? "").trim() || undefined,
        pdxName: String(row.pdxName ?? "").trim() || undefined,
      }),
    ),
  };
}

export async function findHosCandidateByHn(
  hn: string,
  clinicShortName = "all",
): Promise<HosCandidate | null> {
  const rows = await getHosCandidates(undefined, clinicShortName, hn, "all");
  return rows.find((item) => item.hn === hn.trim()) ?? null;
}

export async function findHosCandidateByHnAnyArea(
  hn: string,
): Promise<HosCandidate | null> {
  return findHosCandidateByHn(hn, "all");
}

export async function registerHosCandidate(
  candidate: HosCandidate,
  input: {
    nextVisitAt?: string;
    assignedUnitId: string;
    note?: string;
    userId: string;
    careStatus?: PalliativePatient["careStatus"];
  },
) {
  if (isLctExcludedPatientName(candidate.fullName)) {
    throw new Error("ผู้ป่วยรายนี้อยู่ในระบบ LCT แล้ว");
  }
  if (isDbConfigured("hos") && !hasAllowedInsuranceGroup(candidate.insuranceGroup)) {
    throw new Error("ต้องเป็นสิทธิ์ UCS หรือ WEL เท่านั้น");
  }
  if (!isDbConfigured("palliative")) {
    return registerPatientFromCandidate(candidate, {
      ...input,
      nextVisitAt: input.nextVisitAt ?? candidate.lastServiceAt ?? toDateKey(),
    });
  }

  const unit = serviceUnits.find((item) => item.id === input.assignedUnitId);
  if (!unit) throw new Error("Unit not found");
  const pool = getPool("palliative");
  const careStatus = input.careStatus ?? "registered";
  const nextVisitAt =
    careStatus === "completed"
      ? null
      : input.nextVisitAt ?? candidate.lastServiceAt ?? toDateKey();
  const visitWindow = buildVisitWindow(
    nextVisitAt ?? candidate.lastServiceAt ?? toDateKey(),
  );
  const dischargedAt =
    careStatus === "completed"
      ? candidate.lastServiceAt ?? toDateKey()
      : null;
  const checklistJson = JSON.stringify(
    buildClaimChecklist(candidate.claimChecklist),
  );
  await ensureRegistryDemographicsSchema();
  await pool.query(
    `
      INSERT INTO palliative_registry (
        hn, cid, full_name, age, birthday, sex, insurance_group, assigned_unit_id, assigned_unit_name, assigned_unit_kind,
        primary_dx_code, primary_dx_name, care_status, eligible_reason, phone, address, notes,
        registered_at, registered_by_user_id, next_visit_at, service_month_count,
        visit_window_start, visit_window_end, claim_checklist_json, discharged_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        full_name = VALUES(full_name),
        age = VALUES(age),
        birthday = VALUES(birthday),
        sex = VALUES(sex),
        insurance_group = VALUES(insurance_group),
        assigned_unit_id = VALUES(assigned_unit_id),
        assigned_unit_name = VALUES(assigned_unit_name),
        assigned_unit_kind = VALUES(assigned_unit_kind),
        primary_dx_code = VALUES(primary_dx_code),
        primary_dx_name = VALUES(primary_dx_name),
        eligible_reason = VALUES(eligible_reason),
        phone = VALUES(phone),
        address = VALUES(address),
        notes = VALUES(notes),
        care_status = VALUES(care_status),
        next_visit_at = VALUES(next_visit_at),
        service_month_count = GREATEST(service_month_count, VALUES(service_month_count)),
        visit_window_start = VALUES(visit_window_start),
        visit_window_end = VALUES(visit_window_end),
        claim_checklist_json = VALUES(claim_checklist_json),
        discharged_at = VALUES(discharged_at)
    `,
    [
      candidate.hn,
      candidate.cid,
      candidate.fullName,
      candidate.age,
      candidate.birthday ?? null,
      candidate.sex,
      candidate.insuranceGroup ?? null,
      unit.id,
      unit.name,
      unit.kind,
      candidate.primaryDxCode,
      candidate.primaryDxName,
      careStatus,
      candidate.eligibleReason,
      candidate.phone ?? null,
      candidate.address ?? null,
      input.note ?? "ลงทะเบียนจาก HOSXP",
      toDateKey(),
      input.userId,
      nextVisitAt,
      candidate.serviceCount,
      visitWindow.startDate,
      visitWindow.endDate,
      checklistJson,
      dischargedAt,
    ],
  );
  return { ok: true };
}

export async function syncHosCandidatesToRegistry(input: {
  visitDate?: string;
  clinic?: string;
  candidateMode?: CandidateFilterMode;
  dxGroup?: CandidateDxGroup;
  userId: string;
  note?: string;
}) {
  const clinic = input.clinic ?? "all";
  const visitDate = input.visitDate?.trim() || toDateKey();
  const candidateMode = input.candidateMode ?? "all";
  const dxGroup = input.dxGroup ?? "all";
  const candidates = await getHosCandidates(
    input.visitDate,
    clinic,
    "",
    candidateMode,
    dxGroup,
  );
  let imported = 0;

  for (const candidate of candidates) {
    const nextVisitAt = visitDate;
    await registerHosCandidate(candidate, {
      nextVisitAt,
      assignedUnitId: candidate.unitId,
      note: input.note ?? `ซิงก์จาก HOSXP วันที่ ${visitDate}`,
      userId: input.userId,
    });
    imported += 1;
  }

  return { imported, visitDate, clinic, candidateMode, dxGroup };
}

export async function savePatientPatch(
  patientId: number,
  patch: Partial<
    Pick<
      PalliativePatient,
      "nextVisitAt" | "phone" | "relativePhone" | "lineId" | "notes"
    >
  > & { assignedUnitId?: string },
) {
  if (!isDbConfigured("palliative")) {
    return updatePatientRecord(patientId, patch);
  }

  const pool = getPool("palliative");
  let assignedUnitName: string | null = null;
  let assignedUnitKind: string | null = null;
  if (patch.assignedUnitId) {
    const unit = serviceUnits.find((item) => item.id === patch.assignedUnitId);
    if (!unit) throw new Error("Unit not found");
    assignedUnitName = unit.name;
    assignedUnitKind = unit.kind;
  }

  let window: { startDate: string; endDate: string } | null = null;
  if (patch.nextVisitAt) {
    const [currentRows] = await pool.query(
      `SELECT next_visit_at AS nextVisitAt, visit_window_start AS startDate, visit_window_end AS endDate FROM palliative_registry WHERE id = ? LIMIT 1`,
      [patientId],
    );
    const current = (
      currentRows as Array<{
        nextVisitAt?: string | null;
        startDate?: string;
        endDate?: string;
      }>
    )[0];
    window =
      current?.nextVisitAt && current.startDate && current.endDate
        ? { startDate: current.startDate, endDate: current.endDate }
        : buildVisitWindow(patch.nextVisitAt);
    if (
      patch.nextVisitAt < window.startDate ||
      patch.nextVisitAt > window.endDate
    ) {
      throw new Error(
        `วันเยี่ยมต้องอยู่ระหว่าง ${window.startDate} ถึง ${window.endDate}`,
      );
    }
  }
  await pool.query(
    `
      UPDATE palliative_registry
      SET
        next_visit_at = COALESCE(?, next_visit_at),
        visit_window_start = COALESCE(?, visit_window_start),
        visit_window_end = COALESCE(?, visit_window_end),
        phone = COALESCE(?, phone),
        relative_phone = COALESCE(?, relative_phone),
        line_id = COALESCE(?, line_id),
        notes = COALESCE(?, notes),
        assigned_unit_id = COALESCE(?, assigned_unit_id),
        assigned_unit_name = COALESCE(?, assigned_unit_name),
        assigned_unit_kind = COALESCE(?, assigned_unit_kind)
      WHERE id = ?
    `,
    [
      patch.nextVisitAt ?? null,
      window?.startDate ?? null,
      window?.endDate ?? null,
      patch.phone ?? null,
      patch.relativePhone ?? null,
      patch.lineId ?? null,
      patch.notes ?? null,
      patch.assignedUnitId ?? null,
      assignedUnitName,
      assignedUnitKind,
      patientId,
    ],
  );

  return { ok: true };
}

export async function saveVisit(
  patientId: number,
  input: {
    visitDate: string;
    authenCode?: string;
    symptoms: string;
    note: string;
    visitorUserId: string;
    visitorName: string;
    unitId: string;
    checklist: VisitChecklist;
    clinical?: VisitClinicalAssessment;
    photos: Array<{ url: string; fileName: string; caption?: string }>;
  },
) {
  if (!isDbConfigured("palliative")) {
    return addVisitRecord(patientId, input);
  }

  validateVisitSubmission({
    visitDate: input.visitDate,
    authenCode: input.authenCode,
    symptoms: input.symptoms,
    photosCount: input.photos.length,
  });

  const pool = getPool("palliative");
  await ensureVisitClinicalSchema();
  const [rows] = await pool.query(
    `
      SELECT
        service_month_count AS serviceMonthCount,
        next_visit_at AS nextVisitAt,
        visit_window_start AS visitWindowStart,
        visit_window_end AS visitWindowEnd,
        claim_checklist_json AS claimChecklistJson
      FROM palliative_registry
      WHERE id = ?
      LIMIT 1
    `,
    [patientId],
  );
  const patient = (
    rows as Array<{
      serviceMonthCount: number;
      nextVisitAt?: string | null;
      visitWindowStart?: string | null;
      visitWindowEnd?: string | null;
      claimChecklistJson?: string | null;
    }>
  )[0];
  if (!patient) throw new Error("Patient not found");
  if (
    patient.visitWindowStart &&
    patient.visitWindowEnd &&
    !isDateWithinWindow(input.visitDate, {
      startDate: patient.visitWindowStart,
      endDate: patient.visitWindowEnd,
    })
  ) {
    throw new Error(
      `วันเยี่ยมต้องอยู่ระหว่าง ${patient.visitWindowStart} ถึง ${patient.visitWindowEnd}`,
    );
  }

  const normalizedChecklist = normalizeVisitChecklist(input.checklist, {
    hasPhoto: input.photos.length > 0,
    hasSymptoms: Boolean(input.symptoms.trim()),
  });
  const authenCode = input.authenCode?.trim();
  const symptoms = input.symptoms.trim();
  const note = input.note.trim();

  const checklistState = buildClaimChecklist({
    ...parseJson(patient.claimChecklistJson, buildClaimChecklist({})),
    hasAuthentication: Boolean(authenCode),
    hasHomeVisitReport: true,
    hasPhoto: input.photos.length > 0,
  });

  await pool.query(
    `
      INSERT INTO palliative_visits (
        patient_id, unit_id, visit_date, scheduled_date, rescheduled_from, status,
        visitor_user_id, visitor_name, authen_code, symptoms, note, checklist_json, clinical_json, photos_json
      )
      VALUES (?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      patientId,
      input.unitId,
      input.visitDate,
      patient.nextVisitAt ?? input.visitDate,
      patient.nextVisitAt && patient.nextVisitAt !== input.visitDate
        ? patient.nextVisitAt
        : null,
      input.visitorUserId,
      input.visitorName,
      authenCode ?? null,
      symptoms,
      note,
      JSON.stringify(normalizedChecklist),
      JSON.stringify(input.clinical ?? null),
      JSON.stringify(input.photos),
    ],
  );

  const nextServiceMonth = Number(patient.serviceMonthCount ?? 0) + 1;
  await pool.query(
    `
      UPDATE palliative_registry
      SET
        last_visit_at = ?,
        next_visit_at = NULL,
        service_month_count = ?,
        care_status = ?,
        claim_checklist_json = ?
      WHERE id = ?
    `,
    [
      input.visitDate,
      nextServiceMonth,
      nextServiceMonth >= 6 ? "completed" : "active",
      JSON.stringify(checklistState),
      patientId,
    ],
  );

  return { ok: true };
}

export async function updateVisit(
  visitId: number,
  input: {
    actorUserId: string;
    visitDate: string;
    authenCode?: string;
    symptoms: string;
    note: string;
    checklist: VisitChecklist;
    clinical?: VisitClinicalAssessment;
  },
) {
  if (!isDbConfigured("palliative")) {
    return updateVisitRecord(visitId, input);
  }

  const snapshot = await getAppSnapshot();
  const actor = snapshot.users.find((user) => user.id === input.actorUserId);
  const currentVisit = snapshot.visits.find((visit) => visit.id === visitId);
  if (!actor || !currentVisit) throw new Error("ไม่พบข้อมูลการเยี่ยมหรือผู้ใช้งาน");
  const canEditAll =
    actor.role === "hospital_admin" || actor.role === "hospital_case_manager";
  if (!canEditAll && actor.unitId !== currentVisit.unitId) {
    throw new Error("แก้ไขได้เฉพาะข้อมูลของหน่วยตัวเอง");
  }

  validateVisitSubmission({
    visitDate: input.visitDate,
    authenCode: input.authenCode,
    symptoms: input.symptoms,
    photosCount: currentVisit.photos.length,
  });

  const normalizedChecklist = normalizeVisitChecklist(input.checklist, {
    hasPhoto: currentVisit.photos.length > 0,
    hasSymptoms: Boolean(input.symptoms.trim()),
  });
  const pool = getPool("palliative");
  await ensureVisitClinicalSchema();
  await pool.query(
    `
      UPDATE palliative_visits
      SET visit_date = ?,
          authen_code = ?,
          symptoms = ?,
          note = ?,
          checklist_json = ?,
          clinical_json = ?
      WHERE id = ?
    `,
    [
      input.visitDate,
      input.authenCode?.trim() || null,
      input.symptoms.trim(),
      input.note.trim(),
      JSON.stringify(normalizedChecklist),
      JSON.stringify(input.clinical ?? null),
      visitId,
    ],
  );

  const [visitRows] = await pool.query(
    `
      SELECT visit_date AS visitDate, authen_code AS authenCode, photos_json AS photosJson
      FROM palliative_visits
      WHERE patient_id = ?
      ORDER BY visit_date ASC, id ASC
    `,
    [currentVisit.patientId],
  );
  const patientVisits = visitRows as Array<{
    visitDate: string;
    authenCode?: string | null;
    photosJson?: string | null;
  }>;
  const serviceMonthCount = patientVisits.length;
  const lastVisitAt = patientVisits[patientVisits.length - 1]?.visitDate ?? null;
  const hasAuthentication = patientVisits.some((visit) => Boolean(visit.authenCode));
  const hasPhoto = patientVisits.some(
    (visit) => parseJson<Array<unknown>>(visit.photosJson, []).length > 0,
  );
  const patient = snapshot.patients.find((item) => item.id === currentVisit.patientId);
  const checklistState = buildClaimChecklist({
    ...(patient?.claimChecklist ?? buildClaimChecklist({})),
    hasAuthentication,
    hasHomeVisitReport: serviceMonthCount > 0,
    hasPhoto,
  });

  await pool.query(
    `
      UPDATE palliative_registry
      SET last_visit_at = ?,
          service_month_count = ?,
          care_status = ?,
          claim_checklist_json = ?
      WHERE id = ?
    `,
    [
      lastVisitAt,
      serviceMonthCount,
      serviceMonthCount >= 6 ? "completed" : serviceMonthCount > 0 ? "active" : "registered",
      JSON.stringify(checklistState),
      currentVisit.patientId,
    ],
  );

  return { ok: true };
}

export async function saveVisitAdvanceCarePlan(
  visitId: number,
  input: {
    actorUserId: string;
    form: AdvanceCarePlanForm;
    fileName: string;
    url: string;
  },
) {
  if (!isDbConfigured("palliative")) {
    return updateVisitAdvanceCarePlanRecord(visitId, input);
  }

  const snapshot = await getAppSnapshot();
  const actor = snapshot.users.find((user) => user.id === input.actorUserId);
  const currentVisit = snapshot.visits.find((visit) => visit.id === visitId);
  if (!actor || !currentVisit) throw new Error("ไม่พบข้อมูลการเยี่ยมหรือผู้ใช้งาน");
  const canEditAll =
    actor.role === "hospital_admin" || actor.role === "hospital_case_manager";
  if (!canEditAll && actor.unitId !== currentVisit.unitId) {
    throw new Error("บันทึก ACP/LW ได้เฉพาะข้อมูลของหน่วยตัวเอง");
  }

  const document: AdvanceCarePlanDocument = {
    id: `acp-${visitId}-${Date.now()}`,
    fileName: input.fileName,
    url: input.url,
    createdAt: new Date().toISOString(),
    createdByUserId: actor.id,
    createdByName: actor.displayName,
    form: input.form,
  };

  const pool = getPool("palliative");
  await ensureVisitClinicalSchema();
  await pool.query(`UPDATE palliative_visits SET acp_json = ? WHERE id = ?`, [
    JSON.stringify(document),
    visitId,
  ]);
  return { ok: true, document };
}

export async function saveComment(
  patientId: number,
  input: { userId: string; body: string; audience: PatientComment["audience"] },
) {
  if (!isDbConfigured("palliative")) {
    return addCommentRecord(patientId, input);
  }

  const snapshot = await getAppSnapshot();
  const user = snapshot.users.find((item) => item.id === input.userId);
  if (!user) throw new Error("User not found");
  const pool = getPool("palliative");
  await pool.query(
    `INSERT INTO palliative_comments (id, patient_id, unit_id, author_user_id, author_name, audience, body) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      `comment-${Date.now()}`,
      patientId,
      user.unitId,
      user.id,
      user.displayName,
      input.audience,
      input.body.trim(),
    ],
  );

  return { ok: true };
}

export async function saveStmImport(input: {
  fileName: string;
  importedByUserId: string;
  defaultSplitPercent: number;
  rows: Array<{
    hn: string;
    patientName: string;
    amount: number;
    unitId: string;
    claimMonth: string;
    note?: string;
  }>;
}) {
  if (!isDbConfigured("palliative")) {
    return importStmBatch(input);
  }

  const snapshot = await getAppSnapshot();
  const user = snapshot.users.find(
    (item) => item.id === input.importedByUserId,
  );
  if (!user) throw new Error("User not found");
  const pool = getPool("palliative");
  const batchId = `stm-${Date.now()}`;

  await pool.query(
    `INSERT INTO palliative_stm_batches (id, file_name, imported_by_user_id, imported_by_name, default_split_percent) VALUES (?, ?, ?, ?, ?)`,
    [
      batchId,
      input.fileName,
      user.id,
      user.displayName,
      input.defaultSplitPercent,
    ],
  );

  for (let index = 0; index < input.rows.length; index += 1) {
    const row = input.rows[index];
    await pool.query(
      `INSERT INTO palliative_stm_rows (id, batch_id, hn, patient_name, amount, unit_id, claim_month, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        `${batchId}-${index + 1}`,
        batchId,
        row.hn,
        row.patientName,
        row.amount,
        row.unitId,
        row.claimMonth,
        row.note ?? null,
      ],
    );
  }

  return { ok: true };
}

export async function renameAppUser(userId: string, displayName: string) {
  if (!isDbConfigured("palliative")) {
    return renameUser(userId, displayName);
  }

  const pool = getPool("palliative");
  await pool.query(
    `UPDATE palliative_users SET display_name = ? WHERE id = ?`,
    [displayName.trim(), userId],
  );
  return { ok: true };
}

function roleCanApprove(role?: UserRole) {
  return role === "hospital_admin" || role === "hospital_case_manager";
}

function roleIsAdmin(role?: UserRole) {
  return role === "hospital_admin";
}

function roleCanManageUsers(role?: UserRole) {
  return role === "hospital_admin" || role === "hospital_case_manager";
}

function hashToken(token: string) {
  return Buffer.from(token).toString("base64url").slice(0, 120);
}

export async function loginAppUser(input: {
  username: string;
  password: string;
}): Promise<{ token: string; user: AuthSessionUser }> {
  if (!isDbConfigured("palliative")) {
    const user = authenticateUser(input.username, input.password);
    if (!user) throw new Error("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง หรือยังไม่ผ่านอนุมัติ");
    return { token: issueAuthToken(user.id), user };
  }

  await ensureAuthSchema();
  const pool = getPool("palliative");
  const [rows] = await pool.query(
    `
      SELECT
        id,
        username,
        display_name AS displayName,
        role,
        unit_id AS unitId,
        active,
        approval_status AS approvalStatus,
        password_hash AS passwordHash
      FROM palliative_users
      WHERE LOWER(username) = LOWER(?)
      LIMIT 1
    `,
    [input.username.trim()],
  );
  const row = (rows as DbUserRow[])[0];
  if (!row || !row.passwordHash || !verifyPassword(input.password, row.passwordHash)) {
    throw new Error("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
  }
  if (!Boolean(row.active) || row.approvalStatus !== "approved") {
    throw new Error("บัญชียังไม่ผ่านการอนุมัติใช้งาน");
  }
  const token = issueAuthToken(row.id);
  await pool.query(
    `
      INSERT INTO palliative_auth_sessions (token_hash, user_id, expires_at)
      VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 12 HOUR))
      ON DUPLICATE KEY UPDATE expires_at = VALUES(expires_at), user_id = VALUES(user_id)
    `,
    [hashToken(token), row.id],
  );
  return {
    token,
    user: {
      id: row.id,
      username: row.username,
      displayName: normalizedUserDisplayName(
        row.username,
        row.role,
        row.unitId,
        row.displayName,
      ),
      role: row.role,
      unitId: row.unitId,
    },
  };
}

export async function getSessionUserFromToken(token: string): Promise<AuthSessionUser | null> {
  const parsed = verifyAuthToken(token);
  if (!parsed) return null;

  if (!isDbConfigured("palliative")) {
    return getAuthUserById(parsed.userId);
  }

  await ensureAuthSchema();
  const pool = getPool("palliative");
  const [sessionRows] = await pool.query(
    `
      SELECT user_id AS userId
      FROM palliative_auth_sessions
      WHERE token_hash = ?
        AND expires_at > NOW()
      LIMIT 1
    `,
    [hashToken(token)],
  );
  const session = (sessionRows as Array<{ userId?: string }>)[0];
  if (!session?.userId) return null;

  const [rows] = await pool.query(
    `
      SELECT id, username, display_name AS displayName, role, unit_id AS unitId, active, approval_status AS approvalStatus
      FROM palliative_users
      WHERE id = ?
      LIMIT 1
    `,
    [session.userId],
  );
  const row = (rows as DbUserRow[])[0];
  if (!row || !Boolean(row.active) || row.approvalStatus !== "approved") return null;
  return {
    id: row.id,
    username: row.username,
    displayName: normalizedUserDisplayName(
      row.username,
      row.role,
      row.unitId,
      row.displayName,
    ),
    role: row.role,
    unitId: row.unitId,
  };
}

export async function registerAppUserRequest(input: {
  username: string;
  displayName: string;
  password: string;
  role: UserRole;
  unitId: string;
}) {
  if (!isDbConfigured("palliative")) {
    return registerUserRequestMock(input);
  }

  await ensureAuthSchema();
  const pool = getPool("palliative");
  const normalizedUsername = input.username.trim().toLowerCase();
  if (!normalizedUsername) throw new Error("กรุณาระบุ username");
  if (input.password.trim().length < 6) {
    throw new Error("รหัสผ่านต้องอย่างน้อย 6 ตัวอักษร");
  }
  const [existsRows] = await pool.query(
    `SELECT id FROM palliative_users WHERE LOWER(username) = LOWER(?) LIMIT 1`,
    [normalizedUsername],
  );
  if ((existsRows as Array<{ id: string }>).length) {
    throw new Error("username นี้มีในระบบแล้ว");
  }

  const id = `u-${Date.now()}`;
  await pool.query(
    `
      INSERT INTO palliative_users (
        id, username, display_name, role, unit_id, active,
        password_hash, approval_status, requested_at, approved_at, approved_by_user_id, review_note
      )
      VALUES (?, ?, ?, ?, ?, 0, ?, 'pending', NOW(), NULL, NULL, NULL)
    `,
    [
      id,
      normalizedUsername,
      input.displayName.trim() || normalizedUsername,
      input.role,
      input.unitId,
      hashPassword(input.password.trim()),
    ],
  );
  return { id };
}

export async function getPendingUserRequests(input: {
  reviewerUserId: string;
  token: string;
}): Promise<PendingUserRequest[]> {
  const reviewer = await getSessionUserFromToken(input.token);
  if (!reviewer || reviewer.id !== input.reviewerUserId || !roleCanApprove(reviewer.role)) {
    throw new Error("ไม่มีสิทธิ์เข้าถึงรายการอนุมัติ");
  }

  if (!isDbConfigured("palliative")) {
    return getPendingUsers();
  }

  await ensureAuthSchema();
  const pool = getPool("palliative");
  const [rows] = await pool.query(
    `
      SELECT
        id,
        username,
        display_name AS displayName,
        role,
        unit_id AS unitId,
        active,
        approval_status AS approvalStatus,
        requested_at AS requestedAt,
        approved_at AS reviewedAt,
        approved_by_user_id AS reviewedByUserId,
        review_note AS reviewNote
      FROM palliative_users
      WHERE approval_status IN ('pending', 'rejected')
      ORDER BY requested_at DESC, username ASC
    `,
  );
  return (rows as DbUserRow[]).map((row) => ({
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    role: row.role,
    unitId: row.unitId,
    active: Boolean(row.active),
    approvalStatus: (row.approvalStatus ?? "pending") as UserApprovalStatus,
    requestedAt: row.requestedAt ?? undefined,
    reviewedAt: row.approvedAt ?? undefined,
    reviewedByUserId: row.approvedByUserId ?? undefined,
    reviewNote: row.reviewNote ?? undefined,
  }));
}

export async function reviewUserRequest(input: {
  reviewerUserId: string;
  targetUserId: string;
  approved: boolean;
  reviewNote?: string;
  token: string;
}) {
  const reviewer = await getSessionUserFromToken(input.token);
  if (!reviewer || reviewer.id !== input.reviewerUserId || !roleCanApprove(reviewer.role)) {
    throw new Error("ไม่มีสิทธิ์อนุมัติผู้ใช้งาน");
  }

  if (!isDbConfigured("palliative")) {
    return reviewPendingUser({
      reviewerUserId: input.reviewerUserId,
      targetUserId: input.targetUserId,
      approved: input.approved,
      reviewNote: input.reviewNote,
    });
  }

  await ensureAuthSchema();
  const pool = getPool("palliative");
  await pool.query(
    `
      UPDATE palliative_users
      SET
        approval_status = ?,
        active = ?,
        approved_at = NOW(),
        approved_by_user_id = ?,
        review_note = ?
      WHERE id = ?
    `,
    [
      input.approved ? "approved" : "rejected",
      input.approved ? 1 : 0,
      input.reviewerUserId,
      input.reviewNote?.trim() || null,
      input.targetUserId,
    ],
  );
  return { ok: true };
}

export async function adminCreateUser(input: {
  actorUserId: string;
  token: string;
  username: string;
  displayName: string;
  password: string;
  role: UserRole;
  unitId: string;
  active?: boolean;
}) {
  const actor = await getSessionUserFromToken(input.token);
  if (!actor || actor.id !== input.actorUserId || !roleCanManageUsers(actor.role)) {
    throw new Error("เฉพาะ admin หรือ case manager เท่านั้น");
  }
  if (
    input.role &&
    !roleIsAdmin(actor.role) &&
    (input.role === "hospital_admin" ||
      input.role === "hospital_case_manager")
  ) {
    throw new Error("ไม่มีสิทธิ์แก้เป็น role นี้");
  }

  if (!isDbConfigured("palliative")) {
    return createUserByAdmin({
      username: input.username,
      displayName: input.displayName,
      password: input.password,
      role: input.role,
      unitId: input.unitId,
      active: input.active,
    });
  }

  await ensureAuthSchema();
  const pool = getPool("palliative");
  const username = input.username.trim().toLowerCase();
  if (!username) throw new Error("กรุณาระบุ username");
  if (input.password.trim().length < 6) throw new Error("รหัสผ่านต้องอย่างน้อย 6 ตัวอักษร");

  const [existsRows] = await pool.query(
    `SELECT id FROM palliative_users WHERE LOWER(username) = LOWER(?) LIMIT 1`,
    [username],
  );
  if ((existsRows as Array<{ id: string }>).length) {
    throw new Error("username นี้มีในระบบแล้ว");
  }

  const id = `u-${Date.now()}`;
  await pool.query(
    `
      INSERT INTO palliative_users (
        id, username, display_name, role, unit_id, active, password_hash,
        approval_status, requested_at, approved_at, approved_by_user_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 'approved', NOW(), NOW(), ?)
    `,
    [
      id,
      username,
      input.displayName.trim() || username,
      input.role,
      input.unitId,
      input.active ? 1 : 0,
      hashPassword(input.password.trim()),
      input.actorUserId,
    ],
  );
  return { id };
}

export async function adminUpdateUser(input: {
  actorUserId: string;
  token: string;
  targetUserId: string;
  username?: string;
  displayName?: string;
  role?: UserRole;
  unitId?: string;
  active?: boolean;
  password?: string;
}) {
  const actor = await getSessionUserFromToken(input.token);
  if (!actor || actor.id !== input.actorUserId || !roleCanManageUsers(actor.role)) {
    throw new Error("เฉพาะ admin หรือ case manager เท่านั้น");
  }
  if (
    input.role &&
    !roleIsAdmin(actor.role) &&
    (input.role === "hospital_admin" ||
      input.role === "hospital_case_manager")
  ) {
    throw new Error("ไม่มีสิทธิ์แก้เป็น role นี้");
  }

  if (!isDbConfigured("palliative")) {
    return updateUserByAdmin(input.targetUserId, {
      username: input.username,
      displayName: input.displayName,
      role: input.role,
      unitId: input.unitId,
      active: input.active,
      password: input.password,
    });
  }

  await ensureAuthSchema();
  const pool = getPool("palliative");
  const username = input.username?.trim().toLowerCase();
  if (input.username !== undefined && !username) {
    throw new Error("กรุณาระบุ username");
  }
  if (username) {
    const [existsRows] = await pool.query(
      `SELECT id FROM palliative_users WHERE LOWER(username) = LOWER(?) AND id <> ? LIMIT 1`,
      [username, input.targetUserId],
    );
    if ((existsRows as Array<{ id: string }>).length) {
      throw new Error("username นี้มีในระบบแล้ว");
    }
  }
  await pool.query(
    `
      UPDATE palliative_users
      SET
        username = COALESCE(?, username),
        display_name = COALESCE(?, display_name),
        role = COALESCE(?, role),
        unit_id = COALESCE(?, unit_id),
        active = COALESCE(?, active),
        password_hash = CASE
          WHEN ? IS NULL OR ? = '' THEN password_hash
          ELSE ?
        END,
        approval_status = CASE
          WHEN COALESCE(?, active) = 1 THEN 'approved'
          ELSE approval_status
        END
      WHERE id = ?
  `,
    [
      username || null,
      input.displayName?.trim() || null,
      input.role ?? null,
      input.unitId ?? null,
      input.active === undefined ? null : input.active ? 1 : 0,
      input.password?.trim() || null,
      input.password?.trim() || null,
      input.password?.trim() ? hashPassword(input.password.trim()) : null,
      input.active === undefined ? null : input.active ? 1 : 0,
      input.targetUserId,
    ],
  );
  return { ok: true };
}

export async function adminDeleteUser(input: {
  actorUserId: string;
  token: string;
  targetUserId: string;
}) {
  const actor = await getSessionUserFromToken(input.token);
  if (!actor || actor.id !== input.actorUserId || !roleCanManageUsers(actor.role)) {
    throw new Error("เฉพาะ admin หรือ case manager เท่านั้น");
  }
  if (input.targetUserId === input.actorUserId) {
    throw new Error("ไม่สามารถลบบัญชีของตัวเอง");
  }

  if (!isDbConfigured("palliative")) {
    return deleteUserByAdmin(input.targetUserId);
  }

  await ensureAuthSchema();
  const pool = getPool("palliative");
  await pool.query(`DELETE FROM palliative_users WHERE id = ?`, [input.targetUserId]);
  return { ok: true };
}

export async function cancelRegistration(patientId: number, reason: string) {
  if (!isDbConfigured("palliative")) {
    return cancelPatientRegistration(patientId, reason);
  }

  const pool = getPool("palliative");
  await pool.query(
    `UPDATE palliative_registry SET care_status = 'cancelled', cancellation_reason = ?, next_visit_at = NULL WHERE id = ?`,
    [reason, patientId],
  );
  return { ok: true };
}
