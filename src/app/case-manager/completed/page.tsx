import { CaseManagerRegistryWorkspace } from "@/components/case-manager-registry-workspace";
import { getAppSnapshot } from "@/lib/data-service";
import { connection } from "next/server";

export default async function CaseManagerCompletedPage() {
  await connection();
  const snapshot = await getAppSnapshot();
  return (
    <CaseManagerRegistryWorkspace
      initialSnapshot={snapshot}
      defaultStatusFilter="completed"
      pageMode="completed"
    />
  );
}
