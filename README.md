# Calendar Video Renderer

Renders any video (or your webcam) as a Google Calendar week view in real time. Each "event" is a pixel: video frames are downsampled to a grid, each cell's color snaps to the nearest color in Google Calendar's event palette, and brightness controls the event's opacity. Dark pixels render as empty calendar.

## Setup

```bash
npm install
npm run dev
```

Then open http://localhost:3000

## Usage

- Opens in **Demo** mode (a bouncing "GO") so you can see the effect immediately.
- **Upload video** or drag-and-drop any video file onto the page.
- **Webcam** renders your camera feed live (requires browser permission).
- **Resolution** — sub-columns per day (4–16). Lower reads more like a real calendar; higher gives a clearer image.
- **Darkness cutoff** — pixels below this brightness stay empty. High-contrast footage against dark backgrounds works best.
- **Event titles** — sprinkles tiny fake meeting names ("Sync", "Standup", "Go"...) on bright blocks.

## Capturing for social

Screen-record the browser window while your footage plays, then sync the capture to your track in your video editor.

## Notes

- All processing is client-side; no video ever leaves the browser.
- The calendar chrome is a static replica of Google Calendar's week view; the event area is a single `<canvas>` redrawn every animation frame for performance.
