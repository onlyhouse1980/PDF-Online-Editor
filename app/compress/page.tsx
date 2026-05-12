import { getTool } from "@/lib/tools";
import { ToolShell } from "@/components/tool-shell";
import { CompressTool } from "./client";

export default function Page() {
  const tool = getTool("compress")!;
  return (
    <ToolShell tool={tool}>
      <CompressTool />
    </ToolShell>
  );
}
