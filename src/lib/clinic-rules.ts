import type { ClinicRule, ServiceUnit } from "./types";
import { buildPalliativeDiagnosisExistsSql } from "./rules";

export const serviceUnits: ServiceUnit[] = [
  {
    id: "hospital-core",
    code: "HOS",
    shortName: "โรงพยาบาล",
    name: "โรงพยาบาลแม่ข่าย",
    kind: "hospital",
    color: "#6be2d3",
    description: "กำหนดเคส, ตรวจความพร้อมเบิก, ติดตามคุณภาพข้อมูล และดูภาพรวมทั้งเครือข่าย",
  },
  {
    id: "pcu-hospital",
    code: "PCU",
    shortName: "PCU โรงพยาบาล",
    name: "หน่วย PCU โรงพยาบาล",
    kind: "pcu",
    color: "#f3bd6a",
    description: "ดูแลเคสในเขตรับผิดชอบของโรงพยาบาลและเยี่ยมบ้านตามแผน",
  },
  {
    id: "huey-hib",
    code: "HHB",
    shortName: "ห้วยหีบ",
    name: "รพ.สต.ห้วยหีบ",
    kind: "rphst",
    color: "#74c69d",
    description: "ดูแลเคสในพื้นที่ห้วยหีบและบันทึกเยี่ยมพร้อมรูปภาพ",
  },
  {
    id: "muang-khai",
    code: "MKH",
    shortName: "ม่วงไข",
    name: "รพ.สต.ม่วงไข",
    kind: "rphst",
    color: "#4ea8de",
    description: "ดูแลเคสในพื้นที่ม่วงไข",
  },
  {
    id: "phon-thong",
    code: "PTW",
    shortName: "โพนทองวัฒนา",
    name: "รพ.สต.โพนทองวัฒนา",
    kind: "rphst",
    color: "#ff9f1c",
    description: "ดูแลเคสในพื้นที่โพนทองวัฒนา",
  },
  {
    id: "ban-lao",
    code: "BLP",
    shortName: "บ้านเหล่าโพนค้อ",
    name: "รพ.สต.บ้านเหล่าโพนค้อ",
    kind: "rphst",
    color: "#ef476f",
    description: "ดูแลเคสในพื้นที่บ้านเหล่าโพนค้อ",
  },
  {
    id: "khok-na-dee",
    code: "KND",
    shortName: "โคกนาดี",
    name: "รพ.สต.โคกนาดี",
    kind: "rphst",
    color: "#c77dff",
    description: "ดูแลเคสในพื้นที่โคกนาดี",
  },
];

export const clinicRules: ClinicRule[] = [
  {
    unitId: "huey-hib",
    clinicName: "รพ.สต.ห้วยหีบ",
    shortName: "ห้วยหีบ",
    unitKind: "rphst",
    chwpart: "47",
    amppart: "15",
    tmbpartInclude: ["01", "1"],
    moopartInclude: ["3", "03", "6", "06", "11", "12", "17", "18"],
    excludeDeath: true,
  },
  {
    unitId: "muang-khai",
    clinicName: "รพ.สต.ม่วงไข",
    shortName: "ม่วงไข",
    unitKind: "rphst",
    chwpart: "47",
    amppart: "15",
    tmbpartInclude: ["03", "3"],
  },
  {
    unitId: "phon-thong",
    clinicName: "รพ.สต.โพนทองวัฒนา",
    shortName: "โพนทองวัฒนา",
    unitKind: "rphst",
    chwpart: "47",
    amppart: "15",
    tmbpartInclude: ["04", "4"],
    moopartInclude: ["1", "01", "4", "04", "5", "05", "9", "09", "10", "11", "12"],
    excludeDeath: true,
  },
  {
    unitId: "ban-lao",
    clinicName: "รพ.สต.บ้านเหล่าโพนค้อ",
    shortName: "บ้านเหล่าโพนค้อ",
    unitKind: "rphst",
    chwpart: "47",
    amppart: "15",
    tmbpartInclude: ["02", "2"],
  },
  {
    unitId: "khok-na-dee",
    clinicName: "รพ.สต.โคกนาดี",
    shortName: "โคกนาดี",
    unitKind: "rphst",
    chwpart: "47",
    amppart: "15",
    tmbpartInclude: ["04", "4"],
    moopartExclude: ["1", "01", "4", "04", "5", "05", "9", "09", "10", "11", "12"],
    excludeDeath: true,
  },
  {
    unitId: "pcu-hospital",
    clinicName: "PCU โรงพยาบาล",
    shortName: "pcu",
    unitKind: "pcu",
    chwpart: "47",
    amppart: "15",
    tmbpartInclude: ["01", "1"],
    moopartInclude: ["01", "1", "02", "2", "04", "4", "05", "5", "07", "7", "08", "8", "09", "9", "10", "13", "14", "15", "16"],
    excludeDeath: true,
  },
];

