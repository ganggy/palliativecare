import { clinicRules, serviceUnits } from "./clinic-rules";
import { hashPassword, verifyPassword } from "./auth";
import {
  buildClaimChecklist,
  buildVisitWindow,
  describeEligibility,
  monthKey,
  normalizeVisitChecklist,
  toDateKey,
  validateVisitSubmission,
} from "./rules";
import type {
  AdvanceCarePlanDocument,
  AdvanceCarePlanForm,
  AppGuide,
  AppSnapshot,
  AppUser,
  AuthSessionUser,
  HosCandidate,
  PendingUserRequest,
  PatientComment,
  PalliativePatient,
  PalliativeVisit,
  ServiceUnit,
  StmBatch,
  StmRow,
  UnitSummary,
  UserRole,
  VisitClinicalAssessment,
  VisitChecklist,
  VisitPhoto,
} from "./types";

const defaultUsers: AppUser[] = [
  {
    id: "u-hos-admin",
    username: "hosadmin",
    displayName: "ผู้ดูแลระบบโรงพยาบาล",
    role: "hospital_admin",
    unitId: "hospital-core",
    active: true,
  },
  {
    id: "u-hos-case",
    username: "case.manager",
    displayName: "Case Manager โรงพยาบาล",
    role: "hospital_case_manager",
    unitId: "hospital-core",
    active: true,
  },
  {
    id: "u-pcu-hospital",
    username: "pcu.hospital",
    displayName: "ทีม PCU โรงพยาบาล",
    role: "hospital_pcu",
    unitId: "pcu-hospital",
    active: true,
  },
  {
    id: "u-card-room",
    username: "card.room",
    displayName: "ห้องบัตร",
    role: "hospital_card_room",
    unitId: "hospital-core",
    active: true,
  },
  {
    id: "u-executive",
    username: "executive",
    displayName: "ผู้บริหาร",
    role: "hospital_executive",
    unitId: "hospital-core",
    active: true,
  },
  {
    id: "u-huey-manager",
    username: "huey.manager",
    displayName: "หัวหน้าทีมห้วยหีบ",
    role: "unit_manager",
    unitId: "huey-hib",
    active: true,
  },
  {
    id: "u-huey-nurse",
    username: "huey.nurse",
    displayName: "พยาบาลห้วยหีบ",
    role: "unit_nurse",
    unitId: "huey-hib",
    active: true,
  },
  {
    id: "u-muang-manager",
    username: "muang.manager",
    displayName: "หัวหน้าทีมม่วงไข",
    role: "unit_manager",
    unitId: "muang-khai",
    active: true,
  },
  {
    id: "u-phon-manager",
    username: "phon.manager",
    displayName: "หัวหน้าทีมโพนทองวัฒนา",
    role: "unit_manager",
    unitId: "phon-thong",
    active: true,
  },
  {
    id: "u-banlao-manager",
    username: "banlao.manager",
    displayName: "หัวหน้าทีมบ้านเหล่าโพนค้อ",
    role: "unit_manager",
    unitId: "ban-lao",
    active: true,
  },
  {
    id: "u-khok-manager",
    username: "khok.manager",
    displayName: "หัวหน้าทีมโคกนาดี",
    role: "unit_manager",
    unitId: "khok-na-dee",
    active: true,
  },
];

const guides: AppGuide[] = [
  {
    role: "hospital_admin",
    title: "บทบาทโรงพยาบาล",
    steps: [
      "คัดเลือกเคสจาก HOSXP และมอบหมายไปยัง รพ.สต. หรือ PCU ที่รับผิดชอบ",
      "กำหนดวันเยี่ยมและตรวจว่า Z51.5, Z71.8, 30001, EVA001, CONS01 ครบหรือยัง",
      "ติดตามคอมเมนต์ ภาพเยี่ยมบ้าน และสรุปผลงานของแต่ละหน่วย",
    ],
  },
  {
    role: "hospital_case_manager",
    title: "บทบาท Case Manager",
    steps: [
      "ตรวจความสมบูรณ์ข้อมูลก่อนเบิกและทวนแผนดูแลที่บ้าน",
      "แก้วันเยี่ยมได้ภายในเดือนเดียวกับรอบเยี่ยมเพื่อไม่ให้หลุดช่วงเบิก",
      "ใช้หน้าการเงินเพื่อกระจายยอดจาก STM/REP ตามสัดส่วนที่กำหนด",
    ],
  },
  {
    role: "hospital_executive",
    title: "บทบาทผู้บริหาร",
    steps: [
      "ติดตามภาพรวมการดูแลและความพร้อมของข้อมูลในระดับโรงพยาบาล",
      "ใช้ข้อมูลรายหน่วยเพื่อดูจำนวนเคส คิวเยี่ยม และความพร้อมเบิก",
      "ไม่ต้องบันทึก visit แต่สามารถเข้าดูข้อมูลสรุปเพื่อประกอบการบริหารได้",
    ],
  },
  {
    role: "hospital_card_room",
    title: "บทบาทห้องบัตร",
    steps: [
      "เลือกวันที่ที่ต้องการตรวจรายการคนไข้ที่มีการแนบรูปมาแล้ว",
      "ใช้เลขบัตรประชาชน HN ชื่อคนไข้ และรูปที่แนบมาเพื่อช่วยเปิดบัตรหรือปิดสิทธิ์",
      "หน้าห้องบัตรจะแสดงเฉพาะข้อมูลที่จำเป็นต่อการทำงานเท่านั้น",
    ],
  },
  {
    role: "hospital_pcu",
    title: "บทบาท PCU โรงพยาบาล",
    steps: [
      "ดูแลเคสในโซน PCU โรงพยาบาลเช่นเดียวกับ รพ.สต.",
      "ทุกครั้งที่ออกเยี่ยมให้บันทึกรูป อาการ และ checklist ให้ครบ",
      "หากพบประเด็นต้องส่งต่อให้ใช้คอมเมนต์กลับไปยังทีมโรงพยาบาล",
    ],
  },
  {
    role: "unit_manager",
    title: "บทบาทหัวหน้าหน่วย",
    steps: [
      "ติดตามจำนวนเคสในมือ ตารางเยี่ยม และเคสที่ข้อมูลยังไม่พร้อมเบิก",
      "ตรวจความครบถ้วนของรูปเยี่ยมบ้านและสรุปอาการก่อนปิด visit",
      "คุมคุณภาพการบันทึกข้อมูลของทีมในหน่วยตัวเอง",
    ],
  },
  {
    role: "unit_nurse",
    title: "บทบาทผู้เยี่ยมบ้าน",
    steps: [
      "เปิดดูตารางเยี่ยมประจำวันและเลื่อนนัดได้เฉพาะในช่วงวันที่กำหนด",
      "บันทึกอาการติดตาม พร้อมรูปผู้ป่วย และ authen code ทุกครั้ง",
      "ถ้ามีงานต่อเนื่องให้ส่งคอมเมนต์กลับโรงพยาบาลทันทีจากหน้าผู้ป่วย",
    ],
  },
];

