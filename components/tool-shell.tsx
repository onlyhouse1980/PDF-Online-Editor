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
    <div className="mx-auto w-full max-w-6xl px-3 py-4 sm:px-6 sm:py-8 lg:px-8">
      <Link
        href="/"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground sm:mb-6"
      >
        <ChevronLeft className="h-4 w-4" />
        All tools
      </Link>
      <div className="mb-4 flex items-start gap-3 sm:mb-6 sm:gap-4">
        <span
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ring-1 sm:h-12 sm:w-12 ${tool.accent}`}
        >
          <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
        </span>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight sm:text-3xl">{tool.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">{tool.description}</p>
        </div>
      </div>
      <div className="rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-6">
        {children}
      </div>
    </div>
  );
}
