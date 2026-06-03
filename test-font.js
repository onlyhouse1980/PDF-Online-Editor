async function run() {
  const family = "Permanent Marker";
  const id = family.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  const url = `https://gwfh.mranftl.com/api/fonts/${id}`;
  const res = await fetch(url);
  const data = await res.json();
  const rules = [];
  if (Array.isArray(data.variants)) {
    for (const v of data.variants) {
      if (v.ttf) {
        const isItalic = v.id.includes("italic");
        const isBold = v.id.includes("700") || v.id.includes("bold");
        rules.push({ style: isItalic ? "italic" : "normal", weight: isBold ? 700 : 400, url: v.ttf });
      }
    }
  }
  console.log("RULES:", rules);
}
run();