const seedPatients: PalliativePatient[] = [
  {
    id: 1,
    hn: "0045123",
    cid: "1470100000001",
    fullName: "นางสาวศิริพร แสนดี",
    age: 67,
    sex: "F",
    assignedUnitId: "huey-hib",
    assignedUnitName: "รพ.สต.ห้วยหีบ",
    assignedUnitKind: "rphst",
    primaryDxCode: "C349",
    primaryDxName: "Malignant neoplasm of bronchus or lung",
    careStatus: "scheduled",
    eligibleReason: describeEligibility("C349"),
    phone: "089-123-4567",
    relativePhone: "081-200-1100",
    lineId: "@siri.home",
    address: "12 ม. 3 ต. หนองแสง อ.เมือง",
    notes: "โรงพยาบาลขอให้ติดตามอาการปวดและการใช้ออกซิเจน",
    registeredAt: "2026-03-02",
    registeredByUserId: "u-hos-case",
    lastVisitAt: "2026-03-28",
    nextVisitAt: "2026-04-14",
    serviceMonthCount: 4,
    visitWindow: buildVisitWindow("2026-04-14"),
    claimChecklist: buildClaimChecklist({
      diagZ515: true,
      diagZ718: true,
      adp30001: true,
      eva001: true,
      cons01: true,
      hasAuthentication: false,
      hasHomeVisitReport: false,
      hasPhoto: false,
      opioidEligible: true,
    }),
    commentCount: 2,
    latestCommentAt: "2026-04-09T10:20:00+07:00",
  },
  {
    id: 2,
    hn: "0098302",
    cid: "1470100000002",
    fullName: "นายบุญมา ใจดี",
    age: 74,
    sex: "M",
    assignedUnitId: "muang-khai",
    assignedUnitName: "รพ.สต.ม่วงไข",
    assignedUnitKind: "rphst",
    primaryDxCode: "I639",
    primaryDxName: "Stroke, not specified as haemorrhage or infarction",
    careStatus: "active",
    eligibleReason: describeEligibility("I639"),
    phone: "098-333-2211",
    relativePhone: "080-777-2222",
    address: "44 ม. 1 ต. ม่วงไข",
    notes: "ต้องติดตามการกลืนและภาวะขาดสารอาหาร",
    registeredAt: "2026-02-11",
    registeredByUserId: "u-hos-case",
    lastVisitAt: "2026-04-05",
    nextVisitAt: "2026-04-18",
    serviceMonthCount: 2,
    visitWindow: buildVisitWindow("2026-04-18"),
    claimChecklist: buildClaimChecklist({
      diagZ515: true,
      diagZ718: true,
      adp30001: true,
      eva001: true,
      cons01: false,
      hasAuthentication: true,
      hasHomeVisitReport: true,
      hasPhoto: true,
      opioidEligible: false,
    }),
    commentCount: 1,
    latestCommentAt: "2026-04-05T13:45:00+07:00",
  },
  {
    id: 3,
    hn: "0071133",
    cid: "1470100000003",
    fullName: "นายคำปัน วงศ์คำ",
    age: 58,
    sex: "M",
    assignedUnitId: "phon-thong",
    assignedUnitName: "รพ.สต.โพนทองวัฒนา",
    assignedUnitKind: "rphst",
    primaryDxCode: "N185",
    primaryDxName: "Chronic kidney disease, stage 5",
    careStatus: "scheduled",
    eligibleReason: describeEligibility("N185"),
    phone: "086-442-1155",
    relativePhone: "092-444-7000",
    address: "8 ม. 10 ต. โพนทอง",
    notes: "รอตรวจทวนอาการบวมและคำแนะนำเรื่องอาหาร",
    registeredAt: "2025-11-09",
    registeredByUserId: "u-hos-case",
    lastVisitAt: "2026-03-24",
    nextVisitAt: "2026-04-12",
    serviceMonthCount: 5,
    visitWindow: buildVisitWindow("2026-04-12"),
    claimChecklist: buildClaimChecklist({
      diagZ515: true,
      diagZ718: true,
      adp30001: true,
      eva001: true,
      cons01: true,
      hasAuthentication: true,
      hasHomeVisitReport: true,
      hasPhoto: true,
      opioidEligible: false,
    }),
    commentCount: 0,
  },
  {
    id: 4,
    hn: "0018991",
    cid: "1470100000006",
    fullName: "เด็กหญิงปลายฟ้า เกื้อกูล",
    age: 9,
    sex: "F",
    assignedUnitId: "huey-hib",
    assignedUnitName: "รพ.สต.ห้วยหีบ",
    assignedUnitKind: "rphst",
    primaryDxCode: "Q249",
    primaryDxName: "Congenital malformation of heart, unspecified",
    careStatus: "registered",
    eligibleReason: "เด็กอายุน้อยกว่า 15 ปีที่อยู่ใน Palliative care",
    phone: "091-333-8890",
    relativePhone: "081-555-1212",
    address: "77 ม. 17 ต. หนองแสง",
    notes: "ต้องมีการประเมิน ACP ร่วมกับผู้ปกครอง",
    registeredAt: "2026-02-12",
    registeredByUserId: "u-hos-case",
    lastVisitAt: "2026-03-30",
    nextVisitAt: "2026-04-15",
    serviceMonthCount: 1,
    visitWindow: buildVisitWindow("2026-04-15"),
    claimChecklist: buildClaimChecklist({
      diagZ515: true,
      diagZ718: false,
      adp30001: false,
      eva001: false,
      cons01: false,
      hasAuthentication: false,
      hasHomeVisitReport: false,
      hasPhoto: false,
      opioidEligible: false,
    }),
    commentCount: 1,
    latestCommentAt: "2026-04-02T15:00:00+07:00",
  },
  {
    id: 5,
    hn: "0055310",
    cid: "1470100000007",
    fullName: "นางขนิษฐา ใจเพชร",
    age: 72,
    sex: "F",
    assignedUnitId: "khok-na-dee",
    assignedUnitName: "รพ.สต.โคกนาดี",
    assignedUnitKind: "rphst",
    primaryDxCode: "C509",
    primaryDxName: "Malignant neoplasm of breast, unspecified",
    careStatus: "active",
    eligibleReason: describeEligibility("C509"),
    phone: "084-889-2211",
    relativePhone: "089-111-9000",
    address: "13 ม. 9 ต. โคกนาดี",
    notes: "รับยากลุ่ม opioid จากโรงพยาบาลและต้องติดตามผลข้างเคียง",
    registeredAt: "2025-10-05",
    registeredByUserId: "u-hos-case",
    lastVisitAt: "2026-04-07",
    nextVisitAt: "2026-04-20",
    serviceMonthCount: 5,
    visitWindow: buildVisitWindow("2026-04-20"),
    claimChecklist: buildClaimChecklist({
      diagZ515: true,
      diagZ718: true,
      adp30001: true,
      eva001: true,
      cons01: true,
      hasAuthentication: true,
      hasHomeVisitReport: true,
      hasPhoto: true,
      opioidEligible: true,
    }),
    commentCount: 1,
    latestCommentAt: "2026-04-07T09:00:00+07:00",
  },
  {
    id: 6,
    hn: "0012409",
    cid: "1470100000005",
    fullName: "นายประสิทธิ์ รอดชีพ",
    age: 63,
    sex: "M",
    assignedUnitId: "khok-na-dee",
    assignedUnitName: "รพ.สต.โคกนาดี",
    assignedUnitKind: "rphst",
    primaryDxCode: "K729",
    primaryDxName: "Hepatic failure, unspecified",
    careStatus: "deceased",
    eligibleReason: describeEligibility("K729"),
    address: "15 ม. 4 ต. โคกนาดี",
    notes: "เสียชีวิตและรอเคลียร์ยอดย้อนหลัง",
    registeredAt: "2025-12-28",
    registeredByUserId: "u-hos-case",
    lastVisitAt: "2026-03-31",
    serviceMonthCount: 3,
    visitWindow: buildVisitWindow("2026-03-31"),
    claimChecklist: buildClaimChecklist({
      diagZ515: true,
      diagZ718: true,
      adp30001: true,
      eva001: true,
      cons01: true,
      hasAuthentication: true,
      hasHomeVisitReport: true,
      hasPhoto: true,
      opioidEligible: true,
    }),
    dischargedAt: "2026-04-02",
    commentCount: 0,
  },
];

