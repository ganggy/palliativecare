import { CaseManagerCandidateWorkspace } from "@/components/case-manager-candidate-workspace";
import { getAppSnapshot } from "@/lib/data-service";

export default async function CaseManagerPage() {
  const snapshot = await getAppSnapshot();
  return <CaseManagerCandidateWorkspace initialSnapshot={snapshot} />;
}
