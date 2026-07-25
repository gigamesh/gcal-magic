"use client";

import { useEffect, useRef, useState } from "react";

// Event hues grouped into color families — the classic Google Calendar palette
// plus vivid/teal/cyan additions to cover the wheel. Families can be toggled on
// and off from the control panel, and each enabled hue is expanded into several
// shades so nearest-color matching has both a wide range of hues and tonal depth
// to hit — keeping the calendar close to the video.
const FAMILIES: { name: string; hues: string[] }[] = [
  { name: "Reds", hues: ["#D50000", "#F83A22", "#E67C73", "#D06B64", "#F691B2"] },
  { name: "Oranges", hues: ["#F4511E", "#FF7537", "#FFAD46"] },
  { name: "Yellows", hues: ["#F6BF26", "#FAD165", "#FBE983"] },
  { name: "Greens", hues: ["#33B679", "#0B8043", "#16A765", "#42D692", "#7BD148", "#B3DC6C"] },
  { name: "Teals", hues: ["#00897B", "#009688", "#4DD0E1", "#9FE1E7"] },
  { name: "Blues", hues: ["#039BE5", "#4986E7", "#3F51B5", "#7986CB"] },
  { name: "Purples", hues: ["#8E24AA", "#A47AE2", "#CD74E6"] },
  { name: "Neutrals", hues: ["#AC725E", "#616161", "#C2C2C2"] },
];

type PaletteColor = { hex: string; r: number; g: number; b: number; text: string };

const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

function makeColor(r: number, g: number, b: number): PaletteColor {
  r = clamp255(r);
  g = clamp255(g);
  b = clamp255(b);
  const hex = "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
  // Dark event colors read best with white text; light ones with dark text.
  const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return { hex, r, g, b, text: luma > 0.6 ? "#3c4043" : "#fff" };
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  const d = max - min;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

// Spread of blend amounts across `count` shades (negative darkens toward black,
// positive lightens toward white), biased by lightness in [-0.5, 0.5].
function shadeAmounts(count: number, lightnessBias: number): number[] {
  if (count <= 1) return [Math.max(-0.85, Math.min(0.85, lightnessBias))];
  const spread = 0.44;
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const t = -spread + 2 * spread * (i / (count - 1));
    out.push(Math.max(-0.85, Math.min(0.85, t + lightnessBias)));
  }
  return out;
}

// Build the working palette from the current event-color controls.
function buildPalette(
  enabled: Record<string, boolean>,
  shadeCount: number,
  hueShift: number,
  lightnessBias: number,
): PaletteColor[] {
  const amounts = shadeAmounts(shadeCount, lightnessBias);
  const out: PaletteColor[] = [];
  for (const fam of FAMILIES) {
    if (!enabled[fam.name]) continue;
    for (const hex of fam.hues) {
      let r = parseInt(hex.slice(1, 3), 16);
      let g = parseInt(hex.slice(3, 5), 16);
      let b = parseInt(hex.slice(5, 7), 16);
      if (hueShift !== 0) {
        const [h, s, l] = rgbToHsl(r, g, b);
        [r, g, b] = hslToRgb((h + hueShift + 360) % 360, s, l);
      }
      for (const a of amounts) {
        const t = Math.abs(a);
        const target = a < 0 ? 0 : 255;
        out.push(makeColor(r + (target - r) * t, g + (target - g) * t, b + (target - b) * t));
      }
    }
  }
  return out;
}

const ALL_FAMILIES_ON: Record<string, boolean> = Object.fromEntries(
  FAMILIES.map((f) => [f.name, true]),
);

// Lowest resolution: one full-width event per day column, every one titled.
const MIN_RES = 4;