const seedVisits: PalliativeVisit[] = [
  {
    id: 1,
    patientId: 1,
    unitId: "huey-hib",
    visitDate: "2026-03-28",
    scheduledDate: "2026-03-28",
    status: "completed",
    visitorUserId: "u-huey-nurse",
    visitorName: "พยาบาลห้วยหีบ",
    authenCode: "AUTH-260328-01",
    symptoms: "ปวดระดับ 4/10 รับประทานอาหารได้น้อย เหนื่อยง่าย",
    note: "ให้คำแนะนำญาติเรื่องสัญญาณอันตรายและจัดยาต่อเนื่อง",
    checklist: {
      symptomAssessment: true,
      medicationReconciled: true,
      adlReviewed: true,
      acpReviewed: true,
      equipmentChecked: true,
      caregiverBriefed: true,
      photoCaptured: true,
    },
    photos: [
      {
        id: "photo-1",
        visitId: 1,
        fileName: "visit-1.jpg",
        url: "/window.svg",
        caption: "ตัวอย่างภาพเยี่ยมบ้าน",
        capturedAt: "2026-03-28T10:20:00+07:00",
      },
    ],
    createdAt: "2026-03-28T10:25:00+07:00",
  },
  {
    id: 2,
    patientId: 2,
    unitId: "muang-khai",
    visitDate: "2026-04-05",
    scheduledDate: "2026-04-05",
    status: "completed",
    visitorUserId: "u-muang-manager",
    visitorName: "หัวหน้าทีมม่วงไข",
    authenCode: "AUTH-260405-01",
    symptoms: "กลืนลำบาก ไอมีเสมหะ ไม่มีไข้",
    note: "วางแผนปรึกษาโภชนาการและติดตามอาการซ้ำใน 2 สัปดาห์",
    checklist: {
      symptomAssessment: true,
      medicationReconciled: true,
      adlReviewed: true,
      acpReviewed: false,
      equipmentChecked: true,
      caregiverBriefed: true,
      photoCaptured: true,
    },
    photos: [
      {
        id: "photo-2",
        visitId: 2,
        fileName: "visit-2.jpg",
        url: "/window.svg",
        caption: "ภาพเยี่ยมล่าสุด",
        capturedAt: "2026-04-05T13:30:00+07:00",
      },
    ],
    createdAt: "2026-04-05T13:35:00+07:00",
  },
  {
    id: 3,
    patientId: 5,
    unitId: "khok-na-dee",
    visitDate: "2026-04-07",
    scheduledDate: "2026-04-07",
    status: "completed",
    visitorUserId: "u-khok-manager",
    visitorName: "หัวหน้าทีมโคกนาดี",
    authenCode: "AUTH-260407-02",
    symptoms: "ปวดดีขึ้นหลังปรับยา ง่วงนอนเล็กน้อย",
    note: "ติดตามผลข้างเคียง opioid และย้ำการเก็บยาที่บ้าน",
    checklist: {
      symptomAssessment: true,
      medicationReconciled: true,
      adlReviewed: true,
      acpReviewed: true,
      equipmentChecked: true,
      caregiverBriefed: true,
      photoCaptured: true,
    },
    photos: [
      {
        id: "photo-3",
        visitId: 3,
        fileName: "visit-3.jpg",
        url: "/window.svg",
        caption: "ภาพเยี่ยมเคส opioid",
        capturedAt: "2026-04-07T09:00:00+07:00",
      },
    ],
    createdAt: "2026-04-07T09:05:00+07:00",
  },
];

