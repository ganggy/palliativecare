import { PalliativeWorkspace } from "@/components/palliative-workspace";
import { getAppSnapshot } from "@/lib/data-service";

export default async function ExecutivePage() {
  const snapshot = await getAppSnapshot();
  return <PalliativeWorkspace initialSnapshot={snapshot} />;
}
