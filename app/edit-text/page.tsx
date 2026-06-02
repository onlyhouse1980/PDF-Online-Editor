import { getTool } from "@/lib/tools";
import { ToolShell } from "@/components/tool-shell";
import { PdfWorkspace } from "@/components/pdf-workspace";

export default function Page() {
  const tool = getTool("edit-text")!;
  return (
    <ToolShell tool={tool}>
      <PdfWorkspace
        defaultTool="edit-text"
        hint="Works best on PDFs with selectable text (not scanned images)."
      />
    </ToolShell>
  );
}
