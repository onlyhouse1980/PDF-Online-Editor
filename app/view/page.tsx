import { getTool } from "@/lib/tools";
import { ToolShell } from "@/components/tool-shell";
import { ViewerTool } from "./client";

export default function Page() {
  const tool = getTool("view")!;
  return (
    <ToolShell tool={tool}>
      <ViewerTool />
    </ToolShell>
  );
}
