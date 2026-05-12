import { getTool } from "@/lib/tools";
import { ToolShell } from "@/components/tool-shell";
import { DeletePagesTool } from "./client";

export default function Page() {
  const tool = getTool("delete-pages")!;
  return (
    <ToolShell tool={tool}>
      <DeletePagesTool />
    </ToolShell>
  );
}
