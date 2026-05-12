import Link from "next/link";
import { CATEGORIES, TOOLS } from "@/lib/tools";

export default function Home() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
      <section className="py-16 sm:py-24 text-center">
        <h1 className="mx-auto max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">
          Every PDF tool you need,{" "}
          <span className="text-primary">in your browser.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
          Merge, split, edit, sign, convert, compress, and protect PDFs. Everything runs locally on
          your device — your files never leave your browser.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/merge"
            className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Try Merge PDF
          </Link>
          <Link
            href="#tools"
            className="rounded-md border border-border bg-white px-5 py-2.5 text-sm font-medium hover:bg-muted"
          >
            Browse all tools
          </Link>
        </div>
      </section>

      <section id="tools" className="pb-20">
        {CATEGORIES.map((cat) => {
          const items = TOOLS.filter((t) => t.category === cat);
          if (!items.length) return null;
          return (
            <div key={cat} className="mb-10">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {cat}
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {items.map((tool) => {
                  const Icon = tool.icon;
                  return (
                    <Link
                      key={tool.slug}
                      href={`/${tool.slug}`}
                      className="group flex items-start gap-3 rounded-xl border border-border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                    >
                      <span
                        className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg ring-1 ${tool.accent}`}
                      >
                        <Icon className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
                        <div className="font-medium leading-snug group-hover:text-primary">
                          {tool.name}
                        </div>
                        <div className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                          {tool.description}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