const TITLES = [
  "Quick sync (90 min)",
  "Sync about the sync",
  "Pre-meeting meeting",
  "Optional (mandatory)",
  "Circle back",
  "Touch base",
  "Deep work",
  "Focus time (no focus)",
  "Align on alignment",
  "Urgent non-urgent",
  "Retro of the retro",
  "Standup (sitting down)",
  "Take this offline",
  "Vibes check",
  "1:1 with myself",
  "Mandatory fun",
  "Brainstorm (no ideas)",
  "Quick question (1h)",
  "Final final v2",
  "Definitely last sync",
  "OOO (still online)",
  "PTO (checking email)",
  "Happy hour (on Zoom)",
  "All-hands, no answers",
  "Synergy sync",
  "Break sync",
  "Weekly (it's daily)",
  "Table this",
  "Loop in stakeholders",
  "Reply-all thread",
  "Lunch & learn (no food)",
  "Realign north star",
  "Parking lot",
  "Ideate & iterate",
  "Soft launch (it's hard)",
  "Q3 planning in Q4",
  "Book time to book time",
  "Low-key high-stakes",
  "Brief 2-hour chat",
  "Post-mortem (it's fine)",
];
const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type Source = "demo" | "video" | "cam";

interface DayCell {
  dow: string;
  num: number;
  today: boolean;
}

