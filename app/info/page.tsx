import { getTool } from "@/lib/tools";
import { ToolShell } from "@/components/tool-shell";
import { InfoTool } from "./client";

export default function Page() {
  const tool = getTool("info")!;
  return (
    <ToolShell tool={tool}>
      <InfoTool />
    </ToolShell>
  );
}
