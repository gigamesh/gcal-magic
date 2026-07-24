"use client";

import { useEffect, useRef, useState } from "react";

// Approximate hex values for Google Calendar's event color palette
const PALETTE = [
  "#D50000", "#E67C73", "#F4511E", "#F6BF26", "#33B679", "#0B8043",
  "#039BE5", "#3F51B5", "#7986CB", "#8E24AA", "#616161",
].map((hex) => ({
  hex,
  r: parseInt(hex.slice(1, 3), 16),
  g: parseInt(hex.slice(3, 5), 16),
  b: parseInt(hex.slice(5, 7), 16),
}));

const TITLES = ["Sync", "1:1", "Standup", "Focus", "Review", "Lunch", "Demo", "Go", "OOO", "Gym"];
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

function nearest(r: number, g: number, b: number) {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < PALETTE.length; i++) {
    const p = PALETTE[i];
    const d = (p.r - r) ** 2 + (p.g - g) ** 2 + (p.b - b) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return PALETTE[best];
}

export default function CalendarRenderer() {
  // UI state
  const [days, setDays] = useState<DayCell[]>([]);
  const [monthLabel, setMonthLabel] = useState("");
  const [logoDay, setLogoDay] = useState<number | null>(null);
  const [hourLabels, setHourLabels] = useState<{ top: number; text: string }[]>([]);
  const [subCols, setSubCols] = useState(10);
  const [threshold, setThreshold] = useState(12);
  const [showLabels, setShowLabels] = useState(true);
  const [playing, setPlaying] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  // Refs for the render loop (mutable, read every frame)
  const subColsRef = useRef(subCols);
  const thresholdRef = useRef(threshold / 100);
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

    function frame() {
      raf = requestAnimationFrame(frame);
      if (!playingRef.current) return;
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

      const cols = 7 * subColsRef.current;
      const cellW = W / cols;
      const cellH = Math.max(7, Math.min(18, cellW * 0.8));
      const rows = Math.max(1, Math.floor(H / cellH));

      // cover-crop sample of the source into a cols x rows buffer
      off.width = cols;
      off.height = rows;
      const stageAR = W / H;
      const srcAR = src.w / src.h;
      let sx: number, sy: number, sw: number, sh: number;
      if (srcAR > stageAR) {
        sh = src.h;
        sw = sh * stageAR;
        sx = (src.w - sw) / 2;
        sy = 0;
      } else {
        sw = src.w;
        sh = sw / stageAR;
        sx = 0;
        sy = (src.h - sh) / 2;
      }
      offCtx!.drawImage(src.el, sx, sy, sw, sh, 0, 0, cols, rows);
      const data = offCtx!.getImageData(0, 0, cols, rows).data;

      ctx!.clearRect(0, 0, W, H);
      const gapX = Math.min(2, cellW * 0.15);
      const gapY = 1.5;
      const thr = thresholdRef.current;
      ctx!.font = "500 8px Roboto, Arial";
      ctx!.textBaseline = "top";

      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const i = (y * cols + x) * 4;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
          if (lum < thr) continue;
          const c = nearest(r, g, b);
          ctx!.globalAlpha = 0.35 + 0.65 * Math.min(1, (lum - thr) / (1 - thr || 1));
          ctx!.fillStyle = c.hex;
          const px = x * cellW + gapX / 2;
          const py = y * cellH + gapY / 2;
          const w = cellW - gapX;
          const h = cellH - gapY;
          if (typeof ctx!.roundRect === "function") {
            ctx!.beginPath();
            ctx!.roundRect(px, py, w, h, 3);
            ctx!.fill();
          } else {
            ctx!.fillRect(px, py, w, h);
          }
          if (
            showLabelsRef.current &&
            lum > 0.55 &&
            w >= 32 &&
            h >= 9 &&
            (x * 7 + y * 13) % 11 === 0
          ) {
            ctx!.globalAlpha = 0.95;
            ctx!.fillStyle = "#fff";
            ctx!.fillText(TITLES[(x + y) % TITLES.length], px + 3, py + 1);
          }
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
        <div className="avatar">M</div>
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
      <div className={`panel${collapsed ? " collapsed" : ""}`}>
        <h3>
          Video source
          <button className="min" onClick={() => setCollapsed(!collapsed)}>
            {collapsed ? "+" : "–"}
          </button>
        </h3>
        <div className="content">
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
          <div className="ctl">
            <label>
              Resolution <span>{subCols}/day</span>
            </label>
            <input
              type="range"
              min={4}
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
          <div className="chk">
            <input
              type="checkbox"
              id="labels"
              checked={showLabels}
              onChange={(e) => setShowLabels(e.target.checked)}
            />
            <label htmlFor="labels">Event titles on bright blocks</label>
          </div>
          <div className="hint">
            Drop a video file anywhere on the page. Bright pixels become events, dark pixels stay
            empty.
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
      </div>

      <video ref={vidRef} muted loop playsInline style={{ display: "none" }} />
    </div>
  );
}
