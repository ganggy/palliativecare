import { HosxpPatientSearchWorkspace } from "@/components/hosxp-patient-search-workspace";
import { getAppSnapshot } from "@/lib/data-service";

export default async function CaseManagerHosxpSearchPage() {
  const snapshot = await getAppSnapshot();
  return <HosxpPatientSearchWorkspace initialSnapshot={snapshot} />;
}

