import Link from "next/link";
import { FileText } from "lucide-react";

export function Header() {
  return (
    <header className="sticky top-0 z-30 w-full border-b border-border bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-2 px-3 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground">
            <FileText className="h-4 w-4" />
          </span>
          <span className="text-base tracking-tight">PDFKit</span>
          <span className="ml-1 hidden text-xs font-normal text-muted-foreground sm:inline">
            Online PDF Suite
          </span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link
            href="/#tools"
            className="rounded-md px-2.5 py-1.5 text-foreground/80 hover:bg-muted hover:text-foreground sm:px-3"
          >
            All Tools
          </Link>
          <Link
            href="/merge"
            className="hidden rounded-md bg-primary px-3 py-1.5 text-primary-foreground hover:bg-primary/90 sm:inline-block"
          >
            Get Started
          </Link>
        </nav>
      </div>
    </header>
  );
}
