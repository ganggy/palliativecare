export type UnitKind = "hospital" | "rphst" | "pcu";

export type UserRole =
  | "hospital_admin"
  | "hospital_case_manager"
  | "hospital_executive"
  | "hospital_card_room"
  | "hospital_pcu"
  | "unit_manager"
  | "unit_nurse";
export type UserApprovalStatus = "approved" | "pending" | "rejected";

export type CareStatus =
  | "candidate"
  | "registered"
  | "scheduled"
  | "active"
  | "completed"
  | "cancelled"
  | "deceased";

export type VisitStatus = "planned" | "completed" | "missed";

export type CommentAudience = "hospital" | "unit" | "all";

export interface ClinicRule {
  unitId: string;
  clinicName: string;
  shortName: string;
  unitKind: UnitKind;
  chwpart: string;
  amppart: string;
  tmbpartInclude: string[];
  moopartInclude?: string[];
  moopartExclude?: string[];
  excludeDeath?: boolean;
}

export interface ServiceUnit {
  id: string;
  code: string;
  shortName: string;
  name: string;
  kind: UnitKind;
  color: string;
  description: string;
}

export interface AppUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  unitId: string;
  active: boolean;
  approvalStatus?: UserApprovalStatus;
  approvedAt?: string;
  approvedByUserId?: string;
}

export interface AuthSessionUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  unitId: string;
}

export interface PendingUserRequest {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  unitId: string;
  active: boolean;
  approvalStatus: UserApprovalStatus;
  requestedAt?: string;
  reviewedAt?: string;
  reviewedByUserId?: string;
  reviewNote?: string;
}

export interface ClaimChecklist {
  diagZ515: boolean;
  diagZ718: boolean;
  adp30001: boolean;
  eva001: boolean;
  cons01: boolean;
  hasAuthentication: boolean;
  hasHomeVisitReport: boolean;
  hasPhoto: boolean;
  opioidEligible: boolean;
  readyForClaim: boolean;
}

export interface VisitWindow {
  startDate: string;
  endDate: string;
}

export interface VisitChecklist {
  symptomAssessment: boolean;
  medicationReconciled: boolean;
  adlReviewed: boolean;
  acpReviewed: boolean;
  equipmentChecked: boolean;
  caregiverBriefed: boolean;
  photoCaptured: boolean;
}

export interface VisitClinicalAssessment {
  temperatureCelsius?: string;
  pulsePerMinute?: string;
  respiratoryRatePerMinute?: string;
  bloodPressureMmHg?: string;
  ppsScore?: number;
  esasChiefComplaint?: string;
  distressingSymptoms: string[];
  oxygenUse?: string;
  oxygenUseOther?: string;
  painLocation?: string;
  painScore?: number;
  painManagement: string[];
  painManagementOther?: string;
  morphineSideEffects: string[];
  morphineSideEffectsOther?: string;
}

export interface AdvanceCarePlanForm {
  planDate: string;
  patientName: string;
  patientAge?: string;
  patientCid?: string;
  patientAddress?: string;
  patientPhone?: string;
  patientBirthDate?: string;
  regularHospital?: string;
  insurance?: string;
  coPlannerName?: string;
  coPlannerCid?: string;
  coPlannerRelation?: string;
  coPlannerPhone?: string;
  importantValues: string[];
  importantValuesOther?: string;
  unacceptableStates: string[];
  unacceptableStatesOther?: string;
  treatmentScope?: string;
  treatmentScopeOther?: string;
  otherCare?: string;
  terminalNaturalDeath?: string;
  preferredPlace?: string;
  preferredPlaceOther?: string;
  terminalOtherCare?: string;
  proxyName?: string;
  proxyAge?: string;
  proxyRelation?: string;
  proxyAddress?: string;
  proxyPhone?: string;
  healthStaffName?: string;
  healthStaffProfession?: string;
  healthStaffPhone?: string;
  patientSignerName?: string;
  proxySignerName?: string;
  witness1Name?: string;
  witness2Name?: string;
}

export interface AdvanceCarePlanDocument {
  id: string;
  fileName: string;
  url: string;
  createdAt: string;
  createdByUserId: string;
  createdByName: string;
  form: AdvanceCarePlanForm;
}

export interface VisitPhoto {
  id: string;
  visitId: number;
  fileName: string;
  url: string;
  caption?: string;
  capturedAt: string;
}

export interface PalliativeVisit {
  id: number;
  patientId: number;
  unitId: string;
  visitDate: string;
  scheduledDate: string;
  rescheduledFrom?: string;
  status: VisitStatus;
  visitorUserId: string;
  visitorName: string;
  authenCode?: string;
  symptoms: string;
  note: string;
  checklist: VisitChecklist;
  clinical?: VisitClinicalAssessment;
  advanceCarePlan?: AdvanceCarePlanDocument;
  photos: VisitPhoto[];
  createdAt: string;
}

export interface PatientComment {
  id: string;
  patientId: number;
  unitId: string;
  authorUserId: string;
  authorName: string;
  audience: CommentAudience;
  body: string;
  createdAt: string;
}

