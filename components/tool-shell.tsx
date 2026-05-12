import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import type { Tool } from "@/lib/tools";

export function ToolShell({
  tool,
  children,
}: {
  tool: Tool;
  children: React.ReactNode;
}) {
  const Icon = tool.icon;
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        All tools
      </Link>
      <div className="mb-6 flex items-start gap-4">
        <span
          className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ring-1 ${tool.accent}`}
        >
          <Icon className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{tool.name}</h1>
          <p className="mt-1 text-muted-foreground">{tool.description}</p>
        </div>
      </div>
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
        {children}
      </div>
    </div>
  );
}
