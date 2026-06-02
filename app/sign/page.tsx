import { getTool } from "@/lib/tools";
import { ToolShell } from "@/components/tool-shell";
import { PdfWorkspace } from "@/components/pdf-workspace";

export default function Page() {
  const tool = getTool("sign")!;
  return (
    <ToolShell tool={tool}>
      <PdfWorkspace defaultTool="signature" hint="Pick a PDF to sign." />
    </ToolShell>
  );
}
