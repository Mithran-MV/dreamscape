// Renders the logo into every icon the browser, the manifest and iOS ask for: the app icon PNGs from
// assets/icon.svg, and the tab icons (favicon.ico and icon.svg) from the bare mark in assets/logo-mark.svg.
// Also the Android app's launcher icons (mobile/android), at each screen density.
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
const res = "mobile/android/app/src/main/res";
// Android density buckets: the legacy icon is 48dp, an adaptive icon's foreground layer 108dp.
const densities: [string, number][] = [["mdpi", 1], ["hdpi", 1.5], ["xhdpi", 2], ["xxhdpi", 3], ["xxxhdpi", 4]];
const circle = (size: number) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}"/></svg>`);

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

  for (const [bucket, scale] of densities) {
    const legacy = Math.round(48 * scale);
    const layer = Math.round(108 * scale);
    // The mark stays inside the adaptive icon's 66dp safe circle, whatever shape the launcher cuts.
    const mark56 = Math.round(layer * 0.56);
    const square = await sharp(icon, { density: 300 }).resize(legacy, legacy).png().toBuffer();
    await sharp(square).toFile(`${res}/mipmap-${bucket}/ic_launcher.png`);
    await sharp(square).composite([{ input: circle(legacy), blend: "dest-in" }]).png().toFile(`${res}/mipmap-${bucket}/ic_launcher_round.png`);
    const glyph = await sharp(mark, { density: 1200 }).resize(mark56, mark56, { fit: "contain", background: clear }).png().toBuffer();
    await sharp({ create: { width: layer, height: layer, channels: 4, background: clear } })
      .composite([{ input: glyph, gravity: "center" }])
      .png()
      .toFile(`${res}/mipmap-${bucket}/ic_launcher_foreground.png`);
    console.log(`${res}/mipmap-${bucket}`, legacy, layer);
  }
}

main();