const seedComments: PatientComment[] = [
  {
    id: "comment-1",
    patientId: 1,
    unitId: "hospital-core",
    authorUserId: "u-hos-case",
    authorName: "Case Manager โรงพยาบาล",
    audience: "unit",
    body: "รอบถัดไปขอถ่ายภาพอุปกรณ์ oxygen และยืนยัน authen code ให้ครบก่อนส่งเบิก",
    createdAt: "2026-04-01T08:20:00+07:00",
  },
  {
    id: "comment-2",
    patientId: 1,
    unitId: "huey-hib",
    authorUserId: "u-huey-manager",
    authorName: "หัวหน้าทีมห้วยหีบ",
    audience: "hospital",
    body: "ทราบแล้ว จะเก็บภาพและบันทึกอาการปวดละเอียดในรอบ 14 เม.ย.",
    createdAt: "2026-04-02T11:00:00+07:00",
  },
  {
    id: "comment-3",
    patientId: 2,
    unitId: "hospital-core",
    authorUserId: "u-hos-case",
    authorName: "Case Manager โรงพยาบาล",
    audience: "unit",
    body: "เคสนี้ยังขาด CONS01 ขอให้บันทึกร่วมกับ visit รอบถัดไป",
    createdAt: "2026-04-05T13:45:00+07:00",
  },
  {
    id: "comment-4",
    patientId: 4,
    unitId: "hospital-core",
    authorUserId: "u-hos-case",
    authorName: "Case Manager โรงพยาบาล",
    audience: "unit",
    body: "เด็ก palliative ขอให้เพิ่ม ACP discussion กับผู้ปกครองใน visit หน้า",
    createdAt: "2026-04-02T15:00:00+07:00",
  },
  {
    id: "comment-5",
    patientId: 5,
    unitId: "khok-na-dee",
    authorUserId: "u-khok-manager",
    authorName: "หัวหน้าทีมโคกนาดี",
    audience: "hospital",
    body: "ผลข้างเคียง opioid ยังควบคุมได้ ไม่มีภาวะกดการหายใจ",
    createdAt: "2026-04-07T09:00:00+07:00",
  },
];

const seedStmBatches: StmBatch[] = [
  {
    id: "stm-2026-03",
    fileName: "REP_STM_2026-03.csv",
    importedAt: "2026-04-10T14:30:00+07:00",
    importedByUserId: "u-hos-admin",
    importedByName: "ผู้ดูแลระบบโรงพยาบาล",
    defaultSplitPercent: 50,
    rows: [
      {
        id: "stm-row-1",
        batchId: "stm-2026-03",
        hn: "0045123",
        patientName: "นางสาวศิริพร แสนดี",
        amount: 4000,
        unitId: "huey-hib",
        claimMonth: "2026-03",
        note: "ครบเงื่อนไขเดือนมีนาคม",
      },
      {
        id: "stm-row-2",
        batchId: "stm-2026-03",
        hn: "0098302",
        patientName: "นายบุญมา ใจดี",
        amount: 1000,
        unitId: "muang-khai",
        claimMonth: "2026-03",
        note: "ยังขาด CONS01",
      },
      {
        id: "stm-row-3",
        batchId: "stm-2026-03",
        hn: "0055310",
        patientName: "นางขนิษฐา ใจเพชร",
        amount: 1750,
        unitId: "khok-na-dee",
        claimMonth: "2026-03",
        note: "รวม opioid 750 บาท",
      },
    ],
    allocations: [
      {
        unitId: "huey-hib",
        unitName: "รพ.สต.ห้วยหีบ",
        percent: 50,
        totalAmount: 4000,
        allocatedAmount: 2000,
        rowCount: 1,
      },
      {
        unitId: "muang-khai",
        unitName: "รพ.สต.ม่วงไข",
        percent: 50,
        totalAmount: 1000,
        allocatedAmount: 500,
        rowCount: 1,
      },
      {
        unitId: "khok-na-dee",
        unitName: "รพ.สต.โคกนาดี",
        percent: 50,
        totalAmount: 1750,
        allocatedAmount: 875,
        rowCount: 1,
      },
    ],
  },
];

const users = structuredClone(defaultUsers);
const patients = structuredClone(seedPatients);
const visits = structuredClone(seedVisits);
const comments = structuredClone(seedComments);
const stmBatches = structuredClone(seedStmBatches);
let nextPatientId = Math.max(...patients.map((item) => item.id)) + 1;
let nextVisitId = Math.max(...visits.map((item) => item.id)) + 1;

type MockAuthMeta = {
  passwordHash: string;
  approvalStatus: "approved" | "pending" | "rejected";
  requestedAt?: string;
  reviewedAt?: string;
  reviewedByUserId?: string;
  reviewNote?: string;
};

const authMetaByUserId = new Map<string, MockAuthMeta>(
  users.map((user) => [
    user.id,
    {
      passwordHash: hashPassword(user.username === "hosadmin" ? "admin123" : "123456"),
      approvalStatus: "approved",
      requestedAt: nowIso(),
      reviewedAt: nowIso(),
      reviewedByUserId: "u-hos-admin",
    },
  ]),
);

