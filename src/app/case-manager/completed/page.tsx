import { CaseManagerRegistryWorkspace } from "@/components/case-manager-registry-workspace";
import { getAppSnapshot } from "@/lib/data-service";

export default async function CaseManagerCompletedPage() {
  const snapshot = await getAppSnapshot();
  return (
    <CaseManagerRegistryWorkspace
      initialSnapshot={snapshot}
      defaultStatusFilter="completed"
      pageMode="completed"
    />
  );
}
