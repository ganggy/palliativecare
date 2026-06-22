import { CaseManagerCandidateWorkspace } from "@/components/case-manager-candidate-workspace";
import { getAppSnapshot } from "@/lib/data-service";
import { connection } from "next/server";

export default async function CaseManagerPage() {
  await connection();
  const snapshot = await getAppSnapshot();
  return <CaseManagerCandidateWorkspace initialSnapshot={snapshot} />;
}