function clone<T>(value: T): T {
  return structuredClone(value);
}

function nowIso() {
  return new Date().toISOString();
}

function patientComments(patientId: number) {
  return comments.filter((item) => item.patientId === patientId);
}

function patientVisits(patientId: number) {
  return visits.filter((item) => item.patientId === patientId);
}

function refreshPatientMetrics(patient: PalliativePatient) {
  const linkedComments = patientComments(patient.id).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  const linkedVisits = patientVisits(patient.id).sort((a, b) =>
    b.visitDate.localeCompare(a.visitDate),
  );
  const lastVisit = linkedVisits[0];
  const hasPhoto = linkedVisits.some((visit) => visit.photos.length > 0);
  const hasAuth = linkedVisits.some((visit) => Boolean(visit.authenCode));

  patient.commentCount = linkedComments.length;
  patient.latestCommentAt = linkedComments[0]?.createdAt;
  patient.lastVisitAt = lastVisit?.visitDate ?? patient.lastVisitAt;
  patient.claimChecklist.hasPhoto = hasPhoto;
  patient.claimChecklist.hasAuthentication = hasAuth;
  patient.claimChecklist.hasHomeVisitReport = linkedVisits.length > 0;
  patient.claimChecklist.readyForClaim = Boolean(
    patient.claimChecklist.diagZ515 &&
    patient.claimChecklist.diagZ718 &&
    patient.claimChecklist.adp30001 &&
    patient.claimChecklist.eva001 &&
    patient.claimChecklist.cons01 &&
    patient.claimChecklist.hasAuthentication &&
    patient.claimChecklist.hasHomeVisitReport,
  );

  if (
    patient.careStatus !== "cancelled" &&
    patient.careStatus !== "deceased" &&
    patient.careStatus !== "completed"
  ) {
    if (!patient.nextVisitAt) {
      patient.careStatus = "registered";
    } else if (patient.nextVisitAt <= toDateKey()) {
      patient.careStatus = "scheduled";
    } else {
      patient.careStatus = linkedVisits.length > 0 ? "active" : "registered";
    }
  }
}

function refreshAllPatients() {
  patients.forEach(refreshPatientMetrics);
}

function buildDashboard() {
  refreshAllPatients();
  const today = toDateKey();
  const currentMonth = monthKey(today);
  const dueThisWeekCutoff = new Date(`${today}T00:00:00`);
  dueThisWeekCutoff.setDate(dueThisWeekCutoff.getDate() + 7);
  const dueWeekKey = toDateKey(dueThisWeekCutoff);

  return {
    registeredCount: patients.filter(
      (patient) => !["cancelled"].includes(patient.careStatus),
    ).length,
    dueToday: patients.filter((patient) => patient.nextVisitAt === today)
      .length,
    dueThisWeek: patients.filter(
      (patient) =>
        patient.nextVisitAt &&
        patient.nextVisitAt >= today &&
        patient.nextVisitAt <= dueWeekKey,
    ).length,
    claimReadyCount: patients.filter(
      (patient) => patient.claimChecklist.readyForClaim,
    ).length,
    completedThisMonth: patients.filter(
      (patient) =>
        patient.lastVisitAt && monthKey(patient.lastVisitAt) === currentMonth,
    ).length,
    cancelledCount: patients.filter(
      (patient) => patient.careStatus === "cancelled",
    ).length,
    opioidCount: patients.filter(
      (patient) => patient.claimChecklist.opioidEligible,
    ).length,
    unreadCoordinationCount: comments.filter(
      (item) => item.createdAt.slice(0, 10) >= today,
    ).length,
  };
}

function buildUnitSummaries(units: ServiceUnit[]): UnitSummary[] {
  const currentMonth = monthKey(toDateKey());
  const today = toDateKey();
  const cutoff = new Date(`${today}T00:00:00`);
  cutoff.setDate(cutoff.getDate() + 7);
  const weekEnd = toDateKey(cutoff);

  return units
    .filter((unit) => unit.kind !== "hospital")
    .map((unit) => {
      const unitPatients = patients.filter(
        (patient) =>
          patient.assignedUnitId === unit.id &&
          patient.careStatus !== "cancelled",
      );
      const unitVisits = visits.filter(
        (visit) =>
          visit.unitId === unit.id &&
          monthKey(visit.visitDate) === currentMonth,
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
        visitsThisMonth: unitVisits.length,
        pendingPhotos: unitPatients.filter(
          (patient) => !patient.claimChecklist.hasPhoto,
        ).length,
      };
    });
}

export function getSnapshot(): AppSnapshot {
  refreshAllPatients();
  return {
    generatedAt: nowIso(),
    currentDate: toDateKey(),
    users: clone(users).map((user) => {
      const meta = authMetaByUserId.get(user.id);
      return {
        ...user,
        approvalStatus: meta?.approvalStatus ?? "approved",
        approvedAt: meta?.reviewedAt,
        approvedByUserId: meta?.reviewedByUserId,
      };
    }),
    units: clone(serviceUnits),
    clinicRules: clone(clinicRules),
    patients: clone(patients).sort(
      (a, b) =>
        (a.nextVisitAt ?? "9999-12-31").localeCompare(
          b.nextVisitAt ?? "9999-12-31",
        ) || a.fullName.localeCompare(b.fullName),
    ),
    visits: clone(visits).sort(
      (a, b) => b.visitDate.localeCompare(a.visitDate) || b.id - a.id,
    ),
    comments: clone(comments).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    ),
    guides: clone(guides),
    unitSummaries: buildUnitSummaries(serviceUnits),
    dashboard: buildDashboard(),
    stmBatches: clone(stmBatches).sort((a, b) =>
      b.importedAt.localeCompare(a.importedAt),
    ),
  };
}

export function renameUser(id: string, displayName: string) {
  const target = users.find((item) => item.id === id);
  if (!target) throw new Error("User not found");
  target.displayName = displayName.trim() || target.displayName;
  return clone(target);
}

