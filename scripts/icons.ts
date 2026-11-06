// Renders the logo into every icon the browser, the manifest and iOS ask for: the app icon PNGs from
// assets/icon.svg, and the tab icons (favicon.ico and icon.svg) from the bare mark in assets/logo-mark.svg.
// Run with: node --import tsx scripts/icons.ts
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const icon = readFileSync("assets/icon.svg");
const mark = readFileSync("assets/logo-mark.svg");
const out: [string, number][] = [
  ["public/icon-192.png", 192],
  ["public/icon-512.png", 512],
  ["src/app/apple-icon.png", 180],
];
const clear = { r: 0, g: 0, b: 0, alpha: 0 };

// An .ico is a small directory of images; since Windows Vista each entry may simply be a PNG.
function ico(pngs: { size: number; data: Buffer }[]) {
  const head = Buffer.alloc(6 + 16 * pngs.length);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(pngs.length, 4);
  let offset = head.length;
  pngs.forEach(({ size, data }, i) => {
    const at = 6 + 16 * i;
    head.writeUInt8(size % 256, at);
    head.writeUInt8(size % 256, at + 1);
    head.writeUInt16LE(1, at + 4);
    head.writeUInt16LE(32, at + 6);
    head.writeUInt32LE(data.length, at + 8);
    head.writeUInt32LE(offset, at + 12);
    offset += data.length;
  });
  return Buffer.concat([head, ...pngs.map((p) => p.data)]);
}

async function main() {
  for (const [path, size] of out) {
    await sharp(icon, { density: 300 }).resize(size, size).png().toFile(path);
    console.log(path, size);
  }
  const tab = await Promise.all(
    [16, 32, 48].map(async (size) => ({ size, data: await sharp(mark, { density: 1200 }).resize(size, size, { fit: "contain", background: clear }).png().toBuffer() })),
  );
  writeFileSync("src/app/favicon.ico", ico(tab));
  copyFileSync("assets/logo-mark.svg", "src/app/icon.svg");
  console.log("src/app/favicon.ico 16 32 48, src/app/icon.svg");
}

main();
