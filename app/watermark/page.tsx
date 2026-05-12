import { getTool } from "@/lib/tools";
import { ToolShell } from "@/components/tool-shell";
import { WatermarkTool } from "./client";

export default function Page() {
  const tool = getTool("watermark")!;
  return (
    <ToolShell tool={tool}>
      <WatermarkTool />
    </ToolShell>
  );
}
