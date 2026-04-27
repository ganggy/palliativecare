# Palliative Case Rules

## Insurance

- Candidate case selection uses `pttype.hipdata_code`.
- Only `UCS` and `WEL` are allowed for case entry.

## Diagnosis

- `Z51.5` and `Z71.8` must be treated as a paired requirement.
- Use the wording "และ" in user-facing text, not "หรือ".
- Candidate diagnosis groups must keep `F03` dementia and `K74` cirrhosis aligned across TypeScript rules and HOSXP SQL regex.
- Do not treat `R65` or `Z21` as current SCG 2569 palliative eligibility shortcuts; review them against the SCG 2569 coding update knowledge file.

## Visit History

- The selected patient visit panel should fetch `GET /api/candidates/history?hn=...` when showing HOSXP visit details.
- Display both `diagCodes` and `opitems` from that history response for the selected patient.
