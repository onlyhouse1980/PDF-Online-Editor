export function Footer() {
  return (
    <footer className="mt-auto border-t border-border bg-white">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:px-6 lg:px-8">
        <div>© {new Date().getFullYear()} PDFKit. All processing happens in your browser.</div>
        <div className="flex items-center gap-4">
          <span>Private by default</span>
          <span>·</span>
          <span>No uploads to servers</span>
        </div>
      </div>
    </footer>
  );
}
