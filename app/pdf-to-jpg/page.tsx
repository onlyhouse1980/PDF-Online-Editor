import { getTool } from "@/lib/tools";
import { ToolShell } from "@/components/tool-shell";
import { PdfToJpgTool } from "./client";

export default function Page() {
  const tool = getTool("pdf-to-jpg")!;
  return (
    <ToolShell tool={tool}>
      <PdfToJpgTool />
    </ToolShell>
  );
}
