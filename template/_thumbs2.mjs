import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import path from "path";
import fs from "fs";

const root = "E:\\video-shotcraft";
const thumbDir = path.join(root, "director", "thumbs");
fs.mkdirSync(thumbDir, { recursive: true });

const tax = JSON.parse(fs.readFileSync(path.join(root, "director", "taxonomy.json"), "utf-8"));
const allCards = [...new Set(Object.values(tax.levels.L3).flat())].sort();
console.log("Total " + allCards.length + " templates");

const chrome = "C:\\Users\\Administrator\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe";

async function main() {
  console.log("Bundling...");
  const bundled = await bundle({
    entryPoint: path.join(root, "template", "src", "index.ts"),
    webpackOverride: (c) => c,
  });
  let done = 0, fail = 0;
  for (const card of allCards) {
    const out = path.join(thumbDir, card.replace(/\//g, "__") + ".png");
    if (fs.existsSync(out) && fs.statSync(out).size > 10000) { done++; continue; }
    const props = {
      shots: [{ shotCard: card, text: "Preview", durationInFrames: 90,
        pit: { subject: "remotion", content: { type: "text" }, position: "element" } }],
      theme: { bg: "#0d0f14", text: "#e8e6e1", accent: "#d4a853" },
      audio: "",
    };
    try {
      const comp = await selectComposition({ serveUrl: bundled, id: "DynamicVideo", inputProps: props, browserExecutable: chrome });
      await renderStill({ composition: comp, output: out, frame: 45, inputProps: props, browserExecutable: chrome });
      done++; console.log("OK " + card);
    } catch (e) { fail++; console.log("FAIL " + card + ": " + e.message.slice(0, 100)); }
  }
  console.log("Done: " + done + " ok, " + fail + " fail");
}
main().catch(console.error);
