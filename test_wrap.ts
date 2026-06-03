import { layoutRichRuns, WrapZone, RichRun } from "./lib/rich-text";

const runs: RichRun[] = [{
  text: "This is a very long text that should definitely wrap around the image that is placed in the center of the block. If it doesn't wrap, then there is a bug.",
  bold: false,
  italic: false,
  underlined: false,
  strikethrough: false,
  color: {r:0,g:0,b:0},
  fontSizeRatio: 1
}];

const resolveFont = (r: any) => ({ widthOfTextAtSize: (t: string, s: number) => t.length * (s/2) } as any);

const wrapZones: WrapZone[] = [{
  x: 60,
  y: 0,
  w: 20,
  h: 40,
  mode: "square"
}];

const layout = layoutRichRuns(runs, 100, 10, 12, resolveFont, wrapZones);

for (const line of layout.lines) {
  const t = line.segments.map(s => s.text).join("");
  console.log(`Line offset: ${line.offsetX}, Text: ${t}`);
}
