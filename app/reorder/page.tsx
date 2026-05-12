import { getTool } from "@/lib/tools";
import { ToolShell } from "@/components/tool-shell";
import { ReorderTool } from "./client";

export default function Page() {
  const tool = getTool("reorder")!;
  return (
    <ToolShell tool={tool}>
      <ReorderTool />
    </ToolShell>
  );
}
