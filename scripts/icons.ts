// Renders assets/icon.svg into the PNG sizes the manifest and iOS ask for.
// Run with: node --import tsx scripts/icons.ts
import { readFileSync } from "node:fs";
import sharp from "sharp";

const svg = readFileSync("assets/icon.svg");
const out: [string, number][] = [
  ["public/icon-192.png", 192],
  ["public/icon-512.png", 512],
  ["src/app/apple-icon.png", 180],
];

async function main() {
  for (const [path, size] of out) {
    await sharp(svg, { density: 300 }).resize(size, size).png().toFile(path);
    console.log(path, size);
  }
}

main();