const patientUnitOverrides: Record<string, string> = {
  "000029230": "pcu-hospital",
  "000032660": "pcu-hospital",
};

export function getPatientUnitOverride(hn?: string): ServiceUnit | undefined {
  const unitId = patientUnitOverrides[String(hn ?? "").trim()];
  if (!unitId) return undefined;
  return serviceUnits.find((unit) => unit.id === unitId);
}

function normalizeAreaPart(value?: unknown): string {
  return String(value ?? "").trim().replace(/^0+(\d)$/, "$1");
}

function includesAreaPart(values: string[], value?: unknown): boolean {
  const raw = String(value ?? "").trim();
  const normalized = normalizeAreaPart(value);
  return values.includes(raw) || values.includes(normalized);
}

export function getServiceUnitByPatientArea(input: {
  chwpart?: unknown;
  amppart?: unknown;
  tmbpart?: unknown;
  moopart?: unknown;
} | undefined): ServiceUnit | undefined {
  if (!input) return undefined;
  const rule = clinicRules.find((item) => {
    if (normalizeAreaPart(input.chwpart) !== normalizeAreaPart(item.chwpart)) {
      return false;
    }
    if (normalizeAreaPart(input.amppart) !== normalizeAreaPart(item.amppart)) {
      return false;
    }
    if (!includesAreaPart(item.tmbpartInclude, input.tmbpart)) {
      return false;
    }
    if (
      item.moopartInclude?.length &&
      !includesAreaPart(item.moopartInclude, input.moopart)
    ) {
      return false;
    }
    if (
      item.moopartExclude?.length &&
      includesAreaPart(item.moopartExclude, input.moopart)
    ) {
      return false;
    }
    return true;
  });

  return rule ? serviceUnits.find((unit) => unit.id === rule.unitId) : undefined;
}

function quoteList(values: string[]): string {
  return values.map((value) => `"${value}"`).join(", ");
}

export function buildClinicWhereClause(rule: ClinicRule, areaAlias = "p", _visitAreaAlias = "va", deathAlias = "p"): string {
  const fragments = [
    `${areaAlias}.chwpart = "${rule.chwpart}"`,
    `${areaAlias}.amppart = "${rule.amppart}"`,
    `${areaAlias}.tmbpart IN (${quoteList(rule.tmbpartInclude)})`,
  ];

  if (rule.moopartInclude?.length) {
    fragments.push(`COALESCE(${areaAlias}.moopart, '') IN (${quoteList(rule.moopartInclude)})`);
  }

  if (rule.moopartExclude?.length) {
    fragments.push(`COALESCE(${areaAlias}.moopart, '') NOT IN (${quoteList(rule.moopartExclude)})`);
  }

  if (rule.excludeDeath) {
    fragments.push(`COALESCE(${deathAlias}.death, "N") <> "Y"`);
  }

  return fragments.join(" AND ");
}

function requiredCodeSql(vnExpr: string, adpCode: string) {
  return `EXISTS (
    SELECT 1
    FROM opitemrece op
    LEFT JOIN drugitems di ON di.icode = op.icode
    LEFT JOIN s_drugitems sdi ON sdi.icode = op.icode
    WHERE op.vn = ${vnExpr}
      AND UPPER(COALESCE(di.nhso_adp_code, sdi.nhso_adp_code, op.icode, '')) = '${adpCode}'
  )`;
}

