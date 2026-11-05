"use client";
// The wall behind everything: a night sky laid down in short brush dabs, with a faint moon and a dark
// horizon. Seeded, so it's the same painting on every visit; redrawn only when the window changes size.
import { useEffect, useRef } from "react";

// mulberry32: small, fast and good enough for placing brush marks.
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Indigo to violet, as [hue, saturation, lightness].
const SKY: [number, number, number][] = [
  [244, 42, 14],
  [248, 38, 18],
  [252, 34, 22],
  [238, 46, 16],
  [262, 30, 20],
  [232, 40, 24],
];

function paint(canvas: HTMLCanvasElement) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const rand = seeded(1106);

  const base = ctx.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, "#0f0b24");
  base.addColorStop(0.55, "#151034");
  base.addColorStop(1, "#0b091a");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);

  const moon = { x: w * 0.74, y: Math.min(h * 0.13, 130) };
  const glow = ctx.createRadialGradient(moon.x, moon.y, 0, moon.x, moon.y, Math.max(w, h) * 0.5);
  glow.addColorStop(0, "rgba(110, 102, 180, 0.14)");
  glow.addColorStop(1, "rgba(120, 112, 190, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  // Two passes, like underpainting then brushwork: broad washes first, then smaller dabs.
  // Strokes lie mostly sideways, as a sky is painted, with a slow wobble so neighbours agree.
  const area = w * h;
  const layers = [
    { count: Math.round(area / 2600), len: [40, 110], thick: [22, 48], alpha: [0.05, 0.11], spread: 5 },
    { count: Math.min(7000, Math.round(area / 220)), len: [14, 38], thick: [9, 20], alpha: [0.07, 0.19], spread: 4 },
  ];
  for (const layer of layers) {
    for (let i = 0; i < layer.count; i++) {
      const x = rand() * w;
      const y = rand() * h;
      const angle = Math.sin(y / 95 + x / 400) * 0.22 + (rand() - 0.5) * 0.35;
      const near = Math.hypot(x - moon.x, y - moon.y) / Math.max(w, h);
      const [hue, sat, light] = SKY[Math.floor(rand() * SKY.length)];
      const lift = Math.max(0, 0.3 - near) * 16; // a little lighter around the moon
      const sink = y > h * 0.84 ? -6 : 0; // a darker horizon
      const len = layer.len[0] + rand() * (layer.len[1] - layer.len[0]);
      const thick = layer.thick[0] + rand() * (layer.thick[1] - layer.thick[0]);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.globalAlpha = layer.alpha[0] + rand() * (layer.alpha[1] - layer.alpha[0]);
      ctx.fillStyle = `hsl(${hue + (rand() - 0.5) * 8} ${sat}% ${Math.max(5, light + lift + sink + (rand() - 0.5) * layer.spread)}%)`;
      ctx.beginPath();
      ctx.roundRect(-len / 2, -thick / 2, len, thick, thick / 5);
      ctx.fill();
      ctx.restore();
    }
  }

  // The moon: a faint smudge of pale dabs, never a hard disc.
  for (let i = 0; i < 60; i++) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * 30;
    ctx.globalAlpha = 0.025 + rand() * 0.045;
    ctx.fillStyle = `hsl(${245 + rand() * 15} 22% ${54 + rand() * 12}%)`;
    ctx.beginPath();
    ctx.ellipse(moon.x + Math.cos(a) * r, moon.y + Math.sin(a) * r, 12 + rand() * 12, 8 + rand() * 8, rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function PaintedSky() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    paint(canvas);
    let pending: ReturnType<typeof setTimeout> | undefined;
    let last = window.innerWidth;
    const onResize = () => {
      // Phones resize the viewport while scrolling; only a real width change repaints.
      if (window.innerWidth === last) return;
      last = window.innerWidth;
      clearTimeout(pending);
      pending = setTimeout(() => paint(canvas), 150);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      clearTimeout(pending);
    };
  }, []);
  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 -z-10 h-full w-full" />;
}
