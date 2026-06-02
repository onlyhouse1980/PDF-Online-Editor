import { getTool } from "@/lib/tools";
import { ToolShell } from "@/components/tool-shell";
import { PdfWorkspace } from "@/components/pdf-workspace";

export default function Page() {
  const tool = getTool("edit")!;
  return (
    <ToolShell tool={tool}>
      <PdfWorkspace defaultTool="add-text" hint="Pick a PDF to edit." />
    </ToolShell>
  );
}
