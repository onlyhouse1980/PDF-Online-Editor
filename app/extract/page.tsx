import { getTool } from "@/lib/tools";
import { ToolShell } from "@/components/tool-shell";
import { ExtractTool } from "./client";

export default function Page() {
  const tool = getTool("extract")!;
  return (
    <ToolShell tool={tool}>
      <ExtractTool />
    </ToolShell>
  );
}