function buildEverDiagnosisByHnSql(hnExpr: string, diagCode: string): string {
  return `EXISTS (
    SELECT 1
    FROM ovst o3
    INNER JOIN ovstdiag d3 ON d3.vn = o3.vn
    WHERE o3.hn = ${hnExpr}
      AND UPPER(REPLACE(d3.icd10, '.', '')) = '${diagCode}'
  )`;
}

export function buildCandidateSql(rule: ClinicRule, visitDate = "?"): string {
  return `
SELECT
  o.hn,
  p.cid,
  CONCAT(p.pname, p.fname, '  ', p.lname) AS fullname,
  TIMESTAMPDIFF(YEAR, p.birthday, ${visitDate}) AS age,
  p.birthday AS birthday,
  p.sex,
  '${rule.unitId}' AS unitId,
  '${rule.clinicName}' AS clinicName,
  '${rule.shortName}' AS clinicShortName,
  COALESCE(pt.hipdata_code, '') AS pttype,
  COALESCE(
    (
      SELECT SUBSTRING_INDEX(
        GROUP_CONCAT(DISTINCT UPPER(REPLACE(d.icd10, '.', '')) ORDER BY d.diagtype, d.icd10 SEPARATOR ','),
        ',',
        1
      )
      FROM ovstdiag d
      WHERE d.vn = o.vn
        AND UPPER(REPLACE(d.icd10, '.', '')) REGEXP '^(B2[0-4]|C|D[0-4]|F03|I5|I6|J44|K704|K717|K72|K74|N185|Z515|Z718)'
    ),
    COALESCE(vs.pdx, '')
  ) AS pdx,
  COALESCE(
    (
      SELECT SUBSTRING_INDEX(
        GROUP_CONCAT(DISTINCT UPPER(REPLACE(d.icd10, '.', '')) ORDER BY d.diagtype, d.icd10 SEPARATOR ','),
        ',',
        1
      )
      FROM ovstdiag d
      WHERE d.vn = o.vn
        AND UPPER(REPLACE(d.icd10, '.', '')) REGEXP '^(B2[0-4]|C|D[0-4]|F03|I5|I6|J44|K704|K717|K72|K74|N185|Z515|Z718)'
    ),
    COALESCE(vs.pdx, '')
  ) AS primaryDxName,
  IF(p.mobile_phone_number IS NOT NULL, p.mobile_phone_number, IF(p.hometel IS NOT NULL, p.hometel, p.informtel)) AS TelNo,
  CONCAT(p.addrpart, ' ม. ', p.moopart, ' ต. ', t3.name) AS full_address,
  0 AS serviceCount,
  0 AS incompleteVisitCount,
  o.vstdate AS lastServiceAt,
  ${buildEverDiagnosisByHnSql("o.hn", "Z515")} AS diagZ515,
  ${buildEverDiagnosisByHnSql("o.hn", "Z718")} AS diagZ718,
  ${requiredCodeSql("o.vn", "30001")} AS adp30001,
  ${requiredCodeSql("o.vn", "EVA001")} AS eva001,
  ${requiredCodeSql("o.vn", "CONS01")} AS cons01
FROM ovst o
  INNER JOIN vn_stat vs ON vs.vn = o.vn
  LEFT JOIN pttype pt ON pt.pttype = vs.pttype
  LEFT JOIN patient p ON p.hn = o.hn
  LEFT JOIN thaiaddress va ON va.addressid = vs.aid
  LEFT JOIN thaiaddress t3
    ON t3.chwpart = p.chwpart
   AND t3.amppart = p.amppart
   AND t3.tmbpart = p.tmbpart
WHERE o.vstdate = ${visitDate}
  AND ${buildClinicWhereClause(rule)}
  AND ${buildPalliativeDiagnosisExistsSql("o.vn")}
GROUP BY o.hn
ORDER BY o.hn, o.vn`;
}

