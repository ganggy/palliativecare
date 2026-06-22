import { PalliativeWorkspace } from "@/components/palliative-workspace";
import { getAppSnapshot } from "@/lib/data-service";
import { connection } from "next/server";

export default async function UnitOverviewPage() {
  await connection();
  const snapshot = await getAppSnapshot();
  return <PalliativeWorkspace initialSnapshot={snapshot} preferredRole="unit_manager" />;
}
