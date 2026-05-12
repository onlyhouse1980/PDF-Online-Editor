import { getTool } from "@/lib/tools";
import { ToolShell } from "@/components/tool-shell";
import { CropTool } from "./client";

export default function Page() {
  const tool = getTool("crop")!;
  return (
    <ToolShell tool={tool}>
      <CropTool />
    </ToolShell>
  );
}
