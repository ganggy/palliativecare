import { CaseManagerRegistryWorkspace } from "@/components/case-manager-registry-workspace";
import { getAppSnapshot } from "@/lib/data-service";

export default async function CaseManagerInProgressPage() {
  const snapshot = await getAppSnapshot();
  return (
    <CaseManagerRegistryWorkspace
      initialSnapshot={snapshot}
      defaultStatusFilter="in_progress"
      pageMode="in_progress"
    />
  );
}