export function getAuthUserById(userId: string): AuthSessionUser | null {
  const user = users.find((item) => item.id === userId);
  const meta = user ? authMetaByUserId.get(user.id) : null;
  if (!user || !meta || !user.active || meta.approvalStatus !== "approved") {
    return null;
  }
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    unitId: user.unitId,
  };
}

export function authenticateUser(
  username: string,
  password: string,
): AuthSessionUser | null {
  const normalized = username.trim().toLowerCase();
  if (!normalized || !password) return null;
  const user = users.find((item) => item.username.toLowerCase() === normalized);
  const meta = user ? authMetaByUserId.get(user.id) : null;
  if (!user || !meta || !user.active || meta.approvalStatus !== "approved") {
    return null;
  }
  if (!verifyPassword(password, meta.passwordHash)) return null;
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    unitId: user.unitId,
  };
}

export function registerUserRequest(input: {
  username: string;
  displayName: string;
  password: string;
  role: UserRole;
  unitId: string;
}) {
  const username = input.username.trim().toLowerCase();
  if (!username) throw new Error("กรุณาระบุ username");
  if (input.password.length < 6) throw new Error("รหัสผ่านต้องอย่างน้อย 6 ตัวอักษร");
  if (users.some((item) => item.username.toLowerCase() === username)) {
    throw new Error("username นี้มีในระบบแล้ว");
  }
  const id = `u-req-${Date.now()}`;
  users.push({
    id,
    username,
    displayName: input.displayName.trim() || username,
    role: input.role,
    unitId: input.unitId,
    active: false,
  });
  authMetaByUserId.set(id, {
    passwordHash: hashPassword(input.password),
    approvalStatus: "pending",
    requestedAt: nowIso(),
  });
  return { id };
}

export function getPendingUsers(): PendingUserRequest[] {
  const rows: PendingUserRequest[] = [];
  for (const user of users) {
    const meta = authMetaByUserId.get(user.id);
    if (!meta || meta.approvalStatus === "approved") continue;
    rows.push({
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      unitId: user.unitId,
      active: user.active,
      approvalStatus: meta.approvalStatus,
      requestedAt: meta.requestedAt,
      reviewedAt: meta.reviewedAt,
      reviewedByUserId: meta.reviewedByUserId,
      reviewNote: meta.reviewNote,
    });
  }
  return rows.sort((a, b) => (b.requestedAt ?? "").localeCompare(a.requestedAt ?? ""));
}

export function reviewPendingUser(input: {
  targetUserId: string;
  approved: boolean;
  reviewerUserId: string;
  reviewNote?: string;
}) {
  const user = users.find((item) => item.id === input.targetUserId);
  const meta = user ? authMetaByUserId.get(user.id) : null;
  if (!user || !meta) throw new Error("ไม่พบคำขอสมัคร");
  meta.approvalStatus = input.approved ? "approved" : "rejected";
  meta.reviewedAt = nowIso();
  meta.reviewedByUserId = input.reviewerUserId;
  meta.reviewNote = input.reviewNote?.trim();
  user.active = input.approved;
  return { ok: true };
}

export function createUserByAdmin(input: {
  username: string;
  displayName: string;
  password: string;
  role: UserRole;
  unitId: string;
  active?: boolean;
}) {
  const username = input.username.trim().toLowerCase();
  if (!username) throw new Error("กรุณาระบุ username");
  if (input.password.length < 6) throw new Error("รหัสผ่านต้องอย่างน้อย 6 ตัวอักษร");
  if (users.some((item) => item.username.toLowerCase() === username)) {
    throw new Error("username นี้มีในระบบแล้ว");
  }
  const id = `u-${Date.now()}`;
  users.push({
    id,
    username,
    displayName: input.displayName.trim() || username,
    role: input.role,
    unitId: input.unitId,
    active: input.active ?? true,
  });
  authMetaByUserId.set(id, {
    passwordHash: hashPassword(input.password),
    approvalStatus: "approved",
    requestedAt: nowIso(),
    reviewedAt: nowIso(),
    reviewedByUserId: "u-hos-admin",
  });
  return { id };
}

export function updateUserByAdmin(
  userId: string,
  patch: Partial<{
    username: string;
    displayName: string;
    role: UserRole;
    unitId: string;
    active: boolean;
    password: string;
  }>,
) {
  const user = users.find((item) => item.id === userId);
  const meta = user ? authMetaByUserId.get(user.id) : null;
  if (!user || !meta) throw new Error("ไม่พบผู้ใช้งาน");
  if (patch.username !== undefined) {
    const username = patch.username.trim().toLowerCase();
    if (!username) throw new Error("กรุณาระบุ username");
    if (
      users.some(
        (item) =>
          item.id !== userId && item.username.toLowerCase() === username,
      )
    ) {
      throw new Error("username นี้มีในระบบแล้ว");
    }
    user.username = username;
  }
  if (patch.displayName !== undefined) user.displayName = patch.displayName.trim() || user.displayName;
  if (patch.role !== undefined) user.role = patch.role;
  if (patch.unitId !== undefined) user.unitId = patch.unitId;
  if (patch.active !== undefined) user.active = patch.active;
  if (patch.password !== undefined && patch.password.trim()) {
    if (patch.password.trim().length < 6) throw new Error("รหัสผ่านต้องอย่างน้อย 6 ตัวอักษร");
    meta.passwordHash = hashPassword(patch.password.trim());
  }
  return { ok: true };
}

export function deleteUserByAdmin(userId: string) {
  const index = users.findIndex((item) => item.id === userId);
  if (index < 0) throw new Error("ไม่พบผู้ใช้งาน");
  users.splice(index, 1);
  authMetaByUserId.delete(userId);
  return { ok: true };
}

