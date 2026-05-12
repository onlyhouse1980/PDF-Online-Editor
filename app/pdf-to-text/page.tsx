import { getTool } from "@/lib/tools";
import { ToolShell } from "@/components/tool-shell";
import { PdfToTextTool } from "./client";

export default function Page() {
  const tool = getTool("pdf-to-text")!;
  return (
    <ToolShell tool={tool}>
      <PdfToTextTool />
    </ToolShell>
  );
}