export interface PalliativePatient {
  id: number;
  hn: string;
  cid: string;
  fullName: string;
  age: number;
  birthday?: string;
  sex: "M" | "F";
  assignedUnitId: string;
  assignedUnitName: string;
  assignedUnitKind: UnitKind;
  insuranceGroup?: string;
  primaryDxCode: string;
  primaryDxName: string;
  careStatus: CareStatus;
  eligibleReason: string;
  phone?: string;
  relativePhone?: string;
  lineId?: string;
  address?: string;
  notes: string;
  registeredAt: string;
  registeredByUserId: string;
  lastVisitAt?: string;
  nextVisitAt?: string;
  serviceMonthCount: number;
  visitWindow: VisitWindow;
  claimChecklist: ClaimChecklist;
  cancellationReason?: string;
  dischargedAt?: string;
  historicalVisitDates?: string[];
  commentCount: number;
  latestCommentAt?: string;
}

export interface DashboardSummary {
  registeredCount: number;
  dueToday: number;
  dueThisWeek: number;
  claimReadyCount: number;
  completedThisMonth: number;
  cancelledCount: number;
  opioidCount: number;
  unreadCoordinationCount: number;
}

export interface UnitSummary {
  unitId: string;
  unitName: string;
  unitKind: UnitKind;
  activePatients: number;
  dueThisWeek: number;
  claimReady: number;
  visitsThisMonth: number;
  pendingPhotos: number;
}

export interface AppGuide {
  role: UserRole;
  title: string;
  steps: string[];
}

export interface HosCandidate {
  hn: string;
  cid: string;
  fullName: string;
  age: number;
  birthday?: string;
  sex: "M" | "F";
  unitId: string;
  clinicName: string;
  clinicShortName: string;
  insuranceGroup?: string;
  primaryDxCode: string;
  primaryDxName: string;
  phone?: string;
  address?: string;
  visitDate: string;
  lastServiceAt?: string;
  serviceCount: number;
  incompleteVisitCount: number;
  eligibleReason: string;
  claimChecklist: ClaimChecklist;
}

export type CandidateFilterMode =
  | "all"
  | "missing_any_z"
  | "missing_both_z"
  | "z_done_but_visit_incomplete";
export type CandidateDxGroup =
  | "all"
  | "cancer"
  | "stroke-neuro"
  | "dementia"
  | "ckd"
  | "copd"
  | "hiv"
  | "liver"
  | "heart"
  | "palliative-z"
  | "other";

export interface CandidateVisitOpitem {
  icode: string;
  itemName: string;
  adpCode?: string;
  qty: number;
  totalPrice: number;
}

export interface CandidateVisitHistory {
  vn: string;
  visitDate: string;
  primaryDxCode: string;
  diagCodes: string[];
  adpCodes: string[];
  isCompleteByCriteria: boolean;
  missingCriteria: string[];
  opitems: CandidateVisitOpitem[];
}

export interface HosPatientSearchItem {
  hn: string;
  cid: string;
  fullName: string;
  sex: "M" | "F";
  age: number;
  phone?: string;
  lastVisitAt?: string;
  primaryDxCode?: string;
}

export interface HosPatientDiagItem {
  visitDate: string;
  vn: string;
  diagType?: string;
  icd10: string;
  diagName?: string;
}

export interface HosPatientLabItem {
  labDate: string;
  vn?: string;
  itemCode: string;
  itemName: string;
  result?: string;
  unit?: string;
  normalValue?: string;
}

export interface HosPatientServiceItem {
  visitDate: string;
  vn: string;
  pttype?: string;
  mainDep?: string;
  pdx?: string;
  pdxName?: string;
}

export interface HosPatientProfile {
  hn: string;
  cid: string;
  fullName: string;
  sex: "M" | "F";
  age: number;
  birthday?: string;
  phone?: string;
  address?: string;
  lastVisitAt?: string;
  primaryDxCode?: string;
}

export interface HosPatientDetail {
  profile: HosPatientProfile;
  diagHistory: HosPatientDiagItem[];
  labHistory: HosPatientLabItem[];
  serviceHistory: HosPatientServiceItem[];
}

export interface HosProgressSummary {
  inProgressCount: number;
  completedCount: number;
  importedInProgress: number;
  importedCompleted: number;
  refreshedAt: string;
  fromCache: boolean;
}

export interface StmAllocationSummary {
  unitId: string;
  unitName: string;
  percent: number;
  totalAmount: number;
  allocatedAmount: number;
  rowCount: number;
}

export interface StmRow {
  id: string;
  batchId: string;
  hn: string;
  patientName: string;
  amount: number;
  unitId: string;
  claimMonth: string;
  note?: string;
}

export interface StmBatch {
  id: string;
  fileName: string;
  importedAt: string;
  importedByUserId: string;
  importedByName: string;
  defaultSplitPercent: number;
  rows: StmRow[];
  allocations: StmAllocationSummary[];
}

export interface AppSnapshot {
  generatedAt: string;
  currentDate: string;
  users: AppUser[];
  units: ServiceUnit[];
  clinicRules: ClinicRule[];
  patients: PalliativePatient[];
  visits: PalliativeVisit[];
  comments: PatientComment[];
  guides: AppGuide[];
  unitSummaries: UnitSummary[];
  dashboard: DashboardSummary;
  stmBatches: StmBatch[];
}
