# Palliative Case Rules

## Insurance

- Candidate case selection uses `pttype.hipdata_code`.
- Only `UCS` and `WEL` are allowed for case entry.

## Diagnosis

- `Z51.5` and `Z71.8` must be treated as a paired requirement.
- Use the wording "และ" in user-facing text, not "หรือ".

## Visit History

- The selected patient visit panel should fetch `GET /api/candidates/history?hn=...` when showing HOSXP visit details.
- Display both `diagCodes` and `opitems` from that history response for the selected patient.
