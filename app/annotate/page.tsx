import { getTool } from "@/lib/tools";
import { ToolShell } from "@/components/tool-shell";
import { PdfEditor } from "@/components/pdf-editor";

export default function Page() {
  const tool = getTool("annotate")!;
  return (
    <ToolShell tool={tool}>
      <PdfEditor defaultTool="highlight" />
    </ToolShell>
  );
}
