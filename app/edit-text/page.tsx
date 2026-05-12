import { getTool } from "@/lib/tools";
import { ToolShell } from "@/components/tool-shell";
import { EditTextTool } from "./client";

export default function Page() {
  const tool = getTool("edit-text")!;
  return (
    <ToolShell tool={tool}>
      <EditTextTool />
    </ToolShell>
  );
}
