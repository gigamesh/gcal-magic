"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

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

type Source = "demo" | "video";

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

// ---------------------------------------------------------------------------
// Keyframe timeline
// ---------------------------------------------------------------------------

// Width (px) of each lane's left "head" column (label + manual control).
const HEAD_W = 200;

type LaneKind = "number" | "bool" | "families";
type LaneValue = number | boolean | Record<string, boolean>;

interface Keyframe {
  id: string;
  t: number; // seconds
  value: LaneValue;
}

interface LaneDesc {
  id: string;
  label: string;
  kind: LaneKind;
  min?: number;
  max?: number;
  step?: number;
  refDivisor?: number; // value written to the ref = raw / refDivisor
  suffix?: string;
  palette?: boolean; // feeds buildPalette rather than a scalar ref
}

// One lane per animatable control, in display order. Mirrors the manual
// controls exactly (ranges, ref transforms).
const LANES: LaneDesc[] = [
  { id: "subCols", label: "Resolution", kind: "number", min: MIN_RES, max: 16, step: 1, suffix: "/day" },
  { id: "threshold", label: "Darkness", kind: "number", min: 0, max: 60, step: 1, refDivisor: 100, suffix: "%" },
  { id: "focus", label: "Focal point", kind: "number", min: 0, max: 100, step: 1, refDivisor: 100, suffix: "%" },
  { id: "zoom", label: "Zoom", kind: "number", min: 100, max: 400, step: 1, refDivisor: 100, suffix: "%" },
  { id: "updatePeriod", label: "Event hold", kind: "number", min: 0, max: 200, step: 10, suffix: "ms" },
  { id: "brightness", label: "Brightness", kind: "number", min: 0, max: 200, step: 1, refDivisor: 100, suffix: "%" },
  { id: "inSat", label: "Saturation", kind: "number", min: 0, max: 200, step: 1, refDivisor: 100, suffix: "%" },
  { id: "evSat", label: "Vividness", kind: "number", min: 0, max: 200, step: 1, refDivisor: 100, suffix: "%" },
  { id: "evOpacity", label: "Opacity", kind: "number", min: 20, max: 100, step: 1, refDivisor: 100, suffix: "%" },
  { id: "hueShift", label: "Hue shift", kind: "number", min: -180, max: 180, step: 1, suffix: "°", palette: true },
  { id: "lightness", label: "Lightness", kind: "number", min: -50, max: 50, step: 1, palette: true },
  { id: "shadeCount", label: "Shade richness", kind: "number", min: 1, max: 7, step: 1, palette: true },
  { id: "invert", label: "Invert", kind: "bool" },
  { id: "showLabels", label: "Titles", kind: "bool" },
  { id: "families", label: "Palette families", kind: "families", palette: true },
];

const LANE_BY_ID: Record<string, LaneDesc> = Object.fromEntries(LANES.map((l) => [l.id, l]));

const uid = () => Math.random().toString(36).slice(2, 10);

const lerp = (a: number, b: number, f: number) => a + (b - a) * f;

// Interpolate a lane's value at time t. `keys` is sorted by t, length >= 1.
function evalLane(desc: LaneDesc, keys: Keyframe[], t: number): LaneValue {
  if (t <= keys[0].t) return keys[0].value;
  const last = keys[keys.length - 1];
  if (t >= last.t) return last.value;
  let i = 0;
  while (i < keys.length - 1 && keys[i + 1].t <= t) i++;
  const a = keys[i];
  const b = keys[i + 1];
  if (desc.kind === "number") {
    const f = (t - a.t) / (b.t - a.t || 1);
    return lerp(a.value as number, b.value as number, f);
  }
  return a.value; // step-hold for bool / families
}

function fmtLaneValue(desc: LaneDesc, v: LaneValue): string {
  if (desc.kind === "bool") return v ? "on" : "off";
  if (desc.kind === "families") {
    return `${Object.values(v as Record<string, boolean>).filter(Boolean).length}/${FAMILIES.length}`;
  }
  return `${Math.round(v as number)}${desc.suffix ?? ""}`;
}

