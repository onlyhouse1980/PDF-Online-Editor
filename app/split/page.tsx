import { getTool } from "@/lib/tools";
import { ToolShell } from "@/components/tool-shell";
import { SplitTool } from "./client";

export default function Page() {
  const tool = getTool("split")!;
  return (
    <ToolShell tool={tool}>
      <SplitTool />
    </ToolShell>
  );
}
