import { HosxpPatientSearchWorkspace } from "@/components/hosxp-patient-search-workspace";
import { getAppSnapshot } from "@/lib/data-service";
import { connection } from "next/server";

export default async function CaseManagerHosxpSearchPage() {
  await connection();
  const snapshot = await getAppSnapshot();
  return <HosxpPatientSearchWorkspace initialSnapshot={snapshot} />;
}