export function registerPatientFromCandidate(
  candidate: HosCandidate,
  input: {
    nextVisitAt: string;
    assignedUnitId: string;
    note?: string;
    userId: string;
  },
) {
  const unit = serviceUnits.find((item) => item.id === input.assignedUnitId);
  if (!unit) throw new Error("Unit not found");

  const existing = patients.find(
    (item) => item.hn === candidate.hn || item.cid === candidate.cid,
  );
  const payload: PalliativePatient = existing ?? {
    id: nextPatientId++,
    hn: candidate.hn,
    cid: candidate.cid,
    fullName: candidate.fullName,
    age: candidate.age,
    birthday: candidate.birthday,
    sex: candidate.sex,
    assignedUnitId: unit.id,
    assignedUnitName: unit.name,
    assignedUnitKind: unit.kind,
    insuranceGroup: candidate.insuranceGroup,
    primaryDxCode: candidate.primaryDxCode,
    primaryDxName: candidate.primaryDxName,
    careStatus: "registered",
    eligibleReason: candidate.eligibleReason,
    phone: candidate.phone,
    address: candidate.address,
    notes: input.note?.trim() || "ลงทะเบียนจาก HOSXP",
    registeredAt: toDateKey(),
    registeredByUserId: input.userId,
    serviceMonthCount: candidate.serviceCount,
    visitWindow: buildVisitWindow(input.nextVisitAt),
    nextVisitAt: input.nextVisitAt,
    claimChecklist: clone(candidate.claimChecklist),
    commentCount: 0,
  };

  payload.assignedUnitId = unit.id;
  payload.assignedUnitName = unit.name;
  payload.assignedUnitKind = unit.kind;
  payload.primaryDxCode = candidate.primaryDxCode;
  payload.primaryDxName = candidate.primaryDxName;
  payload.nextVisitAt = input.nextVisitAt;
  payload.visitWindow = buildVisitWindow(input.nextVisitAt);
  payload.phone = candidate.phone ?? payload.phone;
  payload.address = candidate.address ?? payload.address;
  payload.notes = input.note?.trim() || payload.notes;
  payload.claimChecklist = buildClaimChecklist({
    ...candidate.claimChecklist,
    hasAuthentication: payload.claimChecklist.hasAuthentication,
    hasHomeVisitReport: payload.claimChecklist.hasHomeVisitReport,
    hasPhoto: payload.claimChecklist.hasPhoto,
  });

  if (!existing) {
    patients.push(payload);
  }

  refreshPatientMetrics(payload);
  return clone(payload);
}

export function cancelPatientRegistration(patientId: number, reason: string) {
  const patient = patients.find((item) => item.id === patientId);
  if (!patient) throw new Error("Patient not found");
  patient.careStatus = "cancelled";
  patient.cancellationReason = reason.trim() || "ยกเลิกการลงทะเบียน";
  patient.nextVisitAt = undefined;
  return clone(patient);
}

export function updatePatientRecord(
  patientId: number,
  patch: Partial<
    Pick<
      PalliativePatient,
      "nextVisitAt" | "phone" | "relativePhone" | "lineId" | "notes"
    >
  > & { assignedUnitId?: string },
) {
  const patient = patients.find((item) => item.id === patientId);
  if (!patient) throw new Error("Patient not found");

  if (patch.assignedUnitId) {
    const unit = serviceUnits.find((item) => item.id === patch.assignedUnitId);
    if (!unit) throw new Error("Unit not found");
    patient.assignedUnitId = unit.id;
    patient.assignedUnitName = unit.name;
    patient.assignedUnitKind = unit.kind;
  }

  if (patch.nextVisitAt) {
    const window = patient.nextVisitAt
      ? patient.visitWindow
      : buildVisitWindow(patch.nextVisitAt);
    patient.nextVisitAt = patch.nextVisitAt;
    patient.visitWindow = window;
  }

  patient.phone = patch.phone ?? patient.phone;
  patient.relativePhone = patch.relativePhone ?? patient.relativePhone;
  patient.lineId = patch.lineId ?? patient.lineId;
  patient.notes = patch.notes ?? patient.notes;
  refreshPatientMetrics(patient);
  return clone(patient);
}

function buildStoredPhotos(
  patientId: number,
  visitId: number,
  photos: Array<{ url: string; fileName: string; caption?: string }>,
) {
  return photos.map<VisitPhoto>((photo, index) => ({
    id: `photo-${visitId}-${index + 1}`,
    visitId,
    url: photo.url,
    fileName: photo.fileName,
    caption: photo.caption,
    capturedAt: nowIso(),
  }));
}

export function addVisitRecord(
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
  const patient = patients.find((item) => item.id === patientId);
  if (!patient) throw new Error("Patient not found");
  validateVisitSubmission({
    visitDate: input.visitDate,
    authenCode: input.authenCode,
    symptoms: input.symptoms,
    photosCount: input.photos.length,
  });

  const normalizedChecklist = normalizeVisitChecklist(input.checklist, {
    hasPhoto: input.photos.length > 0,
    hasSymptoms: Boolean(input.symptoms.trim()),
  });

  const visitId = nextVisitId++;
  const visit: PalliativeVisit = {
    id: visitId,
    patientId,
    unitId: input.unitId,
    visitDate: input.visitDate,
    scheduledDate: patient.nextVisitAt ?? input.visitDate,
    rescheduledFrom:
      patient.nextVisitAt && patient.nextVisitAt !== input.visitDate
        ? patient.nextVisitAt
        : undefined,
    status: "completed",
    visitorUserId: input.visitorUserId,
    visitorName: input.visitorName,
    authenCode: input.authenCode?.trim(),
    symptoms: input.symptoms.trim(),
    note: input.note.trim(),
    checklist: normalizedChecklist,
    clinical: input.clinical,
    photos: buildStoredPhotos(patientId, visitId, input.photos),
    createdAt: nowIso(),
  };

  visits.unshift(visit);
  patient.lastVisitAt = input.visitDate;
  patient.serviceMonthCount += 1;
  patient.nextVisitAt = undefined;
  patient.claimChecklist.hasAuthentication = Boolean(input.authenCode);
  patient.claimChecklist.hasHomeVisitReport = true;
  patient.claimChecklist.hasPhoto = input.photos.length > 0;
  patient.claimChecklist.readyForClaim = Boolean(
    patient.claimChecklist.diagZ515 &&
    patient.claimChecklist.diagZ718 &&
    patient.claimChecklist.adp30001 &&
    patient.claimChecklist.eva001 &&
    patient.claimChecklist.cons01 &&
    patient.claimChecklist.hasAuthentication &&
    patient.claimChecklist.hasHomeVisitReport,
  );
  patient.careStatus = patient.serviceMonthCount >= 6 ? "completed" : "active";
  return clone(visit);
}

