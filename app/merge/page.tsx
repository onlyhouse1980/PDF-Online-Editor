import { getTool } from "@/lib/tools";
import { ToolShell } from "@/components/tool-shell";
import { MergeTool } from "./client";

export default function Page() {
  const tool = getTool("merge")!;
  return (
    <ToolShell tool={tool}>
      <MergeTool />
    </ToolShell>
  );
}
