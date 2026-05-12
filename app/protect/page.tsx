import { getTool } from "@/lib/tools";
import { ToolShell } from "@/components/tool-shell";
import { ProtectTool } from "./client";

export default function Page() {
  const tool = getTool("protect")!;
  return (
    <ToolShell tool={tool}>
      <ProtectTool />
    </ToolShell>
  );
}
