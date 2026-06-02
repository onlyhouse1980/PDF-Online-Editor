"use client";

export type FontCategory = "sans" | "serif" | "mono" | "display" | "handwriting";

export interface FontPreset {
  name: string; // display name and exec value
  family: string; // CSS font-family value
  google?: string; // Google Fonts URL fragment (e.g. "Roboto:wght@400;700")
  category: FontCategory;
}

export const FONT_PRESETS: FontPreset[] = [
  // System / web-safe
  { name: "Helvetica", family: '"Helvetica Neue", Helvetica, Arial, sans-serif', category: "sans" },
  { name: "Arial", family: "Arial, sans-serif", category: "sans" },
  { name: "Verdana", family: "Verdana, Geneva, sans-serif", category: "sans" },
  { name: "Tahoma", family: "Tahoma, Geneva, sans-serif", category: "sans" },
  { name: "Trebuchet MS", family: '"Trebuchet MS", sans-serif', category: "sans" },
  { name: "Times New Roman", family: '"Times New Roman", Times, serif', category: "serif" },
  { name: "Georgia", family: "Georgia, serif", category: "serif" },
  { name: "Garamond", family: "Garamond, serif", category: "serif" },
  { name: "Palatino", family: '"Palatino Linotype", "Book Antiqua", Palatino, serif', category: "serif" },
  { name: "Courier New", family: '"Courier New", Courier, monospace', category: "mono" },

  // Google sans-serif
  { name: "Roboto", family: "Roboto, sans-serif", google: "Roboto:wght@400;700", category: "sans" },
  { name: "Open Sans", family: '"Open Sans", sans-serif', google: "Open+Sans:wght@400;700", category: "sans" },
  { name: "Lato", family: "Lato, sans-serif", google: "Lato:wght@400;700", category: "sans" },
  { name: "Montserrat", family: "Montserrat, sans-serif", google: "Montserrat:wght@400;700", category: "sans" },
  { name: "Raleway", family: "Raleway, sans-serif", google: "Raleway:wght@400;700", category: "sans" },
  { name: "Poppins", family: "Poppins, sans-serif", google: "Poppins:wght@400;700", category: "sans" },
  { name: "Nunito", family: "Nunito, sans-serif", google: "Nunito:wght@400;700", category: "sans" },
  { name: "PT Sans", family: '"PT Sans", sans-serif', google: "PT+Sans:wght@400;700", category: "sans" },
  { name: "Ubuntu", family: "Ubuntu, sans-serif", google: "Ubuntu:wght@400;700", category: "sans" },
  { name: "Inter", family: "Inter, sans-serif", google: "Inter:wght@400;700", category: "sans" },
  { name: "Work Sans", family: '"Work Sans", sans-serif', google: "Work+Sans:wght@400;700", category: "sans" },
  { name: "DM Sans", family: '"DM Sans", sans-serif', google: "DM+Sans:wght@400;700", category: "sans" },
  { name: "Source Sans 3", family: '"Source Sans 3", sans-serif', google: "Source+Sans+3:wght@400;700", category: "sans" },
  { name: "Karla", family: "Karla, sans-serif", google: "Karla:wght@400;700", category: "sans" },
  { name: "Quicksand", family: "Quicksand, sans-serif", google: "Quicksand:wght@400;700", category: "sans" },

  // Google serif
  { name: "Playfair Display", family: '"Playfair Display", serif', google: "Playfair+Display:wght@400;700", category: "serif" },
  { name: "Merriweather", family: "Merriweather, serif", google: "Merriweather:wght@400;700", category: "serif" },
  { name: "Lora", family: "Lora, serif", google: "Lora:wght@400;700", category: "serif" },
  { name: "Crimson Text", family: '"Crimson Text", serif', google: "Crimson+Text:wght@400;700", category: "serif" },
  { name: "PT Serif", family: '"PT Serif", serif', google: "PT+Serif:wght@400;700", category: "serif" },
  { name: "EB Garamond", family: '"EB Garamond", serif', google: "EB+Garamond:wght@400;700", category: "serif" },
  { name: "Cormorant Garamond", family: '"Cormorant Garamond", serif', google: "Cormorant+Garamond:wght@400;700", category: "serif" },
  { name: "Libre Baskerville", family: '"Libre Baskerville", serif', google: "Libre+Baskerville:wght@400;700", category: "serif" },

  // Google mono
  { name: "Roboto Mono", family: '"Roboto Mono", monospace', google: "Roboto+Mono:wght@400;700", category: "mono" },
  { name: "Fira Code", family: '"Fira Code", monospace', google: "Fira+Code:wght@400;700", category: "mono" },
  { name: "JetBrains Mono", family: '"JetBrains Mono", monospace', google: "JetBrains+Mono:wght@400;700", category: "mono" },
  { name: "Source Code Pro", family: '"Source Code Pro", monospace', google: "Source+Code+Pro:wght@400;700", category: "mono" },
  { name: "IBM Plex Mono", family: '"IBM Plex Mono", monospace', google: "IBM+Plex+Mono:wght@400;700", category: "mono" },

  // Display
  { name: "Bebas Neue", family: '"Bebas Neue", sans-serif', google: "Bebas+Neue", category: "display" },
  { name: "Oswald", family: "Oswald, sans-serif", google: "Oswald:wght@400;700", category: "display" },
  { name: "Anton", family: "Anton, sans-serif", google: "Anton", category: "display" },
  { name: "Archivo Black", family: '"Archivo Black", sans-serif', google: "Archivo+Black", category: "display" },
  { name: "Righteous", family: "Righteous, sans-serif", google: "Righteous", category: "display" },

  // Handwriting / script
  { name: "Pacifico", family: "Pacifico, cursive", google: "Pacifico", category: "handwriting" },
  { name: "Dancing Script", family: '"Dancing Script", cursive', google: "Dancing+Script:wght@400;700", category: "handwriting" },
  { name: "Caveat", family: "Caveat, cursive", google: "Caveat:wght@400;700", category: "handwriting" },
  { name: "Permanent Marker", family: '"Permanent Marker", cursive', google: "Permanent+Marker", category: "handwriting" },
  { name: "Indie Flower", family: '"Indie Flower", cursive', google: "Indie+Flower", category: "handwriting" },
  { name: "Shadows Into Light", family: '"Shadows Into Light", cursive', google: "Shadows+Into+Light", category: "handwriting" },
  { name: "Great Vibes", family: '"Great Vibes", cursive', google: "Great+Vibes", category: "handwriting" },
];

export const CATEGORY_LABEL: Record<FontCategory, string> = {
  sans: "Sans serif",
  serif: "Serif",
  mono: "Monospace",
  display: "Display",
  handwriting: "Handwriting",
};

export function buildGoogleFontsHref(): string {
  const families = FONT_PRESETS.filter((f) => f.google).map((f) => `family=${f.google}`);
  if (!families.length) return "";
  return `https://fonts.googleapis.com/css2?${families.join("&")}&display=swap`;
}

export function findPresetByName(name: string): FontPreset | undefined {
  return FONT_PRESETS.find((p) => p.name.toLowerCase() === name.toLowerCase());
}

export function findPresetByFamily(family: string): FontPreset | undefined {
  const cleaned = family
    .split(",")[0]
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .toLowerCase();
  return FONT_PRESETS.find((p) => p.name.toLowerCase() === cleaned);
}