export function buildCandidateAliveSql(rule: ClinicRule): string {
  return `
SELECT
  o.hn,
  p.cid,
  CONCAT(p.pname, p.fname, '  ', p.lname) AS fullname,
  TIMESTAMPDIFF(YEAR, p.birthday, CURDATE()) AS age,
  p.birthday AS birthday,
  p.sex,
  '${rule.unitId}' AS unitId,
  '${rule.clinicName}' AS clinicName,
  '${rule.shortName}' AS clinicShortName,
  COALESCE(pt.hipdata_code, '') AS pttype,
  COALESCE(
    (
      SELECT SUBSTRING_INDEX(
        GROUP_CONCAT(DISTINCT UPPER(REPLACE(d.icd10, '.', '')) ORDER BY d.diagtype, d.icd10 SEPARATOR ','),
        ',',
        1
      )
      FROM ovstdiag d
      WHERE d.vn = o.vn
        AND UPPER(REPLACE(d.icd10, '.', '')) REGEXP '^(B2[0-4]|C|D[0-4]|I5|I6|J44|K704|K717|K72|N185|Z515|Z718)'
    ),
    COALESCE(vs.pdx, '')
  ) AS pdx,
  COALESCE(
    (
      SELECT SUBSTRING_INDEX(
        GROUP_CONCAT(DISTINCT UPPER(REPLACE(d.icd10, '.', '')) ORDER BY d.diagtype, d.icd10 SEPARATOR ','),
        ',',
        1
      )
      FROM ovstdiag d
      WHERE d.vn = o.vn
        AND UPPER(REPLACE(d.icd10, '.', '')) REGEXP '^(B2[0-4]|C|D[0-4]|I5|I6|J44|K704|K717|K72|N185|Z515|Z718)'
    ),
    COALESCE(vs.pdx, '')
  ) AS primaryDxName,
  IF(p.mobile_phone_number IS NOT NULL, p.mobile_phone_number, IF(p.hometel IS NOT NULL, p.hometel, p.informtel)) AS TelNo,
  CONCAT(p.addrpart, ' ม. ', p.moopart, ' ต. ', t3.name) AS full_address,
  0 AS serviceCount,
  0 AS incompleteVisitCount,
  o.vstdate AS lastServiceAt,
  ${buildEverDiagnosisByHnSql("o.hn", "Z515")} AS diagZ515,
  ${buildEverDiagnosisByHnSql("o.hn", "Z718")} AS diagZ718,
  ${requiredCodeSql("o.vn", "30001")} AS adp30001,
  ${requiredCodeSql("o.vn", "EVA001")} AS eva001,
  ${requiredCodeSql("o.vn", "CONS01")} AS cons01,
  o.vstdate AS visitDate
FROM (
  SELECT
    o1.hn,
    SUBSTRING_INDEX(
      GROUP_CONCAT(o1.vn ORDER BY o1.vstdate DESC, o1.vn DESC SEPARATOR ','),
      ',',
      1
    ) AS latestVn
  FROM ovst o1
    INNER JOIN vn_stat vs1 ON vs1.vn = o1.vn
    LEFT JOIN patient p1 ON p1.hn = o1.hn
    LEFT JOIN thaiaddress va1 ON va1.addressid = vs1.aid
  WHERE COALESCE(p1.death, 'N') <> 'Y'
    AND o1.vstdate >= DATE_SUB(CURDATE(), INTERVAL 365 DAY)
    AND ${buildClinicWhereClause(rule, "p1", "va1", "p1")}
    AND ${buildPalliativeDiagnosisExistsSql("o1.vn")}
  GROUP BY o1.hn
) latest
  INNER JOIN ovst o ON o.vn = latest.latestVn
  INNER JOIN vn_stat vs ON vs.vn = o.vn
  LEFT JOIN pttype pt ON pt.pttype = vs.pttype
  LEFT JOIN patient p ON p.hn = o.hn
  LEFT JOIN thaiaddress va ON va.addressid = vs.aid
  LEFT JOIN thaiaddress t3
    ON t3.chwpart = p.chwpart
   AND t3.amppart = p.amppart
   AND t3.tmbpart = p.tmbpart
ORDER BY o.hn, o.vn`;
}

export function buildCandidateByHnSql(rule: ClinicRule, hn = "?"): string {
  return buildCandidateSql(rule, "CURDATE()").replace("WHERE o.vstdate = CURDATE()", `WHERE o.hn = ${hn}`) + "\nLIMIT 1";
}