function fmtTime(s: number): string {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

const DEMO_DURATION = 10; // synthetic timeline length for demo mode (seconds)

export default function CalendarRenderer() {
  // UI state
  const [days, setDays] = useState<DayCell[]>([]);
  const [monthLabel, setMonthLabel] = useState("");
  const [logoDay, setLogoDay] = useState<number | null>(null);
  const [hourLabels, setHourLabels] = useState<{ top: number; text: string }[]>([]);
  const [subCols, setSubCols] = useState(10);
  const [threshold, setThreshold] = useState(12);
  const [focus, setFocus] = useState(50);
  const [zoom, setZoom] = useState(100);
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
  const [timelineOpen, setTimelineOpen] = useState(true);
  const [drawerH, setDrawerH] = useState(340);
  const [duration, setDuration] = useState(DEMO_DURATION);
  const [lanes, setLanes] = useState<Record<string, { keys: Keyframe[] }>>(() =>
    Object.fromEntries(LANES.map((l) => [l.id, { keys: [] as Keyframe[] }])),
  );
  const [selectedKf, setSelectedKf] = useState<{ lane: string; id: string } | null>(null);
  const [projectName, setProjectName] = useState("");
  const [projectList, setProjectList] = useState<string[]>([]);

  // Refs for the render loop (mutable, read every frame)
  const subColsRef = useRef(subCols);
  const thresholdRef = useRef(threshold / 100);
  const focusRef = useRef(focus / 100);
  const zoomRef = useRef(zoom / 100);
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

  // Timeline refs read/written by the render loop (no re-render).
  const lanesRef = useRef(lanes);
  const durationRef = useRef(duration);
  const currentTimeRef = useRef(0);
  const clockRef = useRef(0); // synthetic clock seconds (demo mode)
  const startAnchorRef = useRef(0); // last place the playhead was set; play restarts here
  const forceRenderRef = useRef(false); // draw one frame while paused (scrub)
  const paletteInputsRef = useRef({ families, shadeCount, hueShift, lightness });

  // DOM refs
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLCanvasElement>(null);
  const hlinesRef = useRef<HTMLCanvasElement>(null);
  const vidRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const playheadElRef = useRef<HTMLDivElement>(null);
  const timeReadoutRef = useRef<HTMLSpanElement>(null);
  const valueSpanRefs = useRef<Record<string, HTMLSpanElement | null>>({});
  const laneInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => { subColsRef.current = subCols; }, [subCols]);
  useEffect(() => { thresholdRef.current = threshold / 100; }, [threshold]);
  useEffect(() => { focusRef.current = focus / 100; }, [focus]);
  useEffect(() => { zoomRef.current = zoom / 100; }, [zoom]);
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
  useEffect(() => { lanesRef.current = lanes; }, [lanes]);
  useEffect(() => { durationRef.current = duration; }, [duration]);
  useEffect(() => {
    paletteInputsRef.current = { families, shadeCount, hueShift, lightness };
  }, [families, shadeCount, hueShift, lightness]);

  // When keyframes change, reset every control ref to its manual value; the
  // render loop re-drives any still-animated lanes each frame. This restores a
  // lane's manual value after its last keyframe is removed, and repaints once.
  useEffect(() => {
    subColsRef.current = subCols;
    thresholdRef.current = threshold / 100;
    focusRef.current = focus / 100;
    zoomRef.current = zoom / 100;
    updatePeriodRef.current = updatePeriod;
    brightnessRef.current = brightness / 100;
    inSatRef.current = inSat / 100;
    evSatRef.current = evSat / 100;
    evOpacityRef.current = evOpacity / 100;
    invertRef.current = invert;
    showLabelsRef.current = showLabels;
    paletteRef.current = buildPalette(families, shadeCount, hueShift, lightness / 100);
    forceRenderRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lanes]);

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

  // Layout: size canvases, draw hour lines, compute gutter labels.
  const layout = useCallback(() => {
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
  }, []);

  // Re-run layout on window resize AND whenever the grid box changes size
  // (e.g. the timeline drawer opening/closing shrinks the grid) via a
  // ResizeObserver, coalesced to one call per frame.
  useEffect(() => {
    layout();
    let pending = false;
    const schedule = () => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        layout();
      });
    };
    const ro = new ResizeObserver(schedule);
    if (wrapRef.current) ro.observe(wrapRef.current);
    window.addEventListener("resize", layout);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", layout);
    };
  }, [layout]);

  // Timeline duration follows the loaded video's length.
  useEffect(() => {
    const vid = vidRef.current;
    if (!vid) return;
    const onMeta = () => {
      if (isFinite(vid.duration) && vid.duration > 0) {
        setDuration(vid.duration);
        durationRef.current = vid.duration;
      }
    };
    vid.addEventListener("loadedmetadata", onMeta);
    return () => vid.removeEventListener("loadedmetadata", onMeta);
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

    // Write an animated numeric/bool lane value into its control ref.
    function applyToRef(id: string, v: number | boolean, div: number) {
      switch (id) {
        case "subCols": subColsRef.current = Math.round(v as number); break;
        case "threshold": thresholdRef.current = (v as number) / div; break;
        case "focus": focusRef.current = (v as number) / div; break;
        case "zoom": zoomRef.current = (v as number) / div; break;
        case "updatePeriod": updatePeriodRef.current = v as number; break;
        case "brightness": brightnessRef.current = (v as number) / div; break;
        case "inSat": inSatRef.current = (v as number) / div; break;
        case "evSat": evSatRef.current = (v as number) / div; break;
        case "evOpacity": evOpacityRef.current = (v as number) / div; break;
        case "invert": invertRef.current = v as boolean; break;
        case "showLabels": showLabelsRef.current = v as boolean; break;
      }
    }

    // Drive every animated lane from its keyframes at time t. Palette lanes are
    // batched into a single buildPalette call; non-animated palette inputs come
    // from paletteInputsRef (the manual values).
    function applyKeyframes(t: number) {
      const lanesNow = lanesRef.current;
      const pin = paletteInputsRef.current;
      let palDirty = false;
      let famEff = pin.families;
      let shadeEff = pin.shadeCount;
      let hueEff = pin.hueShift;
      let lightEff = pin.lightness;
      for (const desc of LANES) {
        const lane = lanesNow[desc.id];
        if (!lane || lane.keys.length === 0) continue;
        const v = evalLane(desc, lane.keys, t);
        if (desc.palette) {
          palDirty = true;
          if (desc.id === "families") famEff = v as Record<string, boolean>;
          else if (desc.id === "shadeCount") shadeEff = v as number;
          else if (desc.id === "hueShift") hueEff = v as number;
          else if (desc.id === "lightness") lightEff = v as number;
        } else {
          applyToRef(desc.id, v as number | boolean, desc.refDivisor ?? 1);
        }
        const span = valueSpanRefs.current[desc.id];
        if (span) span.textContent = fmtLaneValue(desc, v);
        const inp = laneInputRefs.current[desc.id];
        if (inp) {
          if (desc.kind === "bool") inp.checked = v as boolean;
          else if (desc.kind === "number") inp.value = String(v);
        }
      }
      if (palDirty) paletteRef.current = buildPalette(famEff, shadeEff, hueEff, lightEff / 100);
    }

    let raf = 0;
    let lastDraw = -Infinity;
    let lastFrameMs = -1;

    function frame() {
      raf = requestAnimationFrame(frame);
      const now = performance.now();
      const dt = lastFrameMs < 0 ? 0 : now - lastFrameMs;
      lastFrameMs = now;

      const playing = playingRef.current;
      const forced = forceRenderRef.current;
      if (!playing && !forced) return;

      // Derive the timeline clock t. A loaded video is the master clock (it
      // loops via vid.loop); demo mode uses a synthetic clock wrapping at the
      // duration.
      const dur = durationRef.current || 1;
      let t: number;
      if (sourceRef.current === "video" && vid!.readyState >= 2 && isFinite(vid!.duration)) {
        t = vid!.currentTime;
      } else {
        if (playing) clockRef.current = (clockRef.current + dt / 1000) % dur;
        t = clockRef.current;
      }
      currentTimeRef.current = t;

      // Move the playhead + time readout every RAF (even when the grid draw is
      // throttled) so the transport stays smooth. The playhead sits at the head
      // column edge (HEAD_W) plus a fraction of the remaining track width.
      if (playheadElRef.current) {
        const frac = dur > 0 ? t / dur : 0;
        playheadElRef.current.style.left = `calc(${HEAD_W}px + (100% - ${HEAD_W}px) * ${frac})`;
      }
      if (timeReadoutRef.current) {
        timeReadoutRef.current.textContent = `${fmtTime(t)} / ${fmtTime(dur)}`;
      }

      // Throttle how often the event grid recomputes/redraws (forced scrubs
      // bypass the hold). 0 = update every frame (full speed).
      const period = updatePeriodRef.current;
      if (period > 0 && !forced && now - lastDraw < period) return;
      lastDraw = now;
      forceRenderRef.current = false;

      // Drive animated controls from their keyframes at time t.
      applyKeyframes(t);

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
      // Zoom magnifies the footage by sampling a smaller sub-rectangle, shrunk
      // around the cover-crop center (which already reflects the focal point),
      // then clamped inside the source.
      const zoom = zoomRef.current;
      if (zoom > 1) {
        const cx = sx + sw / 2;
        const cy = sy + sh / 2;
        sw /= zoom;
        sh /= zoom;
        sx = Math.max(0, Math.min(src.w - sw, cx - sw / 2));
        sy = Math.max(0, Math.min(src.h - sh, cy - sh / 2));
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

  // Keyboard: Space toggles play/pause; Delete/Backspace removes the selected
  // keyframe. Both ignore events that originate from form fields/buttons.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if (e.code === "Space") {
        if (typing || tag === "BUTTON") return;
        e.preventDefault();
        togglePlay();
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedKf) {
        if (typing) return;
        e.preventDefault();
        deleteKf(selectedKf.lane, selectedKf.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKf]);

  // Load the saved-project list once on mount.
  useEffect(() => {
    refreshProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function loadFile(f: File) {
    const vid = vidRef.current;
    if (!vid) return;
    vid.src = URL.createObjectURL(f);
    vid.loop = true;
    vid.muted = true;
    vid.play().catch(() => {});
    sourceRef.current = "video";
    setPlaying(true);
  }

  function useDemo() {
    vidRef.current?.pause();
    sourceRef.current = "demo";
    setDuration(DEMO_DURATION);
    durationRef.current = DEMO_DURATION;
    clockRef.current = 0;
    setPlaying(true);
  }

  function togglePlay() {
    const next = !playingRef.current;
    setPlaying(next);
    const vid = vidRef.current;
    if (next) {
      // Restart from the last place the playhead was set, not where it paused.
      const t = startAnchorRef.current;
      currentTimeRef.current = t;
      if (sourceRef.current === "video") {
        if (vid) {
          vid.currentTime = t;
          vid.play().catch(() => {});
        }
      } else {
        clockRef.current = t;
      }
    } else {
      if (sourceRef.current === "video" && vid) vid.pause();
      forceRenderRef.current = true;
    }
  }

  // ---- Timeline transport & keyframe editing --------------------------------

  // Seeking sets the playhead AND remembers it as the start anchor — the point
  // playback restarts from next time it begins.
  function seekTo(t: number) {
    const clamped = Math.max(0, Math.min(durationRef.current || DEMO_DURATION, t));
    if (sourceRef.current === "video") {
      const vid = vidRef.current;
      if (vid) vid.currentTime = clamped;
    } else {
      clockRef.current = clamped;
    }
    currentTimeRef.current = clamped;
    startAnchorRef.current = clamped;
    forceRenderRef.current = true;
  }

  const rewind = () => seekTo(0);

  function laneManualValue(id: string): LaneValue {
    switch (id) {
      case "subCols": return subCols;
      case "threshold": return threshold;
      case "focus": return focus;
      case "zoom": return zoom;
      case "updatePeriod": return updatePeriod;
      case "brightness": return brightness;
      case "inSat": return inSat;
      case "evSat": return evSat;
      case "evOpacity": return evOpacity;
      case "hueShift": return hueShift;
      case "lightness": return lightness;
      case "shadeCount": return shadeCount;
      case "invert": return invert;
      case "showLabels": return showLabels;
      case "families": return families;
    }
    return 0;
  }

  function setLaneManual(id: string, v: LaneValue) {
    switch (id) {
      case "subCols": setSubCols(v as number); subColsRef.current = v as number; break;
      case "threshold": setThreshold(v as number); thresholdRef.current = (v as number) / 100; break;
      case "focus": setFocus(v as number); focusRef.current = (v as number) / 100; break;
      case "zoom": setZoom(v as number); zoomRef.current = (v as number) / 100; break;
      case "updatePeriod": setUpdatePeriod(v as number); updatePeriodRef.current = v as number; break;
      case "brightness": setBrightness(v as number); brightnessRef.current = (v as number) / 100; break;
      case "inSat": setInSat(v as number); inSatRef.current = (v as number) / 100; break;
      case "evSat": setEvSat(v as number); evSatRef.current = (v as number) / 100; break;
      case "evOpacity": setEvOpacity(v as number); evOpacityRef.current = (v as number) / 100; break;
      case "invert": setInvert(v as boolean); invertRef.current = v as boolean; break;
      case "showLabels": setShowLabels(v as boolean); showLabelsRef.current = v as boolean; break;
      case "hueShift": setHueShift(v as number); break;
      case "lightness": setLightness(v as number); break;
      case "shadeCount": setShadeCount(v as number); break;
      case "families": setFamilies(v as Record<string, boolean>); break;
    }
    const desc = LANE_BY_ID[id];
    if (desc?.palette) {
      const next = { families, shadeCount, hueShift, lightness } as {
        families: Record<string, boolean>;
        shadeCount: number;
        hueShift: number;
        lightness: number;
      };
      if (id === "families") next.families = v as Record<string, boolean>;
      else if (id === "shadeCount") next.shadeCount = v as number;
      else if (id === "hueShift") next.hueShift = v as number;
      else if (id === "lightness") next.lightness = v as number;
      paletteInputsRef.current = next;
      paletteRef.current = buildPalette(next.families, next.shadeCount, next.hueShift, next.lightness / 100);
    }
    forceRenderRef.current = true;
  }

  // Editing a control's value always writes a keyframe at the current playhead
  // time: if one already sits there it's updated in place, otherwise a new one
  // is created. Editing at a new time therefore never disturbs keyframes placed
  // elsewhere. The manual value is kept in sync as the fallback outside the
  // keyframe range.
  function commitLaneValue(id: string, v: LaneValue) {
    setLaneManual(id, v);
    upsertKf(id, currentTimeRef.current, v);
  }

  // Insert a keyframe at time t, or update the one already at (about) that time.
  function upsertKf(lane: string, t: number, value: LaneValue) {
    const v: LaneValue =
      LANE_BY_ID[lane].kind === "families"
        ? { ...(value as Record<string, boolean>) }
        : value;
    setLanes((prev) => {
      const keys = prev[lane].keys.slice();
      const i = keys.findIndex((k) => Math.abs(k.t - t) < 0.03);
      if (i >= 0) keys[i] = { ...keys[i], value: v };
      else keys.push({ id: uid(), t, value: v });
      keys.sort((a, b) => a.t - b.t);
      return { ...prev, [lane]: { keys } };
    });
    forceRenderRef.current = true;
  }

  // The "◆" button keys the lane's current value at the playhead.
  function addKf(lane: string) {
    upsertKf(lane, currentTimeRef.current, laneManualValue(lane));
  }

  function deleteKf(lane: string, kid: string) {
    setLanes((prev) => ({
      ...prev,
      [lane]: { keys: prev[lane].keys.filter((k) => k.id !== kid) },
    }));
    setSelectedKf((sel) => (sel && sel.lane === lane && sel.id === kid ? null : sel));
  }

  function moveKf(lane: string, kid: string, t: number) {
    const clamped = Math.max(0, Math.min(duration, t));
    setLanes((prev) => ({
      ...prev,
      [lane]: {
        keys: prev[lane].keys
          .map((k) => (k.id === kid ? { ...k, t: clamped } : k))
          .sort((a, b) => a.t - b.t),
      },
    }));
  }

  function toggleFamily(name: string) {
    const cur = laneManualValue("families") as Record<string, boolean>;
    commitLaneValue("families", { ...cur, [name]: !cur[name] });
  }

  function setFamiliesAll(on: boolean) {
    commitLaneValue("families", Object.fromEntries(FAMILIES.map((f) => [f.name, on])));
  }

  // ---- Projects (JSON files in the repo, via /api/projects) -----------------

  async function refreshProjects() {
    try {
      const res = await fetch("/api/projects");
      if (!res.ok) return;
      const j = await res.json();
      setProjectList(Array.isArray(j.projects) ? j.projects : []);
    } catch {
      /* offline / no server */
    }
  }

  function buildProject() {
    return {
      version: 1,
      duration,
      startTime: startAnchorRef.current,
      manual: {
        subCols, threshold, focus, zoom, updatePeriod, invert, brightness, inSat,
        evSat, evOpacity, families, shadeCount, hueShift, lightness, showLabels,
      },
      lanes,
    };
  }

  async function saveProject() {
    const name = projectName.trim() || "untitled";
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, data: buildProject() }),
      });
      const j = await res.json();
      if (j.name) setProjectName(j.name);
      refreshProjects();
    } catch {
      /* ignore */
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function applyProject(p: any) {
    const m = (p && p.manual) || {};
    if (typeof m.subCols === "number") setSubCols(m.subCols);
    if (typeof m.threshold === "number") setThreshold(m.threshold);
    if (typeof m.focus === "number") setFocus(m.focus);
    if (typeof m.zoom === "number") setZoom(m.zoom);
    if (typeof m.updatePeriod === "number") setUpdatePeriod(m.updatePeriod);
    if (typeof m.invert === "boolean") setInvert(m.invert);
    if (typeof m.brightness === "number") setBrightness(m.brightness);
    if (typeof m.inSat === "number") setInSat(m.inSat);
    if (typeof m.evSat === "number") setEvSat(m.evSat);
    if (typeof m.evOpacity === "number") setEvOpacity(m.evOpacity);
    if (m.families && typeof m.families === "object") setFamilies(m.families);
    if (typeof m.shadeCount === "number") setShadeCount(m.shadeCount);
    if (typeof m.hueShift === "number") setHueShift(m.hueShift);
    if (typeof m.lightness === "number") setLightness(m.lightness);
    if (typeof m.showLabels === "boolean") setShowLabels(m.showLabels);
    const dur = typeof p?.duration === "number" ? p.duration : DEMO_DURATION;
    setDuration(dur);
    durationRef.current = dur;
    const src = (p && p.lanes) || {};
    const nextLanes = Object.fromEntries(
      LANES.map((l) => [
        l.id,
        { keys: Array.isArray(src[l.id]?.keys) ? (src[l.id].keys as Keyframe[]) : [] },
      ]),
    );
    setLanes(nextLanes);
    setSelectedKf(null);
    seekTo(typeof p?.startTime === "number" ? p.startTime : 0);
  }

  async function loadProject(name: string) {
    if (!name) return;
    try {
      const res = await fetch(`/api/projects?name=${encodeURIComponent(name)}`);
      if (!res.ok) return;
      applyProject(await res.json());
      setProjectName(name);
    } catch {
      /* ignore */
    }
  }

  // ---- Pointer interactions -------------------------------------------------

  function timeFromClientX(rect: DOMRect, clientX: number) {
    return ((clientX - rect.left) / (rect.width || 1)) * duration;
  }

  // Click/drag on the ruler to scrub.
  function onRulerDown(e: ReactPointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    seekTo(timeFromClientX(rect, e.clientX));
    const move = (ev: PointerEvent) => seekTo(timeFromClientX(rect, ev.clientX));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // Drag the top edge of the drawer to resize its height.
  function onResizeDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.preventDefault();
    const startY = e.clientY;
    const startH = drawerH;
    const move = (ev: PointerEvent) => {
      const h = Math.max(140, Math.min(window.innerHeight - 80, startH + (startY - ev.clientY)));
      setDrawerH(h);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // Click empty track area to scrub to that time.
  function onTrackDown(e: ReactPointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    seekTo(timeFromClientX(rect, e.clientX));
  }

  // Select a keyframe and drag it in time.
  function onKfDown(e: ReactPointerEvent<HTMLButtonElement>, lane: string, kid: string) {
    e.stopPropagation();
    setSelectedKf({ lane, id: kid });
    const track = e.currentTarget.parentElement as HTMLElement | null;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const move = (ev: PointerEvent) => moveKf(lane, kid, timeFromClientX(rect, ev.clientX));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function renderLaneControl(desc: LaneDesc, editVal: LaneValue) {
    if (desc.kind === "number") {
      return (
        <input
          ref={(el) => {
            laneInputRefs.current[desc.id] = el;
          }}
          type="range"
          min={desc.min}
          max={desc.max}
          step={desc.step}
          value={editVal as number}
          onChange={(e) => commitLaneValue(desc.id, +e.target.value)}
        />
      );
    }
    if (desc.kind === "bool") {
      return (
        <label className="tl-toggle">
          <input
            ref={(el) => {
              laneInputRefs.current[desc.id] = el;
            }}
            type="checkbox"
            checked={editVal as boolean}
            onChange={(e) => commitLaneValue(desc.id, e.target.checked)}
          />
          <span>{(editVal as boolean) ? "on" : "off"}</span>
        </label>
      );
    }
    const fam = editVal as Record<string, boolean>;
    return (
      <div className="tl-fam">
        {FAMILIES.map((f) => (
          <button
            key={f.name}
            className={`tl-chip${fam[f.name] ? " on" : ""}`}
            style={{ background: fam[f.name] ? f.hues[0] : undefined }}
            onClick={() => toggleFamily(f.name)}
            title={f.name}
          />
        ))}
        <button className="tl-famall" onClick={() => setFamiliesAll(true)}>
          All
        </button>
        <button className="tl-famall" onClick={() => setFamiliesAll(false)}>
          None
        </button>
      </div>
    );
  }

  const rulerTicks = Array.from({ length: 7 }, (_, i) => i / 6);

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
          className={`avatar${timelineOpen ? " active" : ""}`}
          onClick={() => setTimelineOpen((o) => !o)}
          aria-label={timelineOpen ? "Hide timeline" : "Show timeline"}
          aria-pressed={timelineOpen}
          title="Toggle timeline"
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

      {/* Timeline drawer */}
      <div
        className={`timeline${timelineOpen ? "" : " closed"}`}
        style={{ height: drawerH }}
      >
        <div className="tl-resize" onPointerDown={onResizeDown} />
        <div className="tl-transport">
          <button className="tl-icon" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"}>
            {playing ? "❚❚" : "▶"}
          </button>
          <button className="tl-icon" onClick={rewind} aria-label="Rewind">
            ⏮
          </button>
          <span className="tl-time" ref={timeReadoutRef}>
            0:00 / {fmtTime(duration)}
          </span>
          <div className="tl-spacer" />
          <input
            className="tl-proj-name"
            type="text"
            placeholder="project name"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
          />
          <button className="pbtn" onClick={saveProject}>
            Save
          </button>
          <select
            className="tl-proj-load"
            value=""
            onChange={(e) => {
              const v = e.target.value;
              e.target.selectedIndex = 0;
              if (v) loadProject(v);
            }}
          >
            <option value="">Load…</option>
            {projectList.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <span className="tl-divider" />
          <button className="pbtn primary" onClick={() => fileRef.current?.click()}>
            Upload
          </button>
          <button className="pbtn" onClick={useDemo}>
            Demo
          </button>
          <button
            className="tl-icon"
            onClick={() => setTimelineOpen(false)}
            aria-label="Close timeline"
          >
            ×
          </button>
        </div>

        <div className="tl-scroll">
          <div className="tl-ruler">
            <div className="tl-ruler-head">Timeline</div>
            <div className="tl-ruler-track" onPointerDown={onRulerDown}>
              {rulerTicks.map((f, i) => (
                <div key={i} className="tl-tick" style={{ left: `${f * 100}%` }}>
                  <span>{fmtTime(f * duration)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="tl-lanes">
            {LANES.map((desc) => {
              const lane = lanes[desc.id];
              const editVal = laneManualValue(desc.id);
              const selOnLane = selectedKf?.lane === desc.id;
              return (
                <div className={`tl-lane${selOnLane ? " sel" : ""}`} key={desc.id}>
                  <div className="tl-head">
                    <div className="tl-headtop">
                      <span className="tl-name">{desc.label}</span>
                      <span
                        className="tl-val"
                        ref={(el) => {
                          valueSpanRefs.current[desc.id] = el;
                        }}
                      >
                        {fmtLaneValue(desc, editVal)}
                      </span>
                      <button
                        className="tl-add"
                        onClick={() => addKf(desc.id)}
                        title="Add keyframe at playhead"
                      >
                        ◆
                      </button>
                    </div>
                    <div className="tl-ctl">{renderLaneControl(desc, editVal)}</div>
                  </div>
                  <div className="tl-track" onPointerDown={onTrackDown}>
                    {lane.keys.map((k) => (
                      <button
                        key={k.id}
                        className={`tl-kf${
                          selectedKf?.lane === desc.id && selectedKf.id === k.id ? " sel" : ""
                        }`}
                        style={{ left: `${(k.t / (duration || 1)) * 100}%` }}
                        onPointerDown={(e) => onKfDown(e, desc.id, k.id)}
                        onDoubleClick={() => {
                          seekTo(k.t);
                          setLaneManual(desc.id, k.value);
                          setSelectedKf({ lane: desc.id, id: k.id });
                        }}
                      >
                        <span className="tl-kf-dot" />
                        <span className="tl-kf-tip">{fmtLaneValue(desc, k.value)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="tl-playhead" ref={playheadElRef} />
        </div>

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

      <video ref={vidRef} muted loop playsInline style={{ display: "none" }} />
    </div>
  );
}
