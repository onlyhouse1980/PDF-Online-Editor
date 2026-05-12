import { getTool } from "@/lib/tools";
import { ToolShell } from "@/components/tool-shell";
import { JpgToPdfTool } from "./client";

export default function Page() {
  const tool = getTool("jpg-to-pdf")!;
  return (
    <ToolShell tool={tool}>
      <JpgToPdfTool />
    </ToolShell>
  );
}
