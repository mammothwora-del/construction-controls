import React, { useState, useMemo, useEffect, useRef } from "react";
import { driveEnsure, driveGetToken, driveFind, driveSave, driveLoad } from "./drive.js";
import {
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine, PieChart, Pie, Cell,
} from "recharts";
import {
  Plus, Trash2, Building2, ChevronDown, ChevronRight, Download,
  RotateCcw, TrendingUp, Hammer, CalendarRange, Percent, Banknote,
  ClipboardList, Ruler, Link2, Package, PencilRuler, RefreshCw,
  CheckCircle2, Hash, CalendarDays, Scale, LayoutDashboard,
  Cloud, UploadCloud, DownloadCloud, Save, LogIn,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Palette — a "project controls" instrument.                         */
/* ------------------------------------------------------------------ */
const C = {
  ink: "#15191F", ink2: "#222831", paper: "#FFFFFF", work: "#E6E8EC",
  line: "#D3D7DD", hair: "#E7EAEE", sub: "#6A727D",
  plan: "#2B6CB0", planSoft: "#Bcd2e8", actual: "#E08600", actualSoft: "#F4D9A6",
  ahead: "#2E8B57", behind: "#C2410C",
};

const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
.sc-mono{font-family:'IBM Plex Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums;}
.sc-disp{font-family:'Space Grotesk',system-ui,sans-serif;}
.sc-num::-webkit-outer-spin-button,.sc-num::-webkit-inner-spin-button{-webkit-appearance:none;margin:0;}
.sc-num{-moz-appearance:textfield;}
.sc-in{outline:none;border:1px solid ${C.line};border-radius:6px;background:${C.paper};}
.sc-in:focus{border-color:${C.plan};box-shadow:0 0 0 3px rgba(43,108,176,.15);}
.sc-row:hover{background:#F7F8FA;}
@media print{.sc-noprint{display:none!important;}}
`;

/* helpers */
let _id = 0;
const uid = () => `id${++_id}_${Math.random().toString(36).slice(2, 7)}`;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const num = (v) => { const n = parseFloat(String(v).replace(/,/g, "")); return isFinite(n) ? n : 0; };
const fmtMoney = (n, cur) => `${cur}${Math.round(n).toLocaleString("en-US")}`;
const r1 = (n) => Math.round(n * 10) / 10;

/* date helpers (UTC to avoid timezone drift) */
const DAY = 86400000;
const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const parseD = (s) => { const d = new Date(`${s}T00:00:00Z`); return isNaN(d.getTime()) ? null : d; };
const addDays = (d, n) => new Date(d.getTime() + n * DAY);
const addMonths = (d, n) => { const x = new Date(d.getTime()); const day = x.getUTCDate(); x.setUTCMonth(x.getUTCMonth() + n); if (x.getUTCDate() < day) x.setUTCDate(0); return x; };
const daysBetween = (a, b) => Math.round((b.getTime() - a.getTime()) / DAY);
const fmtD = (d) => `${String(d.getUTCDate()).padStart(2, "0")} ${MO[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`;

/* period ranges (in days from start) for a given granularity */
const periodsFor = (start, type, count) => {
  const arr = [];
  for (let k = 1; k <= count; k++) {
    let s, e;
    if (type === "month") { s = daysBetween(start, addMonths(start, k - 1)); e = daysBetween(start, addMonths(start, k)); }
    else { s = (k - 1) * 7; e = k * 7; }
    arr.push({ k, s, e });
  }
  return arr;
};
const overlap = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
/* redistribute a period-indexed map onto a new set of periods by date overlap,
   preserving the cumulative total (works for % and for quantities) */
const remapByDate = (map, oldR, newR) => {
  const acc = {};
  for (const o of oldR) {
    const raw = map[o.k];
    if (raw === undefined || raw === "") continue;
    const val = num(raw); const span = Math.max(1, o.e - o.s);
    for (const n of newR) { const ov = overlap(o.s, o.e, n.s, n.e); if (ov > 0) acc[n.k] = (acc[n.k] || 0) + val * ov / span; }
  }
  const res = {};
  for (const k in acc) res[k] = String(Math.round(acc[k] * 1000) / 1000);
  return res;
};

/* shared static styles */
const inS = { padding: "5px 8px", fontSize: 13 };
const labelS = { fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase", color: C.sub, fontWeight: 600 };

const itemVal = (it) => it.boq && it.boq.length ? it.boq.reduce((s, b) => s + num(b.qty) * num(b.rate), 0) : num(it.value);
const buildNo = (fmt, code, seq) => `${fmt.prefix}${fmt.sep}${code || "XX"}${fmt.sep}${String(seq).padStart(Math.max(1, fmt.digits || 3), "0")}`;

const MAT_STATUS = ["Pending", "Submitted", "Under review", "Approved", "Approved as noted", "Revise & resubmit", "Rejected"];
const SD_STATUS = ["Pending", "Submitted", "Under review", "Approved", "Approved with comments", "Revise & resubmit", "Rejected"];
const isApproved = (s) => /^Approved/.test(s);
const statusColor = (s) => {
  if (/^Approved/.test(s)) return C.ahead;
  if (/Reject/.test(s)) return C.behind;
  if (/Revise|review/i.test(s)) return C.actual;
  if (/Submitted/.test(s)) return C.plan;
  return C.sub;
};

const shapeCum = (t, type) => type === "linear" ? t : 0.5 - 0.5 * Math.cos(Math.PI * t);

/* numeric input — module scope so it keeps focus across renders */
function Num({ value, onChange, w = 70, align = "right", cls = "", suffix }) {
  return (
    <div style={{ position: "relative", width: w }}>
      <input className={`sc-in sc-num sc-mono ${cls}`} inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)}
        style={{ ...inS, width: "100%", textAlign: align, paddingRight: suffix ? 18 : 8 }} />
      {suffix && <span className="sc-mono" style={{ position: "absolute", right: 6, top: 6, fontSize: 11, color: C.sub }}>{suffix}</span>}
    </div>
  );
}

function Toggle({ options, value, onChange }) {
  return (
    <div style={{ display: "inline-flex", border: `1px solid ${C.line}`, borderRadius: 8, overflow: "hidden", background: C.paper }}>
      {options.map((o) => (
        <button key={o.v} onClick={() => onChange(o.v)}
          style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 11px", fontSize: 12.5, fontWeight: 600, border: "none", cursor: "pointer", background: value === o.v ? C.ink : "transparent", color: value === o.v ? "#fff" : C.ink2 }}>
          {o.icon}{o.label}
        </button>
      ))}
    </div>
  );
}

function FormatBar({ fmt, setFmt, code0, onRenumber }) {
  return (
    <div style={{ background: "#EEF4FA", border: `1px solid ${C.planSoft}`, borderRadius: 10, padding: "10px 14px", display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end" }}>
      <div><div style={labelS}>Doc no. prefix</div><input value={fmt.prefix} onChange={(e) => setFmt({ ...fmt, prefix: e.target.value })} className="sc-in sc-mono" style={{ ...inS, width: 220, marginTop: 4 }} /></div>
      <div><div style={labelS}>Sep.</div><input value={fmt.sep} onChange={(e) => setFmt({ ...fmt, sep: e.target.value })} className="sc-in sc-mono" style={{ ...inS, width: 44, textAlign: "center", marginTop: 4 }} /></div>
      <div><div style={labelS}>Digits</div><div style={{ marginTop: 4 }}><Num value={fmt.digits} onChange={(v) => setFmt({ ...fmt, digits: Math.max(1, Math.min(6, Math.round(num(v)) || 3)) })} w={54} align="center" /></div></div>
      <div style={{ flex: 1, minWidth: 180 }}><div style={labelS}>Preview</div><div className="sc-mono" style={{ marginTop: 6, fontSize: 13, color: C.plan, fontWeight: 600 }}>{buildNo(fmt, code0 || "ST", 1)}</div></div>
      <button onClick={onRenumber} className="sc-noprint" style={{ display: "flex", alignItems: "center", gap: 6, background: C.ink, color: "#fff", border: "none", borderRadius: 8, padding: "8px 13px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}><RefreshCw size={14} /> Renumber all</button>
    </div>
  );
}

const MAT_FMT = { prefix: "ARY-ARCH-FPIT-MAT", sep: "-", digits: 3 };
const SD_FMT = { prefix: "ARY-ARCH-FPIT-SHD", sep: "-", digits: 3 };
const PROJ_START = "2025-01-01";
const CAT_COLORS = ["#2B6CB0", "#E08600", "#2E8B57", "#7C3AED", "#0EA5E9", "#DB2777", "#CA8A04", "#0D9488", "#9333EA", "#DC2626", "#4F46E5", "#65A30D"];
const catColor = (i) => CAT_COLORS[i % CAT_COLORS.length];

/* ------------------------------------------------------------------ */
/*  Seed data                                                          */
/* ------------------------------------------------------------------ */
const seedData = () => {
  const L = (desc, unit, qty, rate, actualRate) => ({ id: uid(), desc, unit, qty: String(qty), rate: String(rate), actualRate: String(actualRate == null ? rate : actualRate) });
  const cats = [];
  const done = {};
  const cat = (name, code) => { const c = { id: uid(), name, code, open: true, items: [] }; cats.push(c); return c; };
  const item = (c, name, startDate, days, lines) => { c.items.push({ id: uid(), name, value: "", startDate, days, boq: lines }); };

  const c1 = cat("Structure work", "ST");
  const piles = L("Bored piles Ø0.60m", "m", 4000, 1500, 1400);
  const pcap = L("Pile caps (concrete)", "m³", 400, 5000, 4800);
  item(c1, "Piling work", "2025-01-01", 60, [piles, pcap]);
  const ftg = L("Footing concrete", "m³", 500, 6000, 6200);
  const reb = L("Reinforcement", "ton", 250, 12000, 11500);
  item(c1, "Foundation work", "2025-02-01", 90, [ftg, reb]);
  const frame = L("RC columns, beams & slabs", "m³", 2000, 6000, 5900);
  const form = L("Formwork", "m²", 8000, 500, 520);
  item(c1, "Superstructure (RC)", "2025-03-01", 180, [frame, form]);

  cat("Architecture work", "AR"); item(cats[1], "Architectural & finishing", "2025-06-01", 180, [L("Masonry & plaster", "m²", 7000, 1200, 1150), L("Floor, wall & ceiling finishes", "m²", 5600, 1000, 1020)]);
  cat("Electrical work", "EL"); item(cats[2], "Electrical system", "2025-07-01", 150, [L("Wiring & conduit", "point", 700, 6000, 5800), L("Distribution boards", "no.", 14, 200000, 195000)]);
  cat("Plumbing work", "PL"); item(cats[3], "Sanitary & plumbing", "2025-07-01", 150, [L("Sanitary fixtures", "no.", 100, 30000, 31000), L("Supply & drainage piping", "m", 4000, 500, 480)]);
  cat("Fire protection work", "FP"); item(cats[4], "Fire protection system", "2025-08-01", 120, [L("Sprinkler & suppression system", "LS", 1, 4000000, 3850000)]);
  cat("Ventilation work", "VE"); item(cats[5], "HVAC / ventilation", "2025-08-01", 120, [L("HVAC units & ducting", "LS", 1, 4500000, 4400000)]);
  cat("External work", "EX"); item(cats[6], "External & landscape", "2025-10-01", 90, [L("Hardscape & landscape", "m²", 2200, 2500, 2450)]);

  done[piles.id] = { 1: "2500", 2: "1500" };
  done[pcap.id] = { 2: "400" };
  done[ftg.id] = { 2: "120", 3: "260" };
  done[reb.id] = { 2: "60", 3: "120" };
  done[frame.id] = { 3: "250" };
  done[form.id] = { 3: "1800" };

  const materials = [], shops = [];
  const addM = (ci, name, maker, status) => { const c = cats[ci]; const seq = materials.filter((m) => m.catId === c.id).length + 1; materials.push({ id: uid(), catId: c.id, no: buildNo(MAT_FMT, c.code, seq), name, maker, submitted: "", status, approved: "", remarks: "" }); };
  const addS = (ci, title, rev, status) => { const c = cats[ci]; const seq = shops.filter((s) => s.catId === c.id).length + 1; shops.push({ id: uid(), catId: c.id, no: buildNo(SD_FMT, c.code, seq), title, rev, submitted: "", status, approved: "", remarks: "" }); };

  addM(0, "Reinforcement steel SD40", "SYS / Tata", "Approved");
  addM(0, "Ready-mixed concrete C35/45", "CPAC / SCG", "Approved");
  addM(0, "Bored pile reinforcement cage", "—", "Submitted");
  addM(1, "Ceramic floor tile 600×600", "COTTO", "Submitted");
  addM(1, "Aluminium window & curtain wall", "TOSTEM", "Under review");
  addM(2, "LV main switchboard (MDB)", "ABB / Schneider", "Pending");
  addM(2, "XLPE power cable 0.6/1kV", "Bangkok Cable", "Approved");
  addM(3, "PPR pipe & fittings", "SCG", "Submitted");
  addM(4, "Electric fire pump set", "Ebara", "Pending");
  addM(5, "Split-type air conditioner", "Daikin", "Pending");
  addM(6, "Concrete paving block", "SCG", "Pending");

  addS(0, "Bored pile layout plan", "0", "Approved");
  addS(0, "Pile cap & footing details", "A", "Submitted");
  addS(0, "Column & beam schedule", "0", "Under review");
  addS(1, "Architectural floor plan & finishes", "0", "Submitted");
  addS(1, "Typical toilet & wet-area detail", "0", "Pending");
  addS(2, "Electrical single-line diagram", "0", "Submitted");
  addS(3, "Sanitary & drainage riser diagram", "0", "Pending");
  addS(4, "Fire protection layout", "0", "Pending");
  addS(5, "HVAC ductwork layout", "0", "Pending");
  addS(6, "Site drainage & external layout", "0", "Pending");

  return { cats, done, materials, shops };
};
const SEED = seedData();

export default function SCurveApp() {
  const [tab, setTab] = useState("dash");
  const [project, setProject] = useState("New Building Project");
  const [startDate, setStartDate] = useState(PROJ_START);
  const [periodType, setPeriodType] = useState("month");   // month | week
  const [periodCount, setPeriodCount] = useState(12);
  const [mode, setMode] = useState("amount");
  const [curve, setCurve] = useState("scurve");
  const [cur, setCur] = useState("฿");
  const [cats, setCats] = useState(SEED.cats);
  const [actuals, setActuals] = useState({ 1: "2", 2: "3.5", 3: "6", 4: "8" });
  const [planOv, setPlanOv] = useState({});
  const [actualSrc, setActualSrc] = useState("manual");
  const [boqDone, setBoqDone] = useState(SEED.done);
  const [reportPeriod, setReportPeriod] = useState(3);
  const [materials, setMaterials] = useState(SEED.materials);
  const [shops, setShops] = useState(SEED.shops);
  const [matFmt, setMatFmt] = useState(MAT_FMT);
  const [sdFmt, setSdFmt] = useState(SD_FMT);

  /* ---------- persistence: localStorage autosave + Google Drive sync ---------- */
  const [cloudOpen, setCloudOpen] = useState(false);
  const DEFAULT_GOOGLE_CLIENT_ID = "239308933463-c7otd4pgh8otra6rign29p05pbn9c90d.apps.googleusercontent.com";
  const [clientId, setClientId] = useState(() => { try { return localStorage.getItem("ccx-clientId") || DEFAULT_GOOGLE_CLIENT_ID; } catch (e) { return DEFAULT_GOOGLE_CLIENT_ID; } });
  const [fileId, setFileId] = useState(() => { try { return localStorage.getItem("ccx-fileId") || ""; } catch (e) { return ""; } });
  const [cloud, setCloud] = useState({ signedIn: false, busy: false, status: "" });
  const hydrated = useRef(false);
  const drivingRef = useRef(false);

  const snapshot = () => ({ v: 1, project, startDate, periodType, periodCount, mode, curve, cur, cats, actuals, planOv, actualSrc, boqDone, reportPeriod, materials, shops, matFmt, sdFmt });
  const applySnapshot = (s) => {
    if (!s || typeof s !== "object") return;
    if (s.project !== undefined) setProject(s.project);
    if (s.startDate) setStartDate(s.startDate);
    if (s.periodType) setPeriodType(s.periodType);
    if (s.periodCount) setPeriodCount(s.periodCount);
    if (s.mode) setMode(s.mode);
    if (s.curve) setCurve(s.curve);
    if (s.cur) setCur(s.cur);
    if (Array.isArray(s.cats)) setCats(s.cats);
    if (s.actuals) setActuals(s.actuals);
    if (s.planOv) setPlanOv(s.planOv);
    if (s.actualSrc) setActualSrc(s.actualSrc);
    if (s.boqDone) setBoqDone(s.boqDone);
    if (s.reportPeriod) setReportPeriod(s.reportPeriod);
    if (Array.isArray(s.materials)) setMaterials(s.materials);
    if (Array.isArray(s.shops)) setShops(s.shops);
    if (s.matFmt) setMatFmt(s.matFmt);
    if (s.sdFmt) setSdFmt(s.sdFmt);
  };

  useEffect(() => { try { const raw = localStorage.getItem("ccx-state"); if (raw) applySnapshot(JSON.parse(raw)); } catch (e) {} hydrated.current = true; }, []);
  const snapJson = JSON.stringify(snapshot());
  useEffect(() => { if (!hydrated.current) return; const t = setTimeout(() => { try { localStorage.setItem("ccx-state", snapJson); } catch (e) {} }, 500); return () => clearTimeout(t); }, [snapJson]);

  const saveClientId = (v) => { setClientId(v); try { localStorage.setItem("ccx-clientId", v); } catch (e) {} };
  const connectDrive = async () => {
    if (!clientId) { setCloud((c) => ({ ...c, status: "Enter your Google OAuth Client ID first." })); return; }
    try { setCloud((c) => ({ ...c, busy: true, status: "Connecting\u2026" })); await driveEnsure(); await driveGetToken(clientId, true); setCloud({ signedIn: true, busy: false, status: "Connected to Google Drive." }); }
    catch (e) { setCloud({ signedIn: false, busy: false, status: "Sign-in failed: " + ((e && e.message) || e) }); }
  };
  const saveToDrive = async (auto) => {
    if (drivingRef.current) return;
    drivingRef.current = true;
    try {
      setCloud((c) => ({ ...c, busy: true, status: auto ? "Auto-saving\u2026" : "Saving\u2026" })); await driveEnsure(); await driveGetToken(clientId, false);
      let id = fileId || await driveFind("construction-controls.json");
      const newId = await driveSave(id, "construction-controls.json", snapshot());
      setFileId(newId); try { localStorage.setItem("ccx-fileId", newId); } catch (e) {}
      setCloud({ signedIn: true, busy: false, status: (auto ? "Auto-saved to Drive \u00b7 " : "Saved to Drive \u00b7 ") + new Date().toLocaleTimeString() });
    } catch (e) { setCloud((c) => ({ ...c, busy: false, status: "Save failed: " + ((e && e.message) || e) })); }
    finally { drivingRef.current = false; }
  };
  useEffect(() => {
    if (!hydrated.current || !cloud.signedIn) return;
    const t = setTimeout(() => { saveToDrive(true); }, 3000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapJson, cloud.signedIn]);
  const loadFromDrive = async () => {
    try {
      setCloud((c) => ({ ...c, busy: true, status: "Loading\u2026" })); await driveEnsure(); await driveGetToken(clientId, false);
      const id = fileId || await driveFind("construction-controls.json");
      if (!id) { setCloud((c) => ({ ...c, busy: false, status: "No saved file found in Drive yet." })); return; }
      const obj = await driveLoad(id); applySnapshot(obj); setFileId(id); try { localStorage.setItem("ccx-fileId", id); } catch (e) {}
      setCloud({ signedIn: true, busy: false, status: "Loaded from Drive." });
    } catch (e) { setCloud((c) => ({ ...c, busy: false, status: "Load failed: " + ((e && e.message) || e) })); }
  };
  const exportJSON = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(snapshot(), null, 2)], { type: "application/json" })); a.download = (project.replace(/\s+/g, "_") || "project") + ".json"; a.click(); URL.revokeObjectURL(a.href); };
  const importJSON = (file) => { const r = new FileReader(); r.onload = () => { try { applySnapshot(JSON.parse(r.result)); } catch (e) {} }; r.readAsText(file); };

  const P = Math.max(1, Math.min(260, periodCount || 1));
  const RP = Math.max(1, Math.min(P, reportPeriod));
  const projStart = parseD(startDate) || parseD(PROJ_START);
  const isMonth = periodType === "month";
  const periodWord = isMonth ? "Month" : "Week";

  /* period calendar */
  const periods = useMemo(() => {
    const arr = [];
    for (let k = 1; k <= P; k++) {
      let s, e, date;
      if (isMonth) { date = addMonths(projStart, k - 1); s = daysBetween(projStart, date); e = daysBetween(projStart, addMonths(projStart, k)); }
      else { s = (k - 1) * 7; e = k * 7; date = addDays(projStart, s); }
      arr.push({ k, startDay: s, endDay: e, date, label: (isMonth ? "M" : "W") + k });
    }
    return arr;
  }, [startDate, periodType, P]);
  const lastEndDay = periods.length ? periods[periods.length - 1].endDay : 0;
  const projEnd = addDays(projStart, lastEndDay);

  /* ---- weights ---- */
  const flat = useMemo(() => cats.flatMap((c) => c.items.map((it) => {
    const sd = parseD(it.startDate) || projStart;
    return { ...it, v: itemVal(it), catId: c.id, isd: daysBetween(projStart, sd), idays: Math.max(1, num(it.days)) };
  })), [cats, startDate]);
  const total = useMemo(() => flat.reduce((s, it) => s + it.v, 0), [flat]);
  const boqLines = useMemo(() => cats.flatMap((c) => c.items.flatMap((it) => (it.boq || []).map((b) => ({ ...b })))), [cats]);

  const planAuto = useMemo(() => {
    const arr = Array(P + 1).fill(0);
    if (total <= 0) return arr;
    for (const it of flat) {
      const w = it.v / total;
      for (const p of periods) {
        const f = shapeCum(clamp01((p.endDay - it.isd) / it.idays), curve) - shapeCum(clamp01((p.startDay - it.isd) / it.idays), curve);
        arr[p.k] += w * 100 * f;
      }
    }
    return arr;
  }, [flat, total, periods, curve]);

  const boqPeriod = useMemo(() => {
    const arr = Array(P + 1).fill(0);
    if (total <= 0) return arr;
    for (const ln of boqLines) { const map = boqDone[ln.id] || {}; const rate = num(ln.rate); for (const p of periods) arr[p.k] += (num(map[p.k]) * rate / total) * 100; }
    return arr;
  }, [boqLines, boqDone, total, periods]);

  const rows = useMemo(() => {
    let pc = 0, ac = 0;
    return periods.map((p) => {
      const m = p.k;
      const pOv = planOv[m];
      const plan = pOv === undefined || pOv === "" ? planAuto[m] : num(pOv);
      let hasA, act;
      if (actualSrc === "boq") { hasA = m <= RP; act = hasA ? boqPeriod[m] : 0; }
      else { hasA = actuals[m] !== undefined && actuals[m] !== ""; act = hasA ? num(actuals[m]) : 0; }
      pc += plan; if (hasA) ac += act;
      return { m, label: p.label, date: p.date, planPeriod: plan, planCum: pc, actualPeriod: hasA ? act : null, actualCum: hasA ? ac : null, hasActual: hasA, variance: hasA ? ac - pc : null, overridden: !(pOv === undefined || pOv === "") };
    });
  }, [planAuto, planOv, actuals, actualSrc, boqPeriod, RP, periods]);

  const dataDate = useMemo(() => { if (actualSrc === "boq") return RP; let last = 0; rows.forEach((r) => { if (r.hasActual) last = r.m; }); return last; }, [actualSrc, RP, rows]);
  const here = dataDate > 0 ? rows[dataDate - 1] : null;
  const dataLabel = dataDate > 0 && rows[dataDate - 1] ? rows[dataDate - 1].label : "";
  const planEnd = rows.length ? rows[rows.length - 1].planCum : 0;
  const percentSum = mode === "percent" ? total : null;

  /* BOQ progress + profit/loss */
  const setDone = (id, m, v) => setBoqDone((d) => ({ ...d, [id]: { ...(d[id] || {}), [m]: v } }));
  const cumDone = (id, upto) => { const map = boqDone[id] || {}; let s = 0; for (let k = 1; k <= upto; k++) s += num(map[k]); return s; };
  const setActualCum = (id, val) => { if (val === "") { setDone(id, RP, ""); return; } const before = cumDone(id, RP - 1); setDone(id, RP, String(num(val) - before)); };
  const earnedTo = (upto) => boqLines.reduce((s, ln) => s + cumDone(ln.id, upto) * num(ln.rate), 0);
  const projCost = useMemo(() => boqLines.reduce((s, ln) => s + num(ln.qty) * num(ln.actualRate), 0), [boqLines]);
  const projPL = total - projCost;
  const margin = total > 0 ? projPL / total * 100 : 0;

  /* ---- per-category rollup (for the dashboard), as of reporting period RP ---- */
  const Dend = periods[RP - 1] ? periods[RP - 1].endDay : 0;
  const catSummary = useMemo(() => cats.map((c, ci) => {
    let value = 0, planned = 0, earned = 0, pl = 0;
    for (const it of c.items) {
      const v = itemVal(it);
      value += v;
      const sd = parseD(it.startDate) || projStart;
      const isd = daysBetween(projStart, sd);
      const idays = Math.max(1, num(it.days));
      planned += v * shapeCum(clamp01((Dend - isd) / idays), curve);
      for (const b of (it.boq || [])) { earned += cumDone(b.id, RP) * num(b.rate); pl += (num(b.rate) - num(b.actualRate)) * num(b.qty); }
    }
    return { id: c.id, name: c.name, code: c.code, ci, value, planned, earned, pl, color: catColor(ci), weight: total > 0 ? value / total * 100 : 0, actualPct: value > 0 ? earned / value * 100 : 0, planPct: value > 0 ? planned / value * 100 : 0 };
  }), [cats, Dend, RP, curve, boqDone, total, startDate]);
  const totalEarned = catSummary.reduce((s, c) => s + c.earned, 0);
  const totalPlannedVal = catSummary.reduce((s, c) => s + c.planned, 0);
  const overallActual = total > 0 ? totalEarned / total * 100 : 0;
  const overallPlan = total > 0 ? totalPlannedVal / total * 100 : 0;
  const overallVar = overallActual - overallPlan;
  const pieData = catSummary.filter((c) => c.earned > 0);

  /* ---- mutations: WBS ---- */
  const upCat = (id, patch) => setCats((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const upItem = (cid, iid, patch) => setCats((cs) => cs.map((c) => c.id !== cid ? c : { ...c, items: c.items.map((it) => it.id === iid ? { ...it, ...patch } : it) }));
  const addItem = (cid) => setCats((cs) => cs.map((c) => c.id !== cid ? c : { ...c, open: true, items: [...c.items, { id: uid(), name: "New item", value: "0", startDate: startDate, days: 30, boq: [] }] }));
  const delItem = (cid, iid) => setCats((cs) => cs.map((c) => c.id !== cid ? c : { ...c, items: c.items.filter((it) => it.id !== iid) }));
  const addCat = () => setCats((cs) => [...cs, { id: uid(), name: "New work category", code: "XX", open: true, items: [{ id: uid(), name: "Item 1", value: "0", startDate: startDate, days: 30, boq: [] }] }]);
  const delCat = (id) => { setCats((cs) => cs.filter((c) => c.id !== id)); setMaterials((ms) => ms.filter((m) => m.catId !== id)); setShops((ss) => ss.filter((s) => s.catId !== id)); };

  const addBoq = (cid, iid) => setCats((cs) => cs.map((c) => c.id !== cid ? c : { ...c, items: c.items.map((it) => it.id !== iid ? it : { ...it, boq: [...(it.boq || []), { id: uid(), desc: "New line", unit: "m²", qty: "0", rate: "0", actualRate: "0" }] }) }));
  const upBoq = (cid, iid, lid, patch) => setCats((cs) => cs.map((c) => c.id !== cid ? c : { ...c, items: c.items.map((it) => it.id !== iid ? it : { ...it, boq: it.boq.map((b) => b.id === lid ? { ...b, ...patch } : b) }) }));
  const delBoq = (cid, iid, lid) => setCats((cs) => cs.map((c) => c.id !== cid ? c : { ...c, items: c.items.map((it) => it.id !== iid ? it : { ...it, boq: it.boq.filter((b) => b.id !== lid) }) }));

  /* ---- mutations: registers ---- */
  const addMat = (catId) => setMaterials((ms) => { const c = cats.find((x) => x.id === catId); const seq = ms.filter((m) => m.catId === catId).length + 1; return [...ms, { id: uid(), catId, no: buildNo(matFmt, c && c.code, seq), name: "New material", maker: "", submitted: "", status: "Pending", approved: "", remarks: "" }]; });
  const upMat = (id, patch) => setMaterials((ms) => ms.map((m) => m.id === id ? { ...m, ...patch } : m));
  const delMat = (id) => setMaterials((ms) => ms.filter((m) => m.id !== id));
  const renumberMat = () => setMaterials((ms) => { const out = []; for (const c of cats) { let seq = 0; for (const m of ms) if (m.catId === c.id) { seq++; out.push({ ...m, no: buildNo(matFmt, c.code, seq) }); } } for (const m of ms) if (!cats.some((c) => c.id === m.catId)) out.push(m); return out; });

  const addSd = (catId) => setShops((ss) => { const c = cats.find((x) => x.id === catId); const seq = ss.filter((s) => s.catId === catId).length + 1; return [...ss, { id: uid(), catId, no: buildNo(sdFmt, c && c.code, seq), title: "New drawing", rev: "0", submitted: "", status: "Pending", approved: "", remarks: "" }]; });
  const upSd = (id, patch) => setShops((ss) => ss.map((s) => s.id === id ? { ...s, ...patch } : s));
  const delSd = (id) => setShops((ss) => ss.filter((s) => s.id !== id));
  const renumberSd = () => setShops((ss) => { const out = []; for (const c of cats) { let seq = 0; for (const s of ss) if (s.catId === c.id) { seq++; out.push({ ...s, no: buildNo(sdFmt, c.code, seq) }); } } for (const s of ss) if (!cats.some((c) => c.id === s.catId)) out.push(s); return out; });

  const changePeriodType = (t) => {
    if (t === periodType) return;
    const oldCount = P;
    const newCount = t === "week" ? Math.min(260, Math.round(oldCount * 4.345)) : Math.max(1, Math.round(oldCount / 4.345));
    const oldR = periodsFor(projStart, periodType, oldCount);
    const newR = periodsFor(projStart, t, newCount);
    setActuals((a) => remapByDate(a, oldR, newR));
    setPlanOv((o) => remapByDate(o, oldR, newR));
    setBoqDone((d) => { const nd = {}; for (const id in d) nd[id] = remapByDate(d[id], oldR, newR); return nd; });
    setReportPeriod((rp) => { const or = oldR[Math.max(1, Math.min(oldCount, rp)) - 1]; const mid = (or.s + or.e) / 2; const nr = newR.find((x) => x.s <= mid && mid < x.e) || newR[newR.length - 1]; return nr ? nr.k : 1; });
    setPeriodCount(newCount);
    setPeriodType(t);
  };

  const exportCSV = () => {
    try {
      const head = [periodWord, "Date", "Plan %", "Plan cum %", "Actual %", "Actual cum %", "Variance %"];
      const body = rows.map((r) => [r.label, fmtD(r.date), r1(r.planPeriod), r1(r.planCum), r.actualPeriod == null ? "" : r1(r.actualPeriod), r.actualCum == null ? "" : r1(r.actualCum), r.variance == null ? "" : r1(r.variance)].join(","));
      const csv = [head.join(","), ...body].join("\n");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
      a.download = `${project.replace(/\s+/g, "_")}_scurve.csv`;
      a.click(); URL.revokeObjectURL(a.href);
    } catch (e) { /* ignore */ }
  };

  const TabBtn = ({ id, icon, label }) => (
    <button onClick={() => setTab(id)} className="sc-disp" style={{ display: "flex", alignItems: "center", gap: 7, padding: "11px 16px", border: "none", cursor: "pointer", background: "transparent", color: tab === id ? "#fff" : "#9AA3AE", fontWeight: 700, fontSize: 13.5, borderBottom: `3px solid ${tab === id ? C.actual : "transparent"}`, whiteSpace: "nowrap" }}>{icon}{label}</button>
  );
  const periodOptions = periods.map((p) => <option key={p.k} value={p.k}>{`${p.label} · ${fmtD(p.date)}`}</option>);

  return (
    <div className="sc-mono" style={{ background: C.work, minHeight: "100%", color: C.ink, fontFamily: "Inter, system-ui, sans-serif" }}>
      <style>{FONTS}</style>

      {/* Header */}
      <header style={{ background: C.ink, color: "#fff", padding: "16px 22px 0" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16, justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 9, background: C.actual, display: "grid", placeItems: "center" }}><TrendingUp size={22} color={C.ink} /></div>
            <div>
              <div className="sc-disp" style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.1 }}>Construction S-Curve <span style={{ color: C.actual }}>/ Project Controls</span></div>
              <div style={{ fontSize: 11.5, color: "#9AA3AE", letterSpacing: ".04em" }}>S-curve · BOQ & cost · material & shop-drawing submittals</div>
            </div>
          </div>
          <div className="sc-noprint" style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setPlanOv({})} title="Reset planned curve to auto" style={{ display: "flex", alignItems: "center", gap: 6, background: "#2A313B", color: "#fff", border: "1px solid #3A434F", borderRadius: 8, padding: "8px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}><RotateCcw size={15} /> Auto plan</button>
            <button onClick={exportCSV} style={{ display: "flex", alignItems: "center", gap: 6, background: C.actual, color: C.ink, border: "none", borderRadius: 8, padding: "8px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}><Download size={15} /> Export CSV</button>
            <button onClick={() => setCloudOpen((o) => !o)} title="Save / cloud sync" style={{ display: "flex", alignItems: "center", gap: 6, background: cloud.signedIn ? "#1f6f43" : "#2A313B", color: "#fff", border: "1px solid #3A434F", borderRadius: 8, padding: "8px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}><Cloud size={15} /> Save / Cloud</button>
          </div>
        </div>
        <div className="sc-noprint" style={{ display: "flex", flexWrap: "wrap", gap: 2, marginTop: 10 }}>
          <TabBtn id="dash" icon={<LayoutDashboard size={16} />} label="Dashboard" />
          <TabBtn id="scurve" icon={<TrendingUp size={16} />} label="S-Curve & Schedule" />
          <TabBtn id="boq" icon={<ClipboardList size={16} />} label="BOQ & Cost" />
          <TabBtn id="material" icon={<Package size={16} />} label="Materials" />
          <TabBtn id="shop" icon={<PencilRuler size={16} />} label="Shop Drawings" />
        </div>
      </header>

      {/* Settings */}
      <div className="sc-noprint" style={{ background: C.ink2, padding: "12px 22px", display: "flex", flexWrap: "wrap", gap: 22, alignItems: "flex-end" }}>
        <div><div style={{ ...labelS, color: "#8E97A2" }}>Project name</div><input value={project} onChange={(e) => setProject(e.target.value)} className="sc-in sc-disp" style={{ ...inS, width: 220, fontWeight: 600, marginTop: 4 }} /></div>
        {(tab === "dash" || tab === "scurve" || tab === "boq") && (
          <>
            <div><div style={{ ...labelS, color: "#8E97A2", display: "flex", gap: 5, alignItems: "center" }}><CalendarDays size={12} /> Project start</div><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="sc-in sc-mono" style={{ ...inS, width: 150, marginTop: 4 }} /></div>
            <div><div style={{ ...labelS, color: "#8E97A2" }}>Progress period</div><div style={{ marginTop: 4 }}><Toggle value={periodType} onChange={changePeriodType} options={[{ v: "month", label: "Monthly" }, { v: "week", label: "Weekly" }]} /></div></div>
            <div><div style={{ ...labelS, color: "#8E97A2", display: "flex", gap: 5, alignItems: "center" }}><CalendarRange size={12} /> {periodWord}s</div><div style={{ marginTop: 4 }}><Num value={periodCount} onChange={(v) => setPeriodCount(Math.max(1, Math.min(260, Math.round(num(v)) || 1)))} w={74} align="center" /></div></div>
            <div><div style={{ ...labelS, color: "#8E97A2" }}>Currency</div><input value={cur} onChange={(e) => setCur(e.target.value)} className="sc-in sc-mono" style={{ ...inS, width: 56, textAlign: "center", marginTop: 4 }} /></div>
            {(tab === "scurve" || tab === "boq") && (
              <div><div style={{ ...labelS, color: "#8E97A2", display: "flex", gap: 5, alignItems: "center" }}><Link2 size={12} /> Actual progress from</div><div style={{ marginTop: 4, display: "flex", gap: 8, alignItems: "center" }}><Toggle value={actualSrc} onChange={setActualSrc} options={[{ v: "manual", label: "Manual %" }, { v: "boq", label: "BOQ qty" }]} />{actualSrc === "boq" && <select value={RP} onChange={(e) => setReportPeriod(num(e.target.value))} className="sc-in sc-mono" style={{ ...inS, paddingRight: 4 }}>{periodOptions}</select>}</div></div>
            )}
          </>
        )}
        {tab === "scurve" && (
          <>
            <div><div style={{ ...labelS, color: "#8E97A2" }}>Plan distribution</div><div style={{ marginTop: 4 }}><Toggle value={curve} onChange={setCurve} options={[{ v: "scurve", label: "S-curve" }, { v: "linear", label: "Linear" }]} /></div></div>
            <div><div style={{ ...labelS, color: "#8E97A2" }}>Item input</div><div style={{ marginTop: 4 }}><Toggle value={mode} onChange={setMode} options={[{ v: "amount", label: "Amount", icon: <Banknote size={13} /> }, { v: "percent", label: "Percent", icon: <Percent size={13} /> }]} /></div></div>
          </>
        )}
      </div>

      {cloudOpen && (
        <div className="sc-noprint" style={{ background: "#0F1216", color: "#fff", padding: "14px 22px", borderTop: "1px solid #2A313B" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end" }}>
            <div style={{ flex: 1, minWidth: 260 }}>
              <div style={{ ...labelS, color: "#8E97A2", display: "flex", gap: 6, alignItems: "center" }}><Cloud size={13} /> Google OAuth Client ID</div>
              <input value={clientId} onChange={(e) => saveClientId(e.target.value)} placeholder="xxxxx.apps.googleusercontent.com" className="sc-in sc-mono" style={{ ...inS, width: "100%", marginTop: 4 }} />
            </div>
            <button onClick={connectDrive} disabled={cloud.busy} style={{ display: "flex", alignItems: "center", gap: 6, background: cloud.signedIn ? "#1f6f43" : C.plan, color: "#fff", border: "none", borderRadius: 8, padding: "9px 13px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}><LogIn size={15} /> {cloud.signedIn ? "Connected" : "Connect Google Drive"}</button>
            <button onClick={() => saveToDrive(false)} disabled={cloud.busy} style={{ display: "flex", alignItems: "center", gap: 6, background: C.actual, color: C.ink, border: "none", borderRadius: 8, padding: "9px 13px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}><UploadCloud size={15} /> Save to Drive</button>
            <button onClick={loadFromDrive} disabled={cloud.busy} style={{ display: "flex", alignItems: "center", gap: 6, background: "#2A313B", color: "#fff", border: "1px solid #3A434F", borderRadius: 8, padding: "9px 13px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}><DownloadCloud size={15} /> Load from Drive</button>
            <div style={{ width: 1, height: 30, background: "#2A313B" }} />
            <button onClick={exportJSON} style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", color: "#fff", border: "1px solid #3A434F", borderRadius: 8, padding: "9px 13px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}><Save size={15} /> Download .json</button>
            <label style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", color: "#fff", border: "1px solid #3A434F", borderRadius: 8, padding: "9px 13px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>Open .json<input type="file" accept="application/json,.json" style={{ display: "none" }} onChange={(e) => e.target.files[0] && importJSON(e.target.files[0])} /></label>
          </div>
          <div style={{ marginTop: 8, fontSize: 11.5, color: "#9AA3AE" }}>{cloud.status || (cloud.signedIn ? "Connected \u2014 changes auto-save to Drive a few seconds after you stop editing." : "Your work autosaves in this browser. Add your Google OAuth Client ID and connect to also auto-save to your Drive \u2014 setup steps are in README.md.")}</div>
        </div>
      )}

      {/* ============================ DASHBOARD TAB ============================ */}
      {tab === "dash" && (
        <div style={{ padding: 18, display: "grid", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div className="sc-disp" style={{ fontWeight: 700, fontSize: 17 }}>{project} · Dashboard</div>
            <span style={labelS}>As of</span>
            <select value={RP} onChange={(e) => setReportPeriod(num(e.target.value))} className="sc-in sc-mono" style={{ ...inS }}>{periodOptions}</select>
            <span style={{ ...labelS, color: C.sub }}>· actual progress &amp; earned value computed from BOQ quantities</span>
          </div>

          {/* KPI tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
            {[
              { k: "Contract value", v: fmtMoney(total, cur), c: C.ink },
              { k: "Actual to date", v: `${r1(overallActual)}%`, sub: `${fmtMoney(totalEarned, cur)} earned`, c: C.actual },
              { k: "Planned to date", v: `${r1(overallPlan)}%`, c: C.plan },
              { k: "Variance", v: `${overallVar >= 0 ? "+" : ""}${r1(overallVar)}%`, sub: overallVar >= 0 ? "ahead of schedule" : "behind schedule", c: overallVar >= 0 ? C.ahead : C.behind },
              { k: "Remaining value", v: fmtMoney(total - totalEarned, cur), c: C.sub },
              { k: "Projected margin", v: `${margin >= 0 ? "+" : ""}${r1(margin)}%`, sub: `${projPL >= 0 ? "+" : "−"}${fmtMoney(Math.abs(projPL), cur)}`, c: margin >= 0 ? C.ahead : C.behind },
            ].map((s) => (
              <div key={s.k} style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 12, padding: "12px 14px" }}>
                <div style={labelS}>{s.k}</div>
                <div className="sc-mono" style={{ fontSize: 21, fontWeight: 600, color: s.c, marginTop: 3, lineHeight: 1 }}>{s.v}</div>
                {s.sub && <div style={{ fontSize: 11, color: s.c, fontWeight: 600, marginTop: 4 }}>{s.sub}</div>}
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit,minmax(360px,1fr))" }}>
            {/* Earned-value composition donut */}
            <section style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 14, overflow: "hidden" }}>
              <div style={{ padding: "13px 16px", borderBottom: `1px solid ${C.hair}`, display: "flex", alignItems: "center", gap: 9 }}>
                <Scale size={16} color={C.plan} /><div className="sc-disp" style={{ fontWeight: 700, fontSize: 15 }}>Work done by category</div>
                <span style={{ ...labelS, marginLeft: "auto" }}>share of earned value</span>
              </div>
              {totalEarned > 0 ? (
                <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", padding: "14px 16px" }}>
                  <div style={{ position: "relative", width: 190, height: 190 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={pieData} dataKey="earned" nameKey="name" innerRadius={60} outerRadius={90} paddingAngle={1} stroke="none">
                          {pieData.map((d) => <Cell key={d.id} fill={d.color} />)}
                        </Pie>
                        <Tooltip formatter={(v, n) => [fmtMoney(v, cur), n]} contentStyle={{ borderRadius: 10, border: `1px solid ${C.line}`, fontFamily: "IBM Plex Mono", fontSize: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none" }}>
                      <div style={{ textAlign: "center" }}>
                        <div className="sc-mono" style={{ fontSize: 22, fontWeight: 700, color: C.actual, lineHeight: 1 }}>{r1(overallActual)}%</div>
                        <div style={{ fontSize: 10, color: C.sub, letterSpacing: ".05em" }}>OVERALL ACTUAL</div>
                      </div>
                    </div>
                  </div>
                  <div style={{ flex: 1, minWidth: 180, display: "grid", gap: 6 }}>
                    {catSummary.map((c) => {
                      const share = totalEarned > 0 ? c.earned / totalEarned * 100 : 0;
                      return (
                        <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                          <span style={{ width: 11, height: 11, borderRadius: 3, background: c.color, flexShrink: 0 }} />
                          <span style={{ flex: 1, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                          <span className="sc-mono" style={{ fontWeight: 700, color: C.ink }}>{r1(share)}%</span>
                          <span className="sc-mono" style={{ color: C.sub, width: 96, textAlign: "right" }}>{fmtMoney(c.earned, cur)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div style={{ padding: "26px 16px", fontSize: 12.5, color: C.sub, textAlign: "center" }}>No completed quantities yet — enter <b>Actual Qty</b> on the BOQ tab to see earned value by category.</div>
              )}
            </section>

            {/* Progress by category bars */}
            <section style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 14, overflow: "hidden" }}>
              <div style={{ padding: "13px 16px", borderBottom: `1px solid ${C.hair}`, display: "flex", alignItems: "center", gap: 9 }}>
                <Building2 size={16} color={C.plan} /><div className="sc-disp" style={{ fontWeight: 700, fontSize: 15 }}>Progress by category</div>
                <span style={{ ...labelS, marginLeft: "auto" }}>actual fill · plan marker</span>
              </div>
              <div style={{ padding: "12px 16px", display: "grid", gap: 13 }}>
                {catSummary.map((c) => (
                  <div key={c.id}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 5 }}>
                      <span style={{ width: 9, height: 9, borderRadius: 2, background: c.color }} />
                      <span className="sc-disp" style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>{c.name}</span>
                      <span className="sc-mono" style={{ fontSize: 11, color: C.sub }}>{r1(c.weight)}% of scope</span>
                      <span className="sc-mono" style={{ fontSize: 13, fontWeight: 700, color: c.color, width: 52, textAlign: "right" }}>{r1(c.actualPct)}%</span>
                    </div>
                    <div style={{ position: "relative", height: 10, background: "#EDEFF2", borderRadius: 5 }}>
                      <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${clamp01(c.actualPct / 100) * 100}%`, background: c.color, borderRadius: 5 }} />
                      <div title={`plan ${r1(c.planPct)}%`} style={{ position: "absolute", left: `${clamp01(c.planPct / 100) * 100}%`, top: -3, height: 16, width: 2, background: C.ink }} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 11 }} className="sc-mono">
                      <span style={{ color: C.sub }}>{fmtMoney(c.earned, cur)} of {fmtMoney(c.value, cur)}</span>
                      <span style={{ color: (c.actualPct - c.planPct) >= 0 ? C.ahead : C.behind, fontWeight: 600 }}>{(c.actualPct - c.planPct) >= 0 ? "+" : ""}{r1(c.actualPct - c.planPct)}% vs plan</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Category breakdown table */}
          <section style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 14, overflow: "hidden" }}>
            <div style={{ padding: "13px 16px", borderBottom: `1px solid ${C.hair}`, display: "flex", alignItems: "center", gap: 9 }}>
              <LayoutDashboard size={16} color={C.plan} /><div className="sc-disp" style={{ fontWeight: 700, fontSize: 15 }}>Category breakdown</div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="sc-mono" style={{ borderCollapse: "collapse", width: "100%", minWidth: 880, fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#F4F6F8", color: C.sub }}>
                    {["Category", "Weight %", "Contract value", "Plan %", "Actual %", "Variance", "Value done", "Profit / Loss"].map((h, i) => (
                      <th key={h} style={{ padding: "9px 14px", fontWeight: 600, fontSize: 11.5, letterSpacing: ".04em", textTransform: "uppercase", textAlign: i === 0 ? "left" : "right" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {catSummary.map((c) => {
                    const vr = c.actualPct - c.planPct;
                    const plPct = c.value > 0 ? c.pl / c.value * 100 : 0;
                    return (
                      <tr key={c.id} style={{ borderTop: `1px solid ${C.hair}` }}>
                        <td style={{ padding: "7px 14px", textAlign: "left", fontWeight: 600 }}><span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 2, background: c.color, marginRight: 8 }} />{c.name}</td>
                        <td style={{ padding: "7px 14px", textAlign: "right" }}>{r1(c.weight)}%</td>
                        <td style={{ padding: "7px 14px", textAlign: "right" }}>{fmtMoney(c.value, cur)}</td>
                        <td style={{ padding: "7px 14px", textAlign: "right", color: C.plan }}>{r1(c.planPct)}%</td>
                        <td style={{ padding: "7px 14px", textAlign: "right", color: C.actual, fontWeight: 600 }}>{r1(c.actualPct)}%</td>
                        <td style={{ padding: "7px 14px", textAlign: "right", fontWeight: 600, color: vr >= 0 ? C.ahead : C.behind }}>{vr >= 0 ? "+" : ""}{r1(vr)}%</td>
                        <td style={{ padding: "7px 14px", textAlign: "right", fontWeight: 600 }}>{fmtMoney(c.earned, cur)}</td>
                        <td style={{ padding: "7px 14px", textAlign: "right", fontWeight: 600, color: c.pl >= 0 ? C.ahead : C.behind }}>{c.pl >= 0 ? "+" : "−"}{fmtMoney(Math.abs(c.pl), cur)} · {plPct >= 0 ? "+" : ""}{r1(plPct)}%</td>
                      </tr>
                    );
                  })}
                  <tr style={{ borderTop: `2px solid ${C.line}`, background: "#F4F6F8", fontWeight: 700 }}>
                    <td style={{ padding: "8px 14px", textAlign: "left" }}>Total</td>
                    <td style={{ padding: "8px 14px", textAlign: "right" }}>100%</td>
                    <td style={{ padding: "8px 14px", textAlign: "right" }}>{fmtMoney(total, cur)}</td>
                    <td style={{ padding: "8px 14px", textAlign: "right", color: C.plan }}>{r1(overallPlan)}%</td>
                    <td style={{ padding: "8px 14px", textAlign: "right", color: C.actual }}>{r1(overallActual)}%</td>
                    <td style={{ padding: "8px 14px", textAlign: "right", color: overallVar >= 0 ? C.ahead : C.behind }}>{overallVar >= 0 ? "+" : ""}{r1(overallVar)}%</td>
                    <td style={{ padding: "8px 14px", textAlign: "right" }}>{fmtMoney(totalEarned, cur)}</td>
                    <td style={{ padding: "8px 14px", textAlign: "right", color: projPL >= 0 ? C.ahead : C.behind }}>{projPL >= 0 ? "+" : "−"}{fmtMoney(Math.abs(projPL), cur)} · {margin >= 0 ? "+" : ""}{r1(margin)}%</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div style={{ padding: "10px 16px", fontSize: 11.5, color: C.sub, borderTop: `1px solid ${C.hair}` }}>Weight % = category value ÷ contract value. Actual % and “Value done” come from BOQ Actual Qty as of {rows[RP - 1] ? rows[RP - 1].label : ""}. Profit / Loss compares BOQ vs Actual rates.</div>
          </section>
        </div>
      )}

      {/* ============================ S-CURVE TAB ============================ */}
      {tab === "scurve" && (
        <div style={{ padding: 18, display: "grid", gap: 18, gridTemplateColumns: "minmax(0,1fr)", alignItems: "start" }}>
          <div style={{ display: "grid", gap: 18, gridTemplateColumns: "repeat(auto-fit,minmax(460px,1fr))" }}>
            <section style={{ background: C.paper, borderRadius: 14, border: `1px solid ${C.line}`, overflow: "hidden" }}>
              <div style={{ padding: "13px 16px", borderBottom: `1px solid ${C.hair}`, display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                <Hammer size={17} color={C.plan} />
                <div className="sc-disp" style={{ fontWeight: 700, fontSize: 15 }}>Schedule of Works</div>
                <div style={{ marginLeft: "auto", ...labelS }}>Total&nbsp;<span className="sc-mono" style={{ color: C.ink, fontSize: 13 }}>{fmtMoney(total, cur)}</span></div>
                <div style={{ width: "100%", fontSize: 11.5, color: C.sub }}><CalendarDays size={12} style={{ verticalAlign: "-2px", marginRight: 4 }} />{fmtD(projStart)} → {fmtD(projEnd)} · {lastEndDay} days</div>
              </div>
              {mode === "percent" && percentSum !== 100 && (<div style={{ padding: "7px 16px", background: "#FDF6EC", color: C.behind, fontSize: 12 }}>Weights sum to {r1(percentSum)}%. Values are normalised to total scope, so the curve still finishes at 100%.</div>)}
              <div style={{ maxHeight: 560, overflowY: "auto" }}>
                {cats.map((c, ci) => {
                  const catVal = c.items.reduce((s, it) => s + itemVal(it), 0);
                  const catPct = total > 0 ? (catVal / total) * 100 : 0;
                  return (
                    <div key={c.id} style={{ borderBottom: `1px solid ${C.hair}` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", background: "#F4F6F8" }}>
                        <button onClick={() => upCat(c.id, { open: !c.open })} style={{ border: "none", background: "transparent", cursor: "pointer", padding: 2, color: C.sub }}>{c.open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button>
                        <span className="sc-mono" style={{ fontSize: 12, fontWeight: 700, color: C.plan, width: 18 }}>{ci + 1}</span>
                        <input value={c.name} onChange={(e) => upCat(c.id, { name: e.target.value })} className="sc-disp" style={{ border: "none", background: "transparent", fontWeight: 700, fontSize: 14, flex: 1, outline: "none", color: C.ink }} />
                        <span className="sc-mono" style={{ fontSize: 12, color: C.sub }}>{r1(catPct)}%</span>
                        <button onClick={() => delCat(c.id)} title="Remove category" style={{ border: "none", background: "transparent", cursor: "pointer", color: C.sub, padding: 3 }}><Trash2 size={14} /></button>
                      </div>
                      {c.open && (
                        <div>
                          <div style={{ display: "grid", gridTemplateColumns: "24px minmax(110px,1fr) 102px 122px 56px 56px 22px", gap: 6, padding: "5px 12px", alignItems: "center", ...labelS }}>
                            <span></span><span>Item</span>
                            <span style={{ textAlign: "right" }}>{mode === "amount" ? "Amount" : "Weight %"}</span>
                            <span style={{ textAlign: "center" }}>Start</span><span style={{ textAlign: "center" }}>Days</span>
                            <span style={{ textAlign: "right" }}>Weight</span><span></span>
                          </div>
                          {c.items.map((it, ii) => {
                            const v = itemVal(it);
                            const pct = total > 0 ? (v / total) * 100 : 0;
                            const sd = parseD(it.startDate) || projStart;
                            const isd = daysBetween(projStart, sd);
                            const idays = Math.max(1, num(it.days));
                            const ed = addDays(sd, idays);
                            const over = isd + idays > lastEndDay;
                            const hasBoq = it.boq && it.boq.length > 0;
                            return (
                              <div key={it.id} className="sc-row" style={{ padding: "0 12px" }}>
                                <div style={{ display: "grid", gridTemplateColumns: "24px minmax(110px,1fr) 102px 122px 56px 56px 22px", gap: 6, alignItems: "center", padding: "4px 0" }}>
                                  <span className="sc-mono" style={{ fontSize: 11, color: C.sub }}>{ci + 1}.{ii + 1}</span>
                                  <input value={it.name} onChange={(e) => upItem(c.id, it.id, { name: e.target.value })} className="sc-in" style={{ ...inS, width: "100%" }} />
                                  {hasBoq ? (
                                    <button onClick={() => setTab("boq")} title="Value comes from BOQ — open BOQ tab" className="sc-mono" style={{ width: "100%", textAlign: "right", fontSize: 12, color: C.plan, background: "#EEF4FA", border: `1px solid ${C.planSoft}`, borderRadius: 6, padding: "5px 8px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}><ClipboardList size={11} />{fmtMoney(v, cur).replace(cur, "")}</button>
                                  ) : (<Num value={it.value} onChange={(val) => upItem(c.id, it.id, { value: val })} w={"100%"} suffix={mode === "percent" ? "%" : undefined} />)}
                                  <input type="date" value={it.startDate} onChange={(e) => upItem(c.id, it.id, { startDate: e.target.value })} className="sc-in sc-mono" style={{ ...inS, width: "100%" }} />
                                  <Num value={it.days} onChange={(val) => upItem(c.id, it.id, { days: Math.max(1, Math.round(num(val)) || 1) })} w={"100%"} align="center" />
                                  <span className="sc-mono" style={{ textAlign: "right", fontSize: 12, color: C.ink }}>{r1(pct)}%</span>
                                  <button onClick={() => delItem(c.id, it.id)} style={{ border: "none", background: "transparent", cursor: "pointer", color: C.sub, padding: 2 }}><Trash2 size={13} /></button>
                                </div>
                                <div style={{ fontSize: 10.5, color: C.sub, paddingBottom: 3 }} className="sc-mono">{fmtD(sd)} → {fmtD(ed)} · {idays} days{over && <span style={{ color: C.behind }}> · ends after project window</span>}</div>
                                <div style={{ display: "flex", gap: 1, paddingBottom: 6, overflowX: "auto" }}>
                                  {periods.map((p) => {
                                    const f = shapeCum(clamp01((p.endDay - isd) / idays), curve) - shapeCum(clamp01((p.startDay - isd) / idays), curve);
                                    const active = p.endDay > isd && p.startDay < isd + idays;
                                    return <div key={p.k} title={`${p.label} · ${fmtD(p.date)}`} style={{ flex: "1 0 5px", minWidth: 5, height: 7, borderRadius: 2, background: active ? C.plan : "#EDEFF2", opacity: active ? 0.35 + f * 4 : 1 }} />;
                                  })}
                                </div>
                              </div>
                            );
                          })}
                          <button onClick={() => addItem(c.id)} className="sc-noprint" style={{ display: "flex", alignItems: "center", gap: 5, margin: "4px 12px 10px", border: `1px dashed ${C.line}`, background: "transparent", color: C.plan, borderRadius: 7, padding: "6px 10px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}><Plus size={14} /> Add item</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <button onClick={addCat} className="sc-noprint" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "calc(100% - 24px)", margin: 12, border: `1px solid ${C.ink}`, background: C.ink, color: "#fff", borderRadius: 9, padding: "9px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}><Plus size={15} /> Add work category</button>
            </section>

            <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
                {[
                  { k: "Planned to date", v: here ? `${r1(here.planCum)}%` : "—", c: C.plan },
                  { k: "Actual to date", v: here ? `${r1(here.actualCum)}%` : "—", c: C.actual },
                  { k: "Variance", c: here ? (here.variance >= 0 ? C.ahead : C.behind) : C.sub, v: here ? `${here.variance >= 0 ? "+" : ""}${r1(here.variance)}%` : "—", sub: here ? (here.variance >= 0 ? "ahead" : "behind") : "" },
                  { k: "Contract value", v: fmtMoney(total, cur), c: C.ink, small: true },
                ].map((s) => (
                  <div key={s.k} style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 12, padding: "11px 13px" }}>
                    <div style={labelS}>{s.k}</div>
                    <div className="sc-mono" style={{ fontSize: s.small ? 16 : 23, fontWeight: 600, color: s.c, marginTop: 3, lineHeight: 1 }}>{s.v}</div>
                    {s.sub && <div style={{ fontSize: 11, color: s.c, fontWeight: 600 }}>{s.sub} schedule {dataLabel ? `· ${dataLabel}` : ""}</div>}
                  </div>
                ))}
              </div>
              <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 14, padding: "14px 12px 6px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 6px 8px" }}>
                  <div className="sc-disp" style={{ fontWeight: 700, fontSize: 15 }}>S-Curve · {project}</div>
                  <div className="sc-mono" style={{ fontSize: 11, color: C.sub }}>{P} {isMonth ? "months" : "weeks"} · {fmtD(projStart)}–{fmtD(projEnd)}</div>
                </div>
                <ResponsiveContainer width="100%" height={360}>
                  <ComposedChart data={rows} margin={{ top: 6, right: 8, left: -6, bottom: 4 }}>
                    <CartesianGrid stroke={C.hair} strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.sub, fontFamily: "IBM Plex Mono" }} tickLine={false} axisLine={{ stroke: C.line }} interval={Math.max(0, Math.ceil(P / 14) - 1)} />
                    <YAxis yAxisId="cum" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: C.sub, fontFamily: "IBM Plex Mono" }} tickLine={false} axisLine={false} width={42} />
                    <YAxis yAxisId="per" orientation="right" tick={{ fontSize: 11, fill: C.sub, fontFamily: "IBM Plex Mono" }} tickLine={false} axisLine={false} width={34} />
                    <Tooltip contentStyle={{ borderRadius: 10, border: `1px solid ${C.line}`, fontFamily: "IBM Plex Mono", fontSize: 12 }} formatter={(val, name) => val == null ? ["—", name] : [`${r1(val)}%`, name]} />
                    <Legend wrapperStyle={{ fontSize: 12, fontFamily: "Inter" }} />
                    {dataDate > 0 && <ReferenceLine yAxisId="cum" x={dataLabel} stroke={C.actual} strokeDasharray="4 3" label={{ value: "data date", fontSize: 10, fill: C.actual, position: "insideTopRight" }} />}
                    <Bar yAxisId="per" dataKey="planPeriod" name={`Plan / ${isMonth ? "month" : "week"}`} fill={C.planSoft} radius={[2, 2, 0, 0]} maxBarSize={26} />
                    <Bar yAxisId="per" dataKey="actualPeriod" name={`Actual / ${isMonth ? "month" : "week"}`} fill={C.actualSoft} radius={[2, 2, 0, 0]} maxBarSize={26} />
                    <Line yAxisId="cum" type="monotone" dataKey="planCum" name="Plan cumulative" stroke={C.plan} strokeWidth={2.5} dot={false} />
                    <Line yAxisId="cum" type="monotone" dataKey="actualCum" name="Actual cumulative" stroke={C.actual} strokeWidth={2.5} dot={{ r: 2.5 }} connectNulls={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </section>
          </div>

          <section style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 14, overflow: "hidden" }}>
            <div style={{ padding: "13px 16px", borderBottom: `1px solid ${C.hair}`, display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
              <Building2 size={17} color={C.plan} />
              <div className="sc-disp" style={{ fontWeight: 700, fontSize: 15 }}>{isMonth ? "Monthly" : "Weekly"} Progress</div>
              <div style={{ ...labelS, marginLeft: 8 }}>{actualSrc === "boq" ? "Actual is driven by BOQ quantities — edit on the BOQ tab" : `Plan auto-calculated · type Actual % achieved each ${isMonth ? "month" : "week"}`}</div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="sc-mono" style={{ borderCollapse: "collapse", width: "100%", minWidth: 820, fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#F4F6F8", color: C.sub, textAlign: "right" }}>
                    {[periodWord, "Date", "Plan %", "Plan cum %", "Actual %", "Actual cum %", "Variance"].map((h, i) => (
                      <th key={h} style={{ padding: "9px 14px", fontWeight: 600, fontSize: 11.5, letterSpacing: ".04em", textTransform: "uppercase", textAlign: i === 0 ? "left" : "right", position: i === 0 ? "sticky" : "static", left: 0, background: "#F4F6F8" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.m} style={{ borderTop: `1px solid ${C.hair}`, background: r.m === dataDate ? "#FFF8EE" : "transparent" }}>
                      <td style={{ padding: "5px 14px", fontWeight: 600, textAlign: "left", position: "sticky", left: 0, background: r.m === dataDate ? "#FFF8EE" : C.paper }}>{r.label}</td>
                      <td style={{ padding: "5px 14px", textAlign: "right", color: C.sub, fontSize: 12 }}>{fmtD(r.date)}</td>
                      <td style={{ padding: "5px 10px", textAlign: "right" }}><input className="sc-in sc-num sc-mono" inputMode="decimal" value={r.overridden ? planOv[r.m] : r1(r.planPeriod)} onChange={(e) => setPlanOv((o) => ({ ...o, [r.m]: e.target.value }))} style={{ width: 70, textAlign: "right", padding: "4px 7px", color: r.overridden ? C.behind : C.ink }} /></td>
                      <td style={{ padding: "5px 14px", textAlign: "right", color: C.plan, fontWeight: 600 }}>{r1(r.planCum)}%</td>
                      <td style={{ padding: "5px 10px", textAlign: "right" }}>
                        {actualSrc === "boq" ? (<span className="sc-mono" style={{ display: "inline-block", width: 70, textAlign: "right", padding: "4px 7px", color: r.actualPeriod == null ? C.sub : C.ink, background: "#F4F6F8", borderRadius: 6 }}>{r.actualPeriod == null ? "—" : r1(r.actualPeriod)}</span>) : (<input className="sc-in sc-num sc-mono" inputMode="decimal" placeholder="—" value={actuals[r.m] ?? ""} onChange={(e) => setActuals((a) => ({ ...a, [r.m]: e.target.value }))} style={{ width: 70, textAlign: "right", padding: "4px 7px", borderColor: C.actualSoft }} />)}
                      </td>
                      <td style={{ padding: "5px 14px", textAlign: "right", color: C.actual, fontWeight: 600 }}>{r.actualCum == null ? "—" : `${r1(r.actualCum)}%`}</td>
                      <td style={{ padding: "5px 14px", textAlign: "right", fontWeight: 600, color: r.variance == null ? C.sub : r.variance >= 0 ? C.ahead : C.behind }}>{r.variance == null ? "—" : `${r.variance >= 0 ? "+" : ""}${r1(r.variance)}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: "10px 16px", fontSize: 11.5, color: C.sub, borderTop: `1px solid ${C.hair}` }}>Variance = actual cumulative − plan cumulative (+ ahead, − behind). Plan cells in <span style={{ color: C.behind }}>orange</span> are manual overrides — use “Auto plan” to clear them.</div>
          </section>
        </div>
      )}

      {/* ============================== BOQ TAB ============================== */}
      {tab === "boq" && (
        <div style={{ padding: 18, display: "grid", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
            {(() => {
              const earned = earnedTo(RP);
              const pct = total > 0 ? (earned / total) * 100 : 0;
              return [
                { k: "Contract value (BOQ)", v: fmtMoney(total, cur), c: C.ink },
                { k: "Projected cost (Actual)", v: fmtMoney(projCost, cur), c: C.sub },
                { k: "Projected profit / loss", v: `${projPL >= 0 ? "+" : "−"}${fmtMoney(Math.abs(projPL), cur)}`, c: projPL >= 0 ? C.ahead : C.behind },
                { k: "Margin", v: `${margin >= 0 ? "+" : ""}${r1(margin)}%`, c: margin >= 0 ? C.ahead : C.behind },
                { k: `Earned value · ${rows[RP - 1] ? rows[RP - 1].label : ""}`, v: fmtMoney(earned, cur), c: C.actual },
                { k: "% complete", v: `${r1(pct)}%`, c: C.plan },
              ].map((s) => (
                <div key={s.k} style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 12, padding: "11px 14px" }}>
                  <div style={labelS}>{s.k}</div>
                  <div className="sc-mono" style={{ fontSize: 17, fontWeight: 600, color: s.c, marginTop: 3 }}>{s.v}</div>
                </div>
              ));
            })()}
          </div>
          <div style={{ background: "#EEF4FA", border: `1px solid ${C.planSoft}`, borderRadius: 10, padding: "9px 14px", display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: C.ink2, flexWrap: "wrap" }}>
            <Scale size={15} color={C.plan} />
            BOQ Rate is your contract/sell rate; Actual Rate is your real cost. Profit / Loss = (BOQ − Actual) rate × BOQ Qty. Completed quantities also feed the Actual S-curve.
            <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}><span style={labelS}>Reporting {periodWord.toLowerCase()}</span><select value={RP} onChange={(e) => setReportPeriod(num(e.target.value))} className="sc-in sc-mono" style={{ ...inS }}>{periodOptions}</select></span>
          </div>
          {cats.map((c, ci) => {
            const catVal = c.items.reduce((s, it) => s + itemVal(it), 0);
            const cols = "minmax(150px,1fr) 52px 76px 84px 80px 88px 102px 132px 92px 22px";
            return (
              <section key={c.id} style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 14, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "12px 16px", background: "#F4F6F8", borderBottom: `1px solid ${C.hair}` }}>
                  <span className="sc-mono" style={{ fontSize: 13, fontWeight: 700, color: C.plan }}>{ci + 1}</span>
                  <div className="sc-disp" style={{ fontWeight: 700, fontSize: 15 }}>{c.name}</div>
                  <div className="sc-mono" style={{ marginLeft: "auto", fontSize: 13, color: C.ink, fontWeight: 600 }}>{fmtMoney(catVal, cur)}</div>
                </div>
                {c.items.map((it, ii) => {
                  const v = itemVal(it);
                  return (
                    <div key={it.id} style={{ borderBottom: `1px solid ${C.hair}` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px" }}>
                        <span className="sc-mono" style={{ fontSize: 12, color: C.sub, width: 30 }}>{ci + 1}.{ii + 1}</span>
                        <div className="sc-disp" style={{ fontWeight: 600, fontSize: 13.5 }}>{it.name}</div>
                        <div className="sc-mono" style={{ marginLeft: "auto", fontSize: 12.5, color: C.plan, fontWeight: 600 }}>{fmtMoney(v, cur)}</div>
                      </div>
                      <div style={{ overflowX: "auto", padding: "0 8px 6px" }}>
                        <div style={{ minWidth: 1180 }}>
                          <div style={{ display: "grid", gridTemplateColumns: cols, gap: 8, padding: "4px 8px", alignItems: "center", ...labelS }}>
                            <span>Description</span><span style={{ textAlign: "center" }}>Unit</span><span style={{ textAlign: "right" }}>BOQ Qty</span><span style={{ textAlign: "right" }}>Actual Qty</span><span style={{ textAlign: "right" }}>BOQ Rate</span><span style={{ textAlign: "right" }}>Act. Rate</span><span style={{ textAlign: "right" }}>Amount</span><span style={{ textAlign: "right" }}>Profit / Loss</span><span style={{ textAlign: "right" }}>% comp</span><span></span>
                          </div>
                          {(it.boq || []).map((b) => {
                            const bQty = num(b.qty), bRate = num(b.rate), aRate = num(b.actualRate);
                            const amt = bQty * bRate;
                            const pl = (bRate - aRate) * bQty;
                            const plPct = bRate > 0 ? (bRate - aRate) / bRate * 100 : 0;
                            const cd = cumDone(b.id, RP);
                            const cpct = bQty > 0 ? clamp01(cd / bQty) * 100 : 0;
                            const plc = pl >= 0 ? C.ahead : C.behind;
                            return (
                              <div key={b.id} className="sc-row" style={{ display: "grid", gridTemplateColumns: cols, gap: 8, padding: "4px 8px", alignItems: "center" }}>
                                <input value={b.desc} onChange={(e) => upBoq(c.id, it.id, b.id, { desc: e.target.value })} className="sc-in" style={{ ...inS, width: "100%" }} />
                                <input value={b.unit} onChange={(e) => upBoq(c.id, it.id, b.id, { unit: e.target.value })} className="sc-in sc-mono" style={{ ...inS, width: "100%", textAlign: "center" }} />
                                <Num value={b.qty} onChange={(val) => upBoq(c.id, it.id, b.id, { qty: val })} w={"100%"} />
                                <Num value={cumDone(b.id, RP)} onChange={(val) => setActualCum(b.id, val)} w={"100%"} />
                                <Num value={b.rate} onChange={(val) => upBoq(c.id, it.id, b.id, { rate: val })} w={"100%"} />
                                <Num value={b.actualRate} onChange={(val) => upBoq(c.id, it.id, b.id, { actualRate: val })} w={"100%"} cls="" />
                                <span className="sc-mono" style={{ textAlign: "right", fontSize: 12, color: C.ink }}>{fmtMoney(amt, cur)}</span>
                                <div style={{ textAlign: "right" }}>
                                  <div className="sc-mono" style={{ color: plc, fontWeight: 600, fontSize: 12 }}>{pl >= 0 ? "+" : "−"}{fmtMoney(Math.abs(pl), cur)}</div>
                                  <div className="sc-mono" style={{ color: plc, fontSize: 10.5 }}>{plPct >= 0 ? "+" : ""}{r1(plPct)}%</div>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 5, justifyContent: "flex-end" }}>
                                  <div style={{ flex: 1, height: 6, background: "#EDEFF2", borderRadius: 3, overflow: "hidden", maxWidth: 48 }}><div style={{ width: `${cpct}%`, height: "100%", background: cpct >= 100 ? C.ahead : C.actual }} /></div>
                                  <span className="sc-mono" style={{ fontSize: 11, color: C.sub, width: 34, textAlign: "right" }}>{r1(cpct)}%</span>
                                </div>
                                <button onClick={() => delBoq(c.id, it.id, b.id)} style={{ border: "none", background: "transparent", cursor: "pointer", color: C.sub, padding: 2 }}><Trash2 size={13} /></button>
                              </div>
                            );
                          })}
                          <button onClick={() => addBoq(c.id, it.id)} className="sc-noprint" style={{ display: "flex", alignItems: "center", gap: 5, margin: "4px 8px 8px", border: `1px dashed ${C.line}`, background: "transparent", color: C.plan, borderRadius: 7, padding: "6px 10px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}><Plus size={14} /> Add BOQ line</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </section>
            );
          })}
          <div style={{ fontSize: 11.5, color: C.sub, padding: "0 4px" }}><Ruler size={12} style={{ verticalAlign: "-1px", marginRight: 5 }} />Amount = BOQ Qty × BOQ Rate. Actual Qty is cumulative completed to the reporting {periodWord.toLowerCase()} ({rows[RP - 1] ? rows[RP - 1].label : ""}). Profit / Loss compares BOQ rate vs Actual rate over the BOQ quantity (green = profit, red = loss).</div>
        </div>
      )}

      {/* ============================ MATERIALS TAB ============================ */}
      {tab === "material" && (() => {
        const tot = materials.length, ok = materials.filter((m) => isApproved(m.status)).length;
        const cols = "192px 1fr 150px 134px 158px 134px 150px 26px";
        return (
          <div style={{ padding: 18, display: "grid", gap: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
              {[{ k: "Material submittals", v: String(tot), c: C.ink }, { k: "Approved", v: String(ok), c: C.ahead }, { k: "Outstanding", v: String(tot - ok), c: C.actual }, { k: "% approved", v: `${tot ? r1(ok / tot * 100) : 0}%`, c: C.plan }].map((s) => (
                <div key={s.k} style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 12, padding: "11px 14px" }}><div style={labelS}>{s.k}</div><div className="sc-mono" style={{ fontSize: 18, fontWeight: 600, color: s.c, marginTop: 3 }}>{s.v}</div></div>
              ))}
            </div>
            <FormatBar fmt={matFmt} setFmt={setMatFmt} code0={cats[0] && cats[0].code} onRenumber={renumberMat} />
            <div style={{ fontSize: 11.5, color: C.sub, padding: "0 4px", display: "flex", alignItems: "center", gap: 6 }}><Hash size={12} /> Each new material auto-numbers per category as <b style={{ margin: "0 2px" }}>{matFmt.prefix}{matFmt.sep}&lt;code&gt;{matFmt.sep}001</b>. Edit any number directly, or change the format/code and click <b style={{ margin: "0 2px" }}>Renumber all</b>.</div>
            {cats.map((c, ci) => {
              const list = materials.filter((m) => m.catId === c.id);
              const okc = list.filter((m) => isApproved(m.status)).length;
              return (
                <section key={c.id} style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 14, overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 16px", background: "#F4F6F8", borderBottom: `1px solid ${C.hair}` }}>
                    <span className="sc-mono" style={{ fontSize: 13, fontWeight: 700, color: C.plan }}>{ci + 1}</span>
                    <div className="sc-disp" style={{ fontWeight: 700, fontSize: 15 }}>{c.name}</div>
                    <span style={labelS}>Code</span>
                    <input value={c.code || ""} onChange={(e) => upCat(c.id, { code: e.target.value.toUpperCase() })} className="sc-in sc-mono" style={{ ...inS, width: 64, textAlign: "center", fontWeight: 700, color: C.plan }} />
                    <div className="sc-mono" style={{ marginLeft: "auto", fontSize: 12, color: C.sub }}><CheckCircle2 size={13} color={C.ahead} style={{ verticalAlign: "-2px", marginRight: 4 }} />{okc}/{list.length} approved</div>
                  </div>
                  <div style={{ overflowX: "auto", padding: "0 8px 6px" }}>
                    <div style={{ minWidth: 1040 }}>
                      <div style={{ display: "grid", gridTemplateColumns: cols, gap: 8, padding: "5px 8px", alignItems: "center", ...labelS }}><span>Doc no.</span><span>Material / description</span><span>Manufacturer</span><span>Submitted</span><span>Status</span><span>Approved</span><span>Remarks</span><span></span></div>
                      {list.map((m) => (
                        <div key={m.id} className="sc-row" style={{ display: "grid", gridTemplateColumns: cols, gap: 8, padding: "4px 8px", alignItems: "center" }}>
                          <input value={m.no} onChange={(e) => upMat(m.id, { no: e.target.value })} className="sc-in sc-mono" style={{ ...inS, width: "100%", color: C.plan, fontWeight: 600 }} />
                          <input value={m.name} onChange={(e) => upMat(m.id, { name: e.target.value })} className="sc-in" style={{ ...inS, width: "100%" }} />
                          <input value={m.maker} onChange={(e) => upMat(m.id, { maker: e.target.value })} className="sc-in" style={{ ...inS, width: "100%" }} />
                          <input type="date" value={m.submitted} onChange={(e) => upMat(m.id, { submitted: e.target.value })} className="sc-in sc-mono" style={{ ...inS, width: "100%" }} />
                          <select value={m.status} onChange={(e) => upMat(m.id, { status: e.target.value })} className="sc-in sc-mono" style={{ ...inS, width: "100%", color: statusColor(m.status), fontWeight: 600 }}>{MAT_STATUS.map((o) => <option key={o} value={o}>{o}</option>)}</select>
                          <input type="date" value={m.approved} onChange={(e) => upMat(m.id, { approved: e.target.value })} className="sc-in sc-mono" style={{ ...inS, width: "100%" }} />
                          <input value={m.remarks} onChange={(e) => upMat(m.id, { remarks: e.target.value })} className="sc-in" style={{ ...inS, width: "100%" }} />
                          <button onClick={() => delMat(m.id)} style={{ border: "none", background: "transparent", cursor: "pointer", color: C.sub, padding: 2 }}><Trash2 size={13} /></button>
                        </div>
                      ))}
                      <button onClick={() => addMat(c.id)} className="sc-noprint" style={{ display: "flex", alignItems: "center", gap: 5, margin: "4px 8px 8px", border: `1px dashed ${C.line}`, background: "transparent", color: C.plan, borderRadius: 7, padding: "6px 10px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}><Plus size={14} /> Add material</button>
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
        );
      })()}

      {/* ========================== SHOP DRAWINGS TAB ========================== */}
      {tab === "shop" && (() => {
        const tot = shops.length, ok = shops.filter((s) => isApproved(s.status)).length;
        const cols = "192px 1fr 56px 134px 168px 134px 150px 26px";
        return (
          <div style={{ padding: 18, display: "grid", gap: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
              {[{ k: "Shop drawings", v: String(tot), c: C.ink }, { k: "Approved", v: String(ok), c: C.ahead }, { k: "Outstanding", v: String(tot - ok), c: C.actual }, { k: "% approved", v: `${tot ? r1(ok / tot * 100) : 0}%`, c: C.plan }].map((s) => (
                <div key={s.k} style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 12, padding: "11px 14px" }}><div style={labelS}>{s.k}</div><div className="sc-mono" style={{ fontSize: 18, fontWeight: 600, color: s.c, marginTop: 3 }}>{s.v}</div></div>
              ))}
            </div>
            <FormatBar fmt={sdFmt} setFmt={setSdFmt} code0={cats[0] && cats[0].code} onRenumber={renumberSd} />
            <div style={{ fontSize: 11.5, color: C.sub, padding: "0 4px", display: "flex", alignItems: "center", gap: 6 }}><Hash size={12} /> Each new drawing auto-numbers per category as <b style={{ margin: "0 2px" }}>{sdFmt.prefix}{sdFmt.sep}&lt;code&gt;{sdFmt.sep}001</b>. Codes are shared with the Materials tab.</div>
            {cats.map((c, ci) => {
              const list = shops.filter((s) => s.catId === c.id);
              const okc = list.filter((s) => isApproved(s.status)).length;
              return (
                <section key={c.id} style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 14, overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 16px", background: "#F4F6F8", borderBottom: `1px solid ${C.hair}` }}>
                    <span className="sc-mono" style={{ fontSize: 13, fontWeight: 700, color: C.plan }}>{ci + 1}</span>
                    <div className="sc-disp" style={{ fontWeight: 700, fontSize: 15 }}>{c.name}</div>
                    <span style={labelS}>Code</span>
                    <input value={c.code || ""} onChange={(e) => upCat(c.id, { code: e.target.value.toUpperCase() })} className="sc-in sc-mono" style={{ ...inS, width: 64, textAlign: "center", fontWeight: 700, color: C.plan }} />
                    <div className="sc-mono" style={{ marginLeft: "auto", fontSize: 12, color: C.sub }}><CheckCircle2 size={13} color={C.ahead} style={{ verticalAlign: "-2px", marginRight: 4 }} />{okc}/{list.length} approved</div>
                  </div>
                  <div style={{ overflowX: "auto", padding: "0 8px 6px" }}>
                    <div style={{ minWidth: 1040 }}>
                      <div style={{ display: "grid", gridTemplateColumns: cols, gap: 8, padding: "5px 8px", alignItems: "center", ...labelS }}><span>Drawing no.</span><span>Drawing title</span><span style={{ textAlign: "center" }}>Rev</span><span>Submitted</span><span>Status</span><span>Approved</span><span>Remarks</span><span></span></div>
                      {list.map((s) => (
                        <div key={s.id} className="sc-row" style={{ display: "grid", gridTemplateColumns: cols, gap: 8, padding: "4px 8px", alignItems: "center" }}>
                          <input value={s.no} onChange={(e) => upSd(s.id, { no: e.target.value })} className="sc-in sc-mono" style={{ ...inS, width: "100%", color: C.plan, fontWeight: 600 }} />
                          <input value={s.title} onChange={(e) => upSd(s.id, { title: e.target.value })} className="sc-in" style={{ ...inS, width: "100%" }} />
                          <input value={s.rev} onChange={(e) => upSd(s.id, { rev: e.target.value })} className="sc-in sc-mono" style={{ ...inS, width: "100%", textAlign: "center" }} />
                          <input type="date" value={s.submitted} onChange={(e) => upSd(s.id, { submitted: e.target.value })} className="sc-in sc-mono" style={{ ...inS, width: "100%" }} />
                          <select value={s.status} onChange={(e) => upSd(s.id, { status: e.target.value })} className="sc-in sc-mono" style={{ ...inS, width: "100%", color: statusColor(s.status), fontWeight: 600 }}>{SD_STATUS.map((o) => <option key={o} value={o}>{o}</option>)}</select>
                          <input type="date" value={s.approved} onChange={(e) => upSd(s.id, { approved: e.target.value })} className="sc-in sc-mono" style={{ ...inS, width: "100%" }} />
                          <input value={s.remarks} onChange={(e) => upSd(s.id, { remarks: e.target.value })} className="sc-in" style={{ ...inS, width: "100%" }} />
                          <button onClick={() => delSd(s.id)} style={{ border: "none", background: "transparent", cursor: "pointer", color: C.sub, padding: 2 }}><Trash2 size={13} /></button>
                        </div>
                      ))}
                      <button onClick={() => addSd(c.id)} className="sc-noprint" style={{ display: "flex", alignItems: "center", gap: 5, margin: "4px 8px 8px", border: `1px dashed ${C.line}`, background: "transparent", color: C.plan, borderRadius: 7, padding: "6px 10px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}><Plus size={14} /> Add shop drawing</button>
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
}
