# CLAUDE.md — Project context for Claude Code

> โปรเจกต์นี้เป็นเว็บแอปควบคุมงานก่อสร้าง (S-curve / project controls) ทำงานฝั่ง browser ล้วน
> ไฟล์นี้บอก Claude Code ว่าโครงสร้างเป็นอย่างไร build/deploy ยังไง และมีจุดที่ห้ามพังตรงไหน

## What this app is
A single-page construction **project-controls** web app. Everything runs in the browser; there is **no backend**. Data persists in the browser (localStorage) and optionally syncs one JSON file to the user's Google Drive.

Five tabs (all inside one React component):
1. **Dashboard** (`dash`) — per-category rollup: weight %, % complete, earned value, profit/loss, donut + bars + table.
2. **S-Curve & Schedule** (`scurve`) — WBS schedule (date-based) + planned/actual S-curve + monthly/weekly progress table.
3. **BOQ & Cost** (`boq`) — bill of quantities: BOQ Qty vs Actual Qty, BOQ Rate vs Actual Rate, profit/loss, drives the actual curve.
4. **Materials** (`material`) — material submittal register with auto document numbers + approval status.
5. **Shop Drawings** (`shop`) — shop-drawing submittal register (same pattern as materials).

## Tech stack
- **Vite** + **React 18** (function component, hooks)
- **recharts** (ComposedChart, PieChart)
- **lucide-react** (icons)
- Styling is **inline styles only** (a palette object `C` in App.jsx). There is **no Tailwind / CSS framework**. Do not introduce Tailwind classes.
- Fonts are loaded with an `@import` inside a `<style>` tag (Google Fonts: Space Grotesk, Inter, IBM Plex Mono).

## File structure
```
construction-controls/
├─ index.html                 # Vite dev entry (loads /src/main.jsx)
├─ src/
│  ├─ main.jsx                # ReactDOM entry, renders <SCurveApp/>
│  ├─ App.jsx                 # THE ENTIRE APP (one big component, ~900 lines)
│  └─ drive.js                # Google Drive sync (GIS token flow, drive.file scope)
├─ vite.config.js             # base:"./" + react + vite-plugin-singlefile
├─ package.json
├─ .github/workflows/deploy.yml  # optional Actions build→Pages (user currently deploys manually)
└─ README.md                  # deploy + Google Drive setup guide (Thai)
```

## Commands
```bash
npm install          # install deps
npm run dev          # dev server at http://localhost:5173
npm run build        # -> dist/index.html  (ONE self-contained file, everything inlined)
npm run preview      # preview the production build
```
`vite-plugin-singlefile` inlines all JS/CSS into a single `dist/index.html`. That single file is what gets deployed.

## Deploy (current method the user uses)
Simple GitHub Pages, no Actions:
1. `npm run build` → take `dist/index.html`.
2. Upload that `index.html` to the **root** of the GitHub repo (`main` branch).
3. Repo → Settings → Pages → **Deploy from a branch** → `main` / `/ (root)`.
Live at `https://<user>.github.io/<repo>/`. (base is `"./"` so relative asset paths work from any sub-path.)

There is also a GitHub Actions workflow (`.github/workflows/deploy.yml`) that builds and deploys automatically on push to `main`, if the user sets Pages Source = GitHub Actions instead.

## Architecture of App.jsx (important)

### State model
All state lives in `SCurveApp` via `useState`. `snapshot()` serializes the whole project into one object; `applySnapshot(obj)` restores it. Autosave writes `snapshot()` to `localStorage["ccx-state"]` (debounced). Google Drive Save/Load uses the same snapshot. **If you add a new piece of persistent state, add it to BOTH `snapshot()` and `applySnapshot()`.**

### Time / period engine
- Project has `startDate`, `periodType` ("month" | "week"), `periodCount`.
- `periods` (useMemo) = array of `{k, startDay, endDay, date, label}` computed from the start date. Month periods use real calendar month boundaries; week periods are 7-day blocks.
- Each schedule **item** has `startDate` + `days` (duration in days). Its work is spread across periods by **date overlap** using `shapeCum()` (cosine-ease = S-curve, or linear). This is how the planned curve is built and why it always ends at 100% for items inside the window.

### ⚠️ Critical gotchas — do not break these
1. **Interactive input components must stay at MODULE scope**, not defined inside `SCurveApp`. `Num`, `Toggle`, `FormatBar` are defined at top level on purpose. If you move them inside the component (or create new inline input components inside render), React remounts them every keystroke and **text inputs lose focus after one character**.
2. **Period-indexed data is remapped by date on month↔week toggle.** `actuals`, `boqDone`, and `planOv` are keyed by period index. `changePeriodType()` calls `remapByDate()` to redistribute values across the new periods so the cumulative curve is preserved. Do not remove this or the actual curve will jump to ~100% too early when switching to weekly.
3. **Colors/styles are inline** using palette `C`. Keep that pattern; don't add className-based styling.
4. Values: `itemVal(it)` = sum of BOQ line `qty*rate` if the item has BOQ lines, else its typed `value`. Weights normalize against `total` so the curve finishes at 100%.

### BOQ specifics
- Each item has `boq: [{id, desc, unit, qty, rate, actualRate}]`.
- **Actual Qty** shown per line = cumulative completed to the reporting period (`cumDone(id, RP)`), stored as per-period increments in `boqDone[lineId][periodIndex]`. Editing Actual Qty back-calculates the reporting period's increment (`setActualCum`).
- **Profit/Loss** per line = `(rate - actualRate) * qty`. Dashboard totals roll these up.
- Completed quantities feed the S-curve actual line when "Actual progress from" = **BOQ qty**.

### Registers (materials / shop drawings)
- Grouped by work category. Each category has a short `code` (ST, AR, ...).
- Auto document numbers via `buildNo(fmt, code, seq)` → e.g. `ARY-ARCH-FPIT-MAT-ST-001`. Format (prefix/separator/digits) is editable per register; "Renumber all" regenerates sequentially.

### Google Drive (src/drive.js)
- Uses Google Identity Services (GIS) token flow, scope `drive.file` (app only sees the one file it creates: `construction-controls.json`).
- The user supplies their own **OAuth Client ID** (public, safe in client code) in the app's "Save / Cloud" panel. Setup steps are in README.md. Authorized JavaScript origin must be the Pages origin, e.g. `https://<user>.github.io`.

## Conventions when editing
- Keep everything in `App.jsx` unless a change is clearly reusable; the app is intentionally one file.
- After any change, run `npm run build` and confirm it compiles before committing.
- Preserve the two-decimal helper `r1()`, money formatting `fmtMoney()`, and the palette `C`.
- Seed/demo data lives in `seedData()` at the top of App.jsx.
