import { getTool } from "@/lib/tools";
import { ToolShell } from "@/components/tool-shell";
import { RotateTool } from "./client";

export default function Page() {
  const tool = getTool("rotate")!;
  return (
    <ToolShell tool={tool}>
      <RotateTool />
    </ToolShell>
  );
}