function nearestIdx(palette: PaletteColor[], r: number, g: number, b: number) {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const p = palette[i];
    const d = (p.r - r) ** 2 + (p.g - g) ** 2 + (p.b - b) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

// Push an event color toward gray (sf<1) or over-saturate it (sf>1) around its
// own luminance, for the event color control.
function satColor(color: PaletteColor, sf: number) {
  const gray = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
  const r = clamp255(gray + (color.r - gray) * sf);
  const g = clamp255(gray + (color.g - gray) * sf);
  const b = clamp255(gray + (color.b - gray) * sf);
  return `rgb(${r},${g},${b})`;
}

// Weighted target height (in rows) for a vertical merge, from a hash in [0,1).
// Most events stay short, but 3- and 4-row blocks show up often enough to vary
// the shapes. It's only a ceiling — a merge still stops early if the rows below
// aren't an identical color.
function targetRows(h: number) {
  if (h < 0.45) return 1;
  if (h < 0.7) return 2;
  if (h < 0.88) return 3;
  return 4;
}

// Stable pseudo-random in [0,1) from a grid position, so probabilistic merges
// stay put across frames instead of flickering.
function hash2(a: number, b: number) {
  let h = (Math.imul(a, 73856093) ^ Math.imul(b, 19349663)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

// True when row `yb` holds exactly color `idx` across [x0,x1) with the same left
// and right boundaries — i.e. an identical rectangle span, safe to merge upward.
// A day boundary (every `perDay` columns) counts as a hard edge, so a merge is
// allowed to butt against it even if the neighbouring day shares the color.
function runMatches(
  ci: Int16Array,
  cols: number,
  perDay: number,
  yb: number,
  x0: number,
  x1: number,
  idx: number,
) {
  const base = yb * cols;
  if (x0 % perDay !== 0 && ci[base + x0 - 1] === idx) return false;
  if (x1 % perDay !== 0 && ci[base + x1] === idx) return false;
  for (let x = x0; x < x1; x++) if (ci[base + x] !== idx) return false;
  return true;
}

export default function CalendarRenderer() {
  // UI state
  const [days, setDays] = useState<DayCell[]>([]);
  const [monthLabel, setMonthLabel] = useState("");
  const [logoDay, setLogoDay] = useState<number | null>(null);
  const [hourLabels, setHourLabels] = useState<{ top: number; text: string }[]>([]);
  const [subCols, setSubCols] = useState(10);
  const [threshold, setThreshold] = useState(12);
  const [focus, setFocus] = useState(50);
  const [updatePeriod, setUpdatePeriod] = useState(0);
  const [invert, setInvert] = useState(false);
  const [brightness, setBrightness] = useState(100);
  const [inSat, setInSat] = useState(100);
  const [evSat, setEvSat] = useState(100);
  const [evOpacity, setEvOpacity] = useState(100);
  const [families, setFamilies] = useState<Record<string, boolean>>(ALL_FAMILIES_ON);
  const [shadeCount, setShadeCount] = useState(5);
  const [hueShift, setHueShift] = useState(0);
  const [lightness, setLightness] = useState(0);
  const [showLabels, setShowLabels] = useState(true);
  const [playing, setPlaying] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(true);
  const [sections, setSections] = useState<Record<string, boolean>>({
    source: true,
    layout: true,
    footage: false,
    events: true,
  });

  // Refs for the render loop (mutable, read every frame)
  const subColsRef = useRef(subCols);
  const thresholdRef = useRef(threshold / 100);
  const focusRef = useRef(focus / 100);
  const updatePeriodRef = useRef(updatePeriod);
  const invertRef = useRef(invert);
  const brightnessRef = useRef(brightness / 100);
  const inSatRef = useRef(inSat / 100);
  const evSatRef = useRef(evSat / 100);
  const evOpacityRef = useRef(evOpacity / 100);
  const paletteRef = useRef<PaletteColor[]>(buildPalette(ALL_FAMILIES_ON, 5, 0, 0));
  const showLabelsRef = useRef(showLabels);
  const playingRef = useRef(playing);
  const sourceRef = useRef<Source>("demo");

  // DOM refs
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLCanvasElement>(null);
  const hlinesRef = useRef<HTMLCanvasElement>(null);
  const vidRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const camStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => { subColsRef.current = subCols; }, [subCols]);
  useEffect(() => { thresholdRef.current = threshold / 100; }, [threshold]);
  useEffect(() => { focusRef.current = focus / 100; }, [focus]);
  useEffect(() => { updatePeriodRef.current = updatePeriod; }, [updatePeriod]);
  useEffect(() => { invertRef.current = invert; }, [invert]);
  useEffect(() => { brightnessRef.current = brightness / 100; }, [brightness]);
  useEffect(() => { inSatRef.current = inSat / 100; }, [inSat]);
  useEffect(() => { evSatRef.current = evSat / 100; }, [evSat]);
  useEffect(() => { evOpacityRef.current = evOpacity / 100; }, [evOpacity]);
  useEffect(() => {
    paletteRef.current = buildPalette(families, shadeCount, hueShift, lightness / 100);
  }, [families, shadeCount, hueShift, lightness]);
  useEffect(() => { showLabelsRef.current = showLabels; }, [showLabels]);
  useEffect(() => { playingRef.current = playing; }, [playing]);

  // Build week header on the client only (avoids SSR hydration mismatch on dates)
  useEffect(() => {
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay()); // back to Sunday
    const cells: DayCell[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      cells.push({
        dow: DOW[i],
        num: d.getDate(),
        today: d.toDateString() === now.toDateString(),
      });
    }
    setDays(cells);
    setMonthLabel(`${MONTHS[now.getMonth()]} ${now.getFullYear()}`);
    setLogoDay(now.getDate());
  }, []);

  // Layout: size canvases, draw hour lines, compute gutter labels
  useEffect(() => {
    function layout() {
      const wrap = wrapRef.current;
      const stage = stageRef.current;
      const hlines = hlinesRef.current;
      if (!wrap || !stage || !hlines) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = wrap.getBoundingClientRect();
      const W = r.width;
      const H = r.height;

      stage.width = W * dpr;
      stage.height = H * dpr;
      stage.style.width = `${W}px`;
      stage.style.height = `${H}px`;
      stage.getContext("2d")?.setTransform(dpr, 0, 0, dpr, 0, 0);

      hlines.width = W * dpr;
      hlines.height = H * dpr;
      hlines.style.width = `${W}px`;
      hlines.style.height = `${H}px`;
      const hctx = hlines.getContext("2d");
      if (hctx) {
        hctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        hctx.clearRect(0, 0, W, H);
        hctx.strokeStyle = "#eceef1";
        hctx.lineWidth = 1;
        const labels: { top: number; text: string }[] = [];
        const hourH = 60;
        let hour = 8; // first labeled hour: 8 AM
        for (let y = hourH; y < H; y += hourH) {
          hctx.beginPath();
          hctx.moveTo(0, y + 0.5);
          hctx.lineTo(W, y + 0.5);
          hctx.stroke();
          const h12 = ((hour - 1) % 12) + 1;
          labels.push({ top: y, text: `${h12} ${hour % 24 >= 12 ? "PM" : "AM"}` });
          hour++;
        }
        setHourLabels(labels);
      }
    }
    layout();
    window.addEventListener("resize", layout);
    return () => window.removeEventListener("resize", layout);
  }, []);

  // Render loop
  useEffect(() => {
    const stage = stageRef.current;
    const wrap = wrapRef.current;
    const vid = vidRef.current;
    if (!stage || !wrap || !vid) return;

    const ctx = stage.getContext("2d");
    if (!ctx) return;

    const off = document.createElement("canvas");
    const offCtx = off.getContext("2d", { willReadFrequently: true });
    if (!offCtx) return;

    // Demo source: bouncing "GO"
    const demo = document.createElement("canvas");
    demo.width = 320;
    demo.height = 180;
    const dctx = demo.getContext("2d")!;
    const pos = { x: 60, y: 90, vx: 2.2, vy: 1.6 };

    function drawDemo() {
      dctx.fillStyle = "#000";
      dctx.fillRect(0, 0, 320, 180);
      const t = performance.now() / 1000;
      pos.x += pos.vx;
      pos.y += pos.vy;
      if (pos.x < 50 || pos.x > 270) pos.vx *= -1;
      if (pos.y < 40 || pos.y > 140) pos.vy *= -1;
      const pulse = 1 + 0.18 * Math.sin(t * 6);
      dctx.save();
      dctx.translate(pos.x, pos.y);
      dctx.scale(pulse, pulse);
      dctx.fillStyle = `hsl(${(t * 60) % 360},80%,60%)`;
      dctx.font = "900 74px Arial";
      dctx.textAlign = "center";
      dctx.textBaseline = "middle";
      dctx.fillText("GO", 0, 0);
      dctx.restore();
    }

    let raf = 0;
    let lastDraw = -Infinity;

    function frame() {
      raf = requestAnimationFrame(frame);
      if (!playingRef.current) return;

      // Throttle how often the event grid recomputes/redraws. The video still
      // advances in the background; skipping just leaves the previous frame on
      // screen, so each set of events (and their titles) holds still long enough
      // to read before the next update. 0 = update every frame (full speed).
      const now = performance.now();
      const period = updatePeriodRef.current;
      if (period > 0 && now - lastDraw < period) return;
      lastDraw = now;

      if (sourceRef.current === "demo") drawDemo();

      const src =
        sourceRef.current === "demo"
          ? { el: demo as CanvasImageSource, w: 320, h: 180, ready: true }
          : {
              el: vid as CanvasImageSource,
              w: vid!.videoWidth,
              h: vid!.videoHeight,
              ready: vid!.readyState >= 2 && vid!.videoWidth > 0,
            };

      const W = stage!.clientWidth;
      const H = stage!.clientHeight;
      if (!src.ready || W === 0 || H === 0) {
        ctx!.clearRect(0, 0, W, H);
        return;
      }

      const atLowest = subColsRef.current <= MIN_RES;
      const perDay = atLowest ? 1 : subColsRef.current;
      const cols = 7 * perDay;
      const cellW = W / cols;
      const cellH = Math.max(7, Math.min(18, cellW * 0.8));
      const rows = Math.max(1, Math.floor(H / cellH));

      // Cover-crop the source into a cols x rows buffer. The crop matches the
      // aspect ratio the grid is actually drawn at (cols*cellW by rows*cellH),
      // so footage fills every day column without stretching. The overflowing
      // axis is cropped, positioned by the focal point: 0 = top/left edge,
      // 1 = bottom/right edge, 0.5 = centered.
      off.width = cols;
      off.height = rows;
      const gridAR = (cols * cellW) / (rows * cellH);
      const srcAR = src.w / src.h;
      const focus = focusRef.current;
      let sx: number, sy: number, sw: number, sh: number;
      if (srcAR > gridAR) {
        // Source is wider than the grid: keep full height, crop left/right.
        sh = src.h;
        sw = sh * gridAR;
        sx = (src.w - sw) * focus;
        sy = 0;
      } else {
        // Source is taller than the grid (e.g. vertical footage): keep full
        // width so every day column is covered, crop the top and bottom.
        sw = src.w;
        sh = sw / gridAR;
        sx = 0;
        sy = (src.h - sh) * focus;
      }
      offCtx!.drawImage(src.el, sx, sy, sw, sh, 0, 0, cols, rows);
      const data = offCtx!.getImageData(0, 0, cols, rows).data;

      ctx!.clearRect(0, 0, W, H);
      const gapX = atLowest ? 0 : Math.min(2, cellW * 0.15);
      const gapY = 1.5;
      const thr = thresholdRef.current;
      const invert = invertRef.current;
      const bright = brightnessRef.current;
      const inSat = inSatRef.current;
      const evSat = evSatRef.current;
      const evOp = evOpacityRef.current;
      const palette = paletteRef.current;
      ctx!.font = atLowest ? "500 11px Roboto, Arial" : "500 8px Roboto, Arial";
      ctx!.textBaseline = "top";

      // Classify every cell into a palette shade (or -1 = empty), keeping its
      // alpha and luminance for later. Footage color controls (invert,
      // brightness, saturation) are applied per cell before matching.
      const ci = new Int16Array(cols * rows);
      const al = new Float32Array(cols * rows);
      const lm = new Float32Array(cols * rows);
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const i = (y * cols + x) * 4;
          let r = data[i];
          let g = data[i + 1];
          let b = data[i + 2];
          if (invert) {
            r = 255 - r;
            g = 255 - g;
            b = 255 - b;
          }
          if (bright !== 1) {
            r *= bright;
            g *= bright;
            b *= bright;
          }
          if (inSat !== 1) {
            const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            r = gray + (r - gray) * inSat;
            g = gray + (g - gray) * inSat;
            b = gray + (b - gray) * inSat;
          }
          r = clamp255(r);
          g = clamp255(g);
          b = clamp255(b);
          const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
          const k = y * cols + x;
          if (lum < thr || palette.length === 0) {
            ci[k] = -1;
            continue;
          }
          ci[k] = nearestIdx(palette, r, g, b);
          al[k] = 0.35 + 0.65 * Math.min(1, (lum - thr) / (1 - thr || 1));
          lm[k] = lum;
        }
      }

      // Draw one event rectangle spanning cells [cx,cx+cw) x [cy,cy+ch).
      function drawEvent(
        cx: number,
        cy: number,
        cw: number,
        ch: number,
        color: PaletteColor,
        alpha: number,
        lumMax: number,
      ) {
        const px = cx * cellW + gapX / 2;
        const py = cy * cellH + gapY / 2;
        const w = cw * cellW - gapX;
        const h = ch * cellH - gapY;
        ctx!.globalAlpha = Math.min(1, alpha * evOp);
        ctx!.fillStyle = evSat === 1 ? color.hex : satColor(color, evSat);
        if (typeof ctx!.roundRect === "function") {
          ctx!.beginPath();
          ctx!.roundRect(px, py, w, h, 3);
          ctx!.fill();
        } else {
          ctx!.fillRect(px, py, w, h);
        }
        const titled =
          atLowest ||
          (showLabelsRef.current &&
            // Only title events that span the full width of their day.
            cw === perDay &&
            h >= 9 &&
            // Always title multi-row blocks; single cells stay sparse.
            (ch >= 2 || hash2(cx * 2 + 1, cy) < 0.16));
        if (titled) {
          const label = TITLES[(cx * 3 + cy * 7) % TITLES.length];
          // Scale the title to the event height so taller merged blocks read
          // more easily.
          const fontPx = Math.round(Math.max(atLowest ? 11 : 8, Math.min(22, h * 0.55)));
          ctx!.save();
          ctx!.beginPath();
          ctx!.rect(px, py, w, h);
          ctx!.clip();
          ctx!.font = `500 ${fontPx}px Roboto, Arial`;
          ctx!.globalAlpha = 0.95;
          ctx!.fillStyle = atLowest ? color.text : "#fff";
          const ty = py + Math.max(1, (h - fontPx) / 2);
          ctx!.fillText(label, px + 4, ty);
          ctx!.restore();
        }
      }

      // Merge same-color cells into larger events: first into horizontal runs
      // (so a single-color row fills its full width), then absorb matching runs
      // directly below — up to a weighted target of 1–4 rows — for taller,
      // varied blocks. Only genuinely identical cells merge, so video detail is
      // never lost.
      const consumed = new Uint8Array(cols * rows);
      for (let y = 0; y < rows; y++) {
        let x = 0;
        while (x < cols) {
          const k = y * cols + x;
          const idx = ci[k];
          if (idx < 0) {
            x++;
            continue;
          }
          // Extend the run within this row, but never across a day boundary so
          // an event can't span two days.
          let x1 = x + 1;
          while (x1 < cols && x1 % perDay !== 0 && ci[y * cols + x1] === idx) x1++;
          if (consumed[k]) {
            x = x1;
            continue;
          }

          let alphaSum = 0;
          let n = 0;
          let lumMax = 0;
          for (let xx = x; xx < x1; xx++) {
            const kk = y * cols + xx;
            alphaSum += al[kk];
            n++;
            if (lm[kk] > lumMax) lumMax = lm[kk];
          }

          const maxRows = targetRows(hash2(x + 1, y));
          let y1 = y + 1;
          while (
            y1 < rows &&
            y1 - y < maxRows &&
            runMatches(ci, cols, perDay, y1, x, x1, idx)
          ) {
            for (let xx = x; xx < x1; xx++) {
              const kk = y1 * cols + xx;
              alphaSum += al[kk];
              n++;
              consumed[kk] = 1;
              if (lm[kk] > lumMax) lumMax = lm[kk];
            }
            y1++;
          }

          drawEvent(x, y, x1 - x, y1 - y, palette[idx], alphaSum / n, lumMax);
          x = x1;
        }
      }
      ctx!.globalAlpha = 1;
    }

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Drag & drop
  useEffect(() => {
    const over = (e: DragEvent) => e.preventDefault();
    const drop = (e: DragEvent) => {
      e.preventDefault();
      const f = e.dataTransfer?.files?.[0];
      if (f && f.type.startsWith("video/")) loadFile(f);
    };
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopCam() {
    camStreamRef.current?.getTracks().forEach((t) => t.stop());
    camStreamRef.current = null;
  }

  function loadFile(f: File) {
    const vid = vidRef.current;
    if (!vid) return;
    stopCam();
    vid.srcObject = null;
    vid.src = URL.createObjectURL(f);
    vid.loop = true;
    vid.muted = true;
    vid.play().catch(() => {});
    sourceRef.current = "video";
    setPlaying(true);
  }

  async function useWebcam() {
    const vid = vidRef.current;
    if (!vid) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      camStreamRef.current = stream;
      vid.removeAttribute("src");
      vid.srcObject = stream;
      vid.play().catch(() => {});
      sourceRef.current = "cam";
      setPlaying(true);
    } catch (err) {
      alert(`Webcam unavailable: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  function useDemo() {
    stopCam();
    vidRef.current?.pause();
    sourceRef.current = "demo";
    setPlaying(true);
  }

  function togglePlay() {
    const next = !playing;
    setPlaying(next);
    if (sourceRef.current !== "demo") {
      const vid = vidRef.current;
      if (vid) {
        if (next) vid.play().catch(() => {});
        else vid.pause();
      }
    }
  }

  const toggleSection = (id: string) =>
    setSections((s) => ({ ...s, [id]: !s[id] }));
  const toggleFamily = (name: string) =>
    setFamilies((m) => ({ ...m, [name]: !m[name] }));

  function resetEventColors() {
    setFamilies(ALL_FAMILIES_ON);
    setShadeCount(5);
    setHueShift(0);
    setLightness(0);
    setEvSat(100);
    setEvOpacity(100);
  }

  return (
    <div className="shell">
      {/* App bar */}
      <div className="appbar">
        <button className="hamburger" aria-label="Main menu">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 6h18v2H3zM3 11h18v2H3zM3 16h18v2H3z" />
          </svg>
        </button>
        <div className="logo">
          <div className="cal-icon">
            <span>{logoDay ?? ""}</span>
          </div>
          <div className="name">Calendar</div>
        </div>
        <button className="today-btn">Today</button>
        <div className="nav-arrows">
          <button aria-label="Previous week">‹</button>
          <button aria-label="Next week">›</button>
        </div>
        <div className="month-label">{monthLabel}</div>
        <div className="spacer" />
        <button className="icon-btn" aria-label="Search">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L20.49 19zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14z" />
          </svg>
        </button>
        <button className="icon-btn" aria-label="Settings">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.14 12.94a7.5 7.5 0 0 0 0-1.88l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96a7.3 7.3 0 0 0-1.62-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96a.5.5 0 0 0-.61.22L2.65 8.84a.5.5 0 0 0 .12.64l2.03 1.58a7.5 7.5 0 0 0 0 1.88l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.13.23.4.32.61.22l2.39-.96c.49.38 1.03.7 1.62.94l.36 2.54c.04.24.25.42.5.42h3.84c.25 0 .46-.18.5-.42l.36-2.54a7.3 7.3 0 0 0 1.62-.94l2.39.96c.21.1.48.01.61-.22l1.92-3.32a.5.5 0 0 0-.12-.64zM12 15.5A3.5 3.5 0 1 1 15.5 12 3.5 3.5 0 0 1 12 15.5z" />
          </svg>
        </button>
        <div className="view-dd">
          Week <span style={{ fontSize: 10 }}>▾</span>
        </div>
        <button
          className={`avatar${menuOpen ? " active" : ""}`}
          onClick={() => setMenuOpen((o) => !o)}
          aria-label={menuOpen ? "Hide controls" : "Show controls"}
          aria-pressed={menuOpen}
          title="Toggle controls"
        >
          M
        </button>
      </div>

      {/* Day headers */}
      <div className="dayhead">
        <div className="gutter-head">GMT-07</div>
        {days.map((d) => (
          <div key={d.dow} className={`day${d.today ? " today" : ""}`}>
            <div className="dow">{d.dow}</div>
            <div className="num">{d.num}</div>
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="gridbody">
        <div className="gutter">
          {hourLabels.map((l) => (
            <div key={l.top} className="h" style={{ top: l.top }}>
              {l.text}
            </div>
          ))}
        </div>
        <div className="gridwrap" ref={wrapRef}>
          <div className="gridlines">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="col" />
            ))}
          </div>
          <canvas className="hlines" ref={hlinesRef} />
          <canvas className="stage" ref={stageRef} />
        </div>
      </div>

      {/* Control panel */}
      {menuOpen && (
      <div className={`panel${collapsed ? " collapsed" : ""}`}>
        <h3>
          Controls
          <span className="hgroup">
            <button className="min" onClick={() => setCollapsed(!collapsed)} aria-label="Minimize">
              {collapsed ? "+" : "–"}
            </button>
            <button className="min" onClick={() => setMenuOpen(false)} aria-label="Close controls">
              ×
            </button>
          </span>
        </h3>
        <div className="content">
          {/* Source */}
          <button className="sec" onClick={() => toggleSection("source")}>
            <span>Source</span>
            <span>{sections.source ? "–" : "+"}</span>
          </button>
          {sections.source && (
            <div className="secbody">
              <div className="btnrow">
                <button className="pbtn primary" onClick={() => fileRef.current?.click()}>
                  Upload video
                </button>
                <button className="pbtn" onClick={useWebcam}>
                  Webcam
                </button>
                <button className="pbtn" onClick={useDemo}>
                  Demo
                </button>
                <button className="pbtn" onClick={togglePlay}>
                  {playing ? "Pause" : "Play"}
                </button>
              </div>
              <div className="hint">
                Drop a video file anywhere on the page. Bright pixels become events, dark
                pixels stay empty.
              </div>
            </div>
          )}

          {/* Layout */}
          <button className="sec" onClick={() => toggleSection("layout")}>
            <span>Layout</span>
            <span>{sections.layout ? "–" : "+"}</span>
          </button>
          {sections.layout && (
            <div className="secbody">
              <div className="ctl">
                <label>
                  Resolution <span>{subCols === MIN_RES ? "1/day" : `${subCols}/day`}</span>
                </label>
                <input
                  type="range"
                  min={MIN_RES}
                  max={16}
                  value={subCols}
                  onChange={(e) => setSubCols(+e.target.value)}
                />
              </div>
              <div className="ctl">
                <label>
                  Darkness cutoff <span>{threshold}%</span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={60}
                  value={threshold}
                  onChange={(e) => setThreshold(+e.target.value)}
                />
              </div>
              <div className="ctl">
                <label>
                  Focal point{" "}
                  <span>
                    {focus === 50
                      ? "Center"
                      : focus < 50
                        ? `${50 - focus}% up`
                        : `${focus - 50}% down`}
                  </span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={focus}
                  onChange={(e) => setFocus(+e.target.value)}
                />
              </div>
              <div className="ctl">
                <label>
                  Event update{" "}
                  <span>{updatePeriod === 0 ? "Full" : `hold ${updatePeriod}ms`}</span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={200}
                  step={10}
                  value={updatePeriod}
                  onChange={(e) => setUpdatePeriod(+e.target.value)}
                />
              </div>
              <div className="chk">
                <input
                  type="checkbox"
                  id="labels"
                  checked={showLabels}
                  onChange={(e) => setShowLabels(e.target.checked)}
                />
                <label htmlFor="labels">Event titles on bright blocks</label>
              </div>
            </div>
          )}

          {/* Footage color */}
          <button className="sec" onClick={() => toggleSection("footage")}>
            <span>Footage color</span>
            <span>{sections.footage ? "–" : "+"}</span>
          </button>
          {sections.footage && (
            <div className="secbody">
              <div className="chk">
                <input
                  type="checkbox"
                  id="invert"
                  checked={invert}
                  onChange={(e) => setInvert(e.target.checked)}
                />
                <label htmlFor="invert">Invert colors</label>
              </div>
              <div className="ctl">
                <label>
                  Brightness <span>{brightness}%</span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={200}
                  value={brightness}
                  onChange={(e) => setBrightness(+e.target.value)}
                />
              </div>
              <div className="ctl">
                <label>
                  Saturation <span>{inSat}%</span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={200}
                  value={inSat}
                  onChange={(e) => setInSat(+e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Event color */}
          <button className="sec" onClick={() => toggleSection("events")}>
            <span>Event color</span>
            <span>{sections.events ? "–" : "+"}</span>
          </button>
          {sections.events && (
            <div className="secbody">
              <label className="grouplabel">
                Palette families
                <span className="linkbtns">
                  <button onClick={() => setFamilies(ALL_FAMILIES_ON)}>All</button>
                  <button
                    onClick={() =>
                      setFamilies(Object.fromEntries(FAMILIES.map((f) => [f.name, false])))
                    }
                  >
                    None
                  </button>
                </span>
              </label>
              <div className="families">
                {FAMILIES.map((f) => (
                  <button
                    key={f.name}
                    className={`chip${families[f.name] ? " on" : ""}`}
                    onClick={() => toggleFamily(f.name)}
                  >
                    <span className="dot" style={{ background: f.hues[0] }} />
                    {f.name}
                  </button>
                ))}
              </div>
              <div className="ctl">
                <label>
                  Hue shift <span>{hueShift}°</span>
                </label>
                <input
                  type="range"
                  min={-180}
                  max={180}
                  value={hueShift}
                  onChange={(e) => setHueShift(+e.target.value)}
                />
              </div>
              <div className="ctl">
                <label>
                  Lightness{" "}
                  <span>
                    {lightness === 0 ? "Neutral" : lightness > 0 ? `+${lightness}` : lightness}
                  </span>
                </label>
                <input
                  type="range"
                  min={-50}
                  max={50}
                  value={lightness}
                  onChange={(e) => setLightness(+e.target.value)}
                />
              </div>
              <div className="ctl">
                <label>
                  Shade richness <span>{shadeCount}/hue</span>
                </label>
                <input
                  type="range"
                  min={1}
                  max={7}
                  value={shadeCount}
                  onChange={(e) => setShadeCount(+e.target.value)}
                />
              </div>
              <div className="ctl">
                <label>
                  Vividness <span>{evSat}%</span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={200}
                  value={evSat}
                  onChange={(e) => setEvSat(+e.target.value)}
                />
              </div>
              <div className="ctl">
                <label>
                  Opacity <span>{evOpacity}%</span>
                </label>
                <input
                  type="range"
                  min={20}
                  max={100}
                  value={evOpacity}
                  onChange={(e) => setEvOpacity(+e.target.value)}
                />
              </div>
              <button className="pbtn resetbtn" onClick={resetEventColors}>
                Reset event colors
              </button>
            </div>
          )}

          <input
            ref={fileRef}
            type="file"
            accept="video/*"
            className="hiddenInput"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) loadFile(f);
            }}
          />
        </div>
      </div>
      )}

      <video ref={vidRef} muted loop playsInline style={{ display: "none" }} />
    </div>
  );
}
