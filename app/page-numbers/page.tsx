import { getTool } from "@/lib/tools";
import { ToolShell } from "@/components/tool-shell";
import { PageNumbersTool } from "./client";

export default function Page() {
  const tool = getTool("page-numbers")!;
  return (
    <ToolShell tool={tool}>
      <PageNumbersTool />
    </ToolShell>
  );
}
