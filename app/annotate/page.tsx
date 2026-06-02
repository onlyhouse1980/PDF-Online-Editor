import { getTool } from "@/lib/tools";
import { ToolShell } from "@/components/tool-shell";
import { PdfWorkspace } from "@/components/pdf-workspace";

export default function Page() {
  const tool = getTool("annotate")!;
  return (
    <ToolShell tool={tool}>
      <PdfWorkspace defaultTool="highlight" hint="Pick a PDF to annotate." />
    </ToolShell>
  );
}