export function updateVisitRecord(
  visitId: number,
  input: {
    actorUserId: string;
    visitDate: string;
    authenCode?: string;
    symptoms: string;
    note: string;
    checklist: VisitChecklist;
    clinical?: VisitClinicalAssessment;
    photos?: Array<{ url: string; fileName: string; caption?: string }>;
  },
) {
  const actor = users.find((item) => item.id === input.actorUserId);
  const visit = visits.find((item) => item.id === visitId);
  if (!actor || !visit) throw new Error("ไม่พบข้อมูลการเยี่ยมหรือผู้ใช้งาน");
  const canEditAll =
    actor.role === "hospital_admin" || actor.role === "hospital_case_manager";
  if (!canEditAll && actor.unitId !== visit.unitId) {
    throw new Error("แก้ไขได้เฉพาะข้อมูลของหน่วยตัวเอง");
  }
  const patient = patients.find((item) => item.id === visit.patientId);
  if (!patient) throw new Error("Patient not found");
  const addedPhotos = buildStoredPhotos(
    visit.patientId,
    visit.id,
    input.photos ?? [],
  ).map((photo, index) => ({
    ...photo,
    id: `photo-${visit.id}-${visit.photos.length + index + 1}`,
  }));
  const nextPhotos = [...visit.photos, ...addedPhotos];

  validateVisitSubmission({
    visitDate: input.visitDate,
    authenCode: input.authenCode,
    symptoms: input.symptoms,
    photosCount: nextPhotos.length,
  });

  visit.visitDate = input.visitDate;
  visit.authenCode = input.authenCode?.trim();
  visit.symptoms = input.symptoms.trim();
  visit.note = input.note.trim();
  visit.photos = nextPhotos;
  visit.checklist = normalizeVisitChecklist(input.checklist, {
    hasPhoto: nextPhotos.length > 0,
    hasSymptoms: Boolean(input.symptoms.trim()),
  });
  visit.clinical = input.clinical;

  const patient = patients.find((item) => item.id === visit.patientId);
  if (patient) refreshPatientMetrics(patient);
  return clone(visit);
}

export function updateVisitAdvanceCarePlanRecord(
  visitId: number,
  input: {
    actorUserId: string;
    form: AdvanceCarePlanForm;
    fileName: string;
    url: string;
  },
) {
  const actor = users.find((item) => item.id === input.actorUserId);
  const visit = visits.find((item) => item.id === visitId);
  if (!actor || !visit) throw new Error("ไม่พบข้อมูลการเยี่ยมหรือผู้ใช้งาน");
  const canEditAll =
    actor.role === "hospital_admin" || actor.role === "hospital_case_manager";
  if (!canEditAll && actor.unitId !== visit.unitId) {
    throw new Error("บันทึก ACP/LW ได้เฉพาะข้อมูลของหน่วยตัวเอง");
  }
  const document: AdvanceCarePlanDocument = {
    id: `acp-${visitId}-${Date.now()}`,
    fileName: input.fileName,
    url: input.url,
    createdAt: nowIso(),
    createdByUserId: actor.id,
    createdByName: actor.displayName,
    form: input.form,
  };
  visit.advanceCarePlan = document;
  return { ok: true, document: clone(document) };
}

export function addCommentRecord(
  patientId: number,
  input: {
    userId: string;
    body: string;
    audience: "hospital" | "unit" | "all";
  },
) {
  const user = users.find((item) => item.id === input.userId);
  const patient = patients.find((item) => item.id === patientId);
  if (!user || !patient) throw new Error("Patient or user not found");
  const comment: PatientComment = {
    id: `comment-${comments.length + 1}`,
    patientId,
    unitId: user.unitId,
    authorUserId: user.id,
    authorName: user.displayName,
    audience: input.audience,
    body: input.body.trim(),
    createdAt: nowIso(),
  };
  comments.unshift(comment);
  refreshPatientMetrics(patient);
  return clone(comment);
}

function summarizeAllocations(rows: StmRow[], percent: number) {
  const unitMap = new Map<string, { totalAmount: number; rowCount: number }>();
  rows.forEach((row) => {
    const current = unitMap.get(row.unitId) ?? { totalAmount: 0, rowCount: 0 };
    current.totalAmount += row.amount;
    current.rowCount += 1;
    unitMap.set(row.unitId, current);
  });

  return [...unitMap.entries()].map(([unitId, summary]) => ({
    unitId,
    unitName: serviceUnits.find((item) => item.id === unitId)?.name ?? unitId,
    percent,
    totalAmount: summary.totalAmount,
    allocatedAmount: Math.round((summary.totalAmount * percent) / 100),
    rowCount: summary.rowCount,
  }));
}

export function importStmBatch(input: {
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
  const user = users.find((item) => item.id === input.importedByUserId);
  if (!user) throw new Error("User not found");
  const batchId = `stm-${Date.now()}`;
  const rows: StmRow[] = input.rows.map((row, index) => ({
    id: `${batchId}-${index + 1}`,
    batchId,
    hn: row.hn,
    patientName: row.patientName,
    amount: row.amount,
    unitId: row.unitId,
    claimMonth: row.claimMonth,
    note: row.note,
  }));

  const batch: StmBatch = {
    id: batchId,
    fileName: input.fileName,
    importedAt: nowIso(),
    importedByUserId: user.id,
    importedByName: user.displayName,
    defaultSplitPercent: input.defaultSplitPercent,
    rows,
    allocations: summarizeAllocations(rows, input.defaultSplitPercent),
  };
  stmBatches.unshift(batch);
  return clone(batch);
}
