import { getTool } from "@/lib/tools";
import { ToolShell } from "@/components/tool-shell";
import { UnlockTool } from "./client";

export default function Page() {
  const tool = getTool("unlock")!;
  return (
    <ToolShell tool={tool}>
      <UnlockTool />
    </ToolShell>
  );
}
