/* Mapa Visita Papa León XIV · Predio FAdeA — PWA offline.
   Renderer canvas propio (sin librerías externas) para que todo funcione sin conexión. */
(() => {
"use strict";
const C = self.APP_CONFIG, G = self.Geo;
const $ = (s) => document.querySelector(s);
const cv = $("#map"), ctx = cv.getContext("2d");

/* ---------- Definiciones ---------- */
const TYPES = {
  cuadrante:  { label: "Cuadrante",               color: "#ca8a04", layer: "cuad" },
  clero:      { label: "Cuadrante · Clero",       color: "#7e22ce", layer: "cuad" },
  autoridades:{ label: "Cuadrante · Autoridades", color: "#1d4ed8", layer: "cuad" },
  frente:     { label: "Cuadrante (predio frente)",color: "#c2410c", layer: "cuad" },
  sector:     { label: "Subsector",               color: "#64748b", layer: "cuad" },
  ingreso:    { label: "Zona de ingreso",         color: "#15803d", layer: "acc" },
  escenario:  { label: "Escenario",               color: "#b91c1c", layer: "esc" },
  ps:         { label: "Puesto sanitario",        color: "#dc2626", layer: "ps" },
  se:         { label: "Salida de emergencia",    color: "#15803d", layer: "se" },
  hosp:       { label: "Hospital",                color: "#7f1d1d", layer: "hosp" },
  acc:        { label: "Ingreso",                 color: "#0369a1", layer: "acc" },
  pantalla:   { label: "Pantalla y audio",        color: "#0e7490", layer: "pant" },
  base:       { label: "Centro operativo",        color: "#7c3aed", layer: "ext" },
  sacristia:  { label: "Sacristía",               color: "#dc2626", layer: "sac" },
  bateria:    { label: "Batería de servicios",    color: "#92400e", layer: "bt" },
  servicio:   { label: "Instalación",             color: "#64748b", layer: "serv" },
  ref:        { label: "Referencia",              color: "#6d28d9", layer: "ext" },
};
const LAYERS = [
  { id: "cuad", name: "Cuadrantes y sectores", color: "#facc15" },
  { id: "esc",  name: "Escenario papal",       color: "#ef4444" },
  { id: "ps",   name: "Puestos sanitarios",    color: "#dc2626" },
  { id: "se",   name: "Salidas de emergencia", color: "#15803d" },
  { id: "hosp", name: "Hospitales",            color: "#7f1d1d" },
  { id: "acc",  name: "Ingresos",              color: "#0369a1" },
  { id: "sac",  name: "Sacristías (aprox.)",             color: "#dc2626" },
  { id: "pant", name: "Pantallas y audio (aprox.)",      color: "#0e7490" },
  { id: "bt",   name: "Baterías de servicios (aprox.)",  color: "#92400e" },
  { id: "serv", name: "Baños, COE, descanso y más (a escala)", color: "#64748b" },
  { id: "ext",  name: "Otras referencias",               color: "#6d28d9" },
  { id: "door", name: "Puertas de los patios",  color: "#f59e0b" },
  { id: "base", name: "Mapa base (calles)",    color: "#94a3b8" },
];
const POLY_DRAW = ["ingreso", "servicio", "frente", "cuadrante", "clero", "autoridades", "sector", "escenario"];
const POLY_HIT = ["escenario", "servicio", "sector", "clero", "autoridades", "cuadrante", "frente", "ingreso"];
const SEARCH_ALIAS = {
  ps: "ps sanitario sanitaria medico medica salud ambulancia primeros auxilios",
  se: "se salida emergencia evacuacion",
  hosp: "hospital h medico guardia",
  acc: "ingreso acceso entrada",
  ingreso: "ingreso acceso entrada",
  escenario: "escenario altar papal misa",
  clero: "clero sacerdotes",
  autoridades: "autoridades vip",
  sacristia: "sacristia s",
  pantalla: "pantalla audio pa tv",
  bateria: "bateria servicios bt banos sanitarios",
  servicio: "coe banos carpa descanso camion comando noria ambulancias",
};

/* ---------- Estado ---------- */
let data = null, feats = [];
let W = 0, H = 0, dpr = 1;
const view = { cx: 0, cy: 0, z: 15, rot: 0 };
let measure = false, stageF = null;
let minZ = 13, maxZ = 20, fitZ = 15, wbox = null, bounds = null;
let sel = null, route = null, pendingFrom = null, nav = null, navView = null;
let pos = null, watchId = null, follow = false, heading = null, compassOn = false;
let layersOn = { cuad: 1, esc: 1, ps: 1, se: 1, hosp: 1, acc: 1, sac: 1, pant: 1, bt: 1, serv: 1, ext: 1, door: 1, base: 1 };
try { Object.assign(layersOn, JSON.parse(localStorage.getItem("papa.layers") || "{}")); } catch (e) {}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const fmtN = (n) => Number(n).toLocaleString("es-AR");
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };

let toastT = 0;
function toast(msg, ms = 3800) {
  const t = $("#toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), ms);
}

/* ---------- Datos ---------- */
let EXTRAS = [], DOORS = {}, sharedPos = null;
const LOC_TYPES = { ps: "Puesto sanitario", se: "Salida de emergencia", pantalla: "Pantalla", sacristia: "Sacristía", bateria: "Baños (batería de servicios)" };
const locTxt = (f) => (f.cuad ? (f.cuadIn ? "cuadrante " : "junto al cuadrante ") + f.cuad : "");
const titleOf = (f) => LOC_TYPES[f.t] ? LOC_TYPES[f.t] + (f.cuad ? " · " + locTxt(f) : " " + f.id) : f.name;
const shortOf = (f) => LOC_TYPES[f.t] ? f.cuad || f.id : f.t === "sector" ? f.id.split(" · ")[1] || f.id : f.name;

function prep() { prep0(); assignCuads(); }
function assignCuads() {
  const sq = []; for (const f of feats) if (f.ring && (f.t === "cuadrante" || f.t === "clero" || f.t === "autoridades" || f.t === "frente")) sq.push(f);
  for (const f of feats) if (LOC_TYPES[f.t] && f.pt) {   // en qué cuadrante (o junto a cuál) está cada punto
    let ll = f.pt, hit = sq.find((q) => G.inRing(ll, q.ring)); f.cuadIn = !!hit;
    if (!hit) { let bd = 250; for (const q of sq) { const d = G.distance(ll, q.ll); if (d < bd) { bd = d; hit = q; } } }
    f.cuad = hit ? (hit.t === "clero" ? "C1" : hit.t === "autoridades" ? "D1" : hit.id) : "";
  }
}
function prep0() {
  feats = data.features.concat(EXTRAS);
  bounds = data.meta.bounds;
  for (const f of feats) {
    if (f.ring) {
      f.w = f.ring.map((p) => G.project(p[0], p[1], 0));
      f.ll = G.centroid(f.ring);
      const xs = f.w.map((p) => p[0]), ys = f.w.map((p) => p[1]);
      f.bb = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    } else {
      f.ll = f.pt;
      f.w = [G.project(f.pt[0], f.pt[1], 0)];
    }
    f.cw = G.project(f.ll[0], f.ll[1], 0);
    f.text = norm([f.id, f.name, TYPES[f.t].label, f.uso || "", f.where || "", SEARCH_ALIAS[f.t] || "",
      ["cuadrante", "clero", "autoridades", "frente"].includes(f.t) ? "cuadrante" : ""].join(" "));
  }
  stageF = feats.find((f) => f.t === "escenario") || null;
  const pad = 0.012;
  const a = G.project(bounds[0] - pad, bounds[3] + pad, 0), b = G.project(bounds[2] + pad, bounds[1] - pad, 0);
  wbox = [a[0], a[1], b[0], b[1]];
}

/* ---------- Vista ---------- */
function resize() {
  dpr = window.devicePixelRatio || 1; W = innerWidth; H = innerHeight;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  if (bounds) { computeFit(); }
  invalidate(); layout();
}
function computeFit() {
  const a = G.project(bounds[0], bounds[3], 0), b = G.project(bounds[2], bounds[1], 0);
  const padT = 150, padB = 90, padS = 24;
  const z = Math.log2(Math.min((W - 2 * padS) / (b[0] - a[0]), (H - padT - padB) / (b[1] - a[1])));
  fitZ = z; minZ = Math.max(12, z - 1); maxZ = 20;
}
function fitView(animate) {
  const a = G.project(bounds[0], bounds[3], 0), b = G.project(bounds[2], bounds[1], 0);
  const t = { cx: (a[0] + b[0]) / 2, cy: (a[1] + b[1]) / 2 + (150 - 90) / 2 / Math.pow(2, fitZ) * -1, z: fitZ, rot: view.rot };
  const sh = vShift(-30, fitZ, view.rot); t.cx = (a[0] + b[0]) / 2 + sh[0]; t.cy = (a[1] + b[1]) / 2 + sh[1];
  animate ? animateTo(t) : (Object.assign(view, t), updateNorth());
  invalidate();
}
function clampView() {
  view.z = clamp(view.z, minZ, maxZ);
  view.cx = clamp(view.cx, wbox[0], wbox[2]);
  view.cy = clamp(view.cy, wbox[1], wbox[3]);
}
function toWorld(px, py) {
  const S = Math.pow(2, view.z), c = Math.cos(view.rot), s = Math.sin(view.rot), dx = px - W / 2, dy = py - H / 2;
  return [view.cx + (dx * c + dy * s) / S, view.cy + (-dx * s + dy * c) / S];
}
function scr(wx, wy, S) {
  const c = Math.cos(view.rot), s = Math.sin(view.rot), dx = (wx - view.cx) * S, dy = (wy - view.cy) * S;
  return [W / 2 + dx * c - dy * s, H / 2 + dx * s + dy * c];
}
function anchor(px, py, w) {   // deja el punto del mundo w justo bajo el píxel (px,py)
  const S = Math.pow(2, view.z), c = Math.cos(view.rot), s = Math.sin(view.rot), dx = px - W / 2, dy = py - H / 2;
  view.cx = w[0] - (dx * c + dy * s) / S; view.cy = w[1] - (-dx * s + dy * c) / S;
}
function zoomAt(px, py, dz) {
  const w = toWorld(px, py); view.z = clamp(view.z + dz, minZ, maxZ); anchor(px, py, w);
  clampView(); invalidate();
}
const vShift = (px, z, rot) => [(px * Math.sin(rot)) / Math.pow(2, z), (px * Math.cos(rot)) / Math.pow(2, z)];   // corrimiento vertical en pantalla → mundo
const angNorm = (a) => { a = (a + Math.PI) % (2 * Math.PI); if (a < 0) a += 2 * Math.PI; return a - Math.PI; };
function updateNorth() { const b = $("#btnNorth"); b.hidden = Math.abs(view.rot) < 0.01; b.firstElementChild.style.transform = `rotate(${(-view.rot * 180) / Math.PI}deg)`; }
let animId = 0;
function animateTo(t, ms = 550) {
  cancelAnimationFrame(animId);
  const s = { cx: view.cx, cy: view.cy, z: view.z, rot: view.rot }, t0 = performance.now();
  if (t.rot == null) t.rot = view.rot; const dr = angNorm(t.rot - s.rot);
  const step = (now) => {
    const k = Math.min(1, (now - t0) / ms), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    view.cx = s.cx + (t.cx - s.cx) * e; view.cy = s.cy + (t.cy - s.cy) * e; view.z = s.z + (t.z - s.z) * e; view.rot = s.rot + dr * e;
    clampView(); updateNorth(); invalidate();
    if (k < 1) animId = requestAnimationFrame(step);
  };
  animId = requestAnimationFrame(step);
}
function flyTo(f) {
  let z, cx, cy;
  if (f.bb) {
    const dx = f.bb[2] - f.bb[0], dy = f.bb[3] - f.bb[1];
    z = clamp(Math.log2(Math.min((W * 0.75) / dx, (H * 0.3) / dy)), 15.5, 19);
    cx = (f.bb[0] + f.bb[2]) / 2; cy = (f.bb[1] + f.bb[3]) / 2;
  } else { z = Math.max(view.z, 17.2); cx = f.cw[0]; cy = f.cw[1]; }
  const sh = vShift(H * 0.17, z, view.rot); cx += sh[0]; cy += sh[1];
  animateTo({ cx, cy, z, rot: view.rot });
}

/* ---------- Mapa base dibujado con las calles (roads.json); no depende de servidores de mosaicos ---------- */
let RB = null, RA = null, RL = null;
const M0 = 156543.03392 * Math.cos((31.44 * Math.PI) / 180);   // metros por píxel de pantalla a zoom 0
const bbOf = (pts) => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const q of pts) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; } return [x0, y0, x1, y1]; };
function buildRoadBase(r) {
  if (!r || !r.nodes || !r.ways) return;
  const P = r.nodes.map((n) => G.project(n[0], n[1], 0));
  const mk = (w, extra) => { const pts = w.p.map((i) => P[i]); if (pts.length < 2) return null; let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return Object.assign({ pts, bb: bbOf(pts), len }, extra); };
  RB = r.ways.map((w) => mk(w, { nm: w.n || "", c: w.c == null ? 2 : w.c })).filter(Boolean);
  RA = (r.areas || []).map((w) => mk(w, { k: w.k })).filter(Boolean);
  RL = (r.lines || []).map((w) => mk(w, { k: w.k, w: w.w || 10 })).filter(Boolean);
}
const AREA_STYLE = { g: ["#e3ecd2", null], t: ["#c9dcae", null], w: ["#b9d9f0", "#9cc6e4"], a: ["#d7d9dd", null], b: ["#d8d2c6", "#bdb5a5"] };
function drawRoadBase(S) {
  if (!RB) return;
  const cs = [toWorld(0, 0), toWorld(W, 0), toWorld(0, H), toWorld(W, H)], xs = cs.map((q) => q[0]), ys = cs.map((q) => q[1]);
  const vx0 = Math.min(...xs), vx1 = Math.max(...xs), vy0 = Math.min(...ys), vy1 = Math.max(...ys);
  const inV = (w) => w.bb[2] >= vx0 && w.bb[0] <= vx1 && w.bb[3] >= vy0 && w.bb[1] <= vy1;
  const trace = (w) => w.pts.forEach((p, i) => (i ? ctx.lineTo(sx(p[0], S), sy(p[1], S)) : ctx.moveTo(sx(p[0], S), sy(p[1], S))));
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  // terreno general (campo abierto)
  ctx.fillStyle = "#eef0e4"; ctx.fillRect(-W, -H, 3 * W, 3 * H);
  // áreas: pasto, arboleda, agua, plataformas, edificios
  for (const kind of ["g", "a", "t", "w", "b"]) {
    const [fill, stroke] = AREA_STYLE[kind]; ctx.fillStyle = fill; ctx.beginPath();
    for (const w of (RA || [])) if (w.k === kind && inV(w) && (kind !== "b" || view.z >= 15.2)) { trace(w); ctx.closePath(); }
    ctx.fill(); if (stroke && view.z >= 16) { ctx.lineWidth = 1; ctx.strokeStyle = stroke; ctx.stroke(); }
  }
  // pistas, vías y cursos de agua
  for (const w of (RL || [])) {
    if (!inV(w)) continue; ctx.beginPath(); trace(w);
    if (w.k === "v") { ctx.setLineDash([6, 5]); ctx.lineWidth = 1.6; ctx.strokeStyle = "#9aa3ad"; ctx.stroke(); ctx.setLineDash([]); }
    else if (w.k === "r") { ctx.lineWidth = Math.max(2, (w.w * S) / M0); ctx.strokeStyle = "#d3d6db"; ctx.stroke(); }
    else { ctx.lineWidth = Math.max(1.5, (w.w * S) / M0); ctx.strokeStyle = "#b9d9f0"; ctx.stroke(); }
  }
  // calles (con borde), de menor a mayor jerarquía
  const base = clamp((view.z - 13) * 1.3 + 1.4, 1.4, 8), scale = [1.9, 1.35, 1, 0.55];
  for (const c of [3, 2, 1, 0]) {
    const list = RB.filter((w) => w.c === c && inV(w)); if (!list.length) continue;
    const lw = base * scale[c];
    for (const pass of [0, 1]) {
      ctx.beginPath(); for (const w of list) trace(w);
      if (c === 3) { if (pass) continue; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.2; ctx.strokeStyle = "#b8a99a"; ctx.stroke(); ctx.setLineDash([]); continue; }
      ctx.lineWidth = pass ? lw : lw + 2; ctx.strokeStyle = pass ? "#ffffff" : "#c3cbd6"; ctx.stroke();
    }
  }
}
function drawRoadNames(S) {
  if (!RB || view.z < 16.3) return;
  const used = [], ls = 11;
  for (const w of RB) {
    if (!w.nm || w.len * S < 120) continue;
    const m = w.pts[(w.pts.length / 2) | 0], [x, y] = scr(m[0], m[1], S);
    if (x < 0 || y < 0 || x > W || y > H || used.some((u) => u.n === w.nm && Math.hypot(u.x - x, u.y - y) < 220)) continue;
    used.push({ n: w.nm, x, y }); halo(w.nm, x, y, ls, "#64748b");
  }
}

/* ---------- Tiles (mapa base opcional, con caché offline) ---------- */
const tiles = new Map(), queue = [];
let inflight = 0;
const tileUrl = (z, x, y) => C.TILE_URL.replace("{z}", z).replace("{x}", x).replace("{y}", y);
async function fetchTile(z, x, y) {
  if (!C.TILE_URL) return null;
  const url = tileUrl(z, x, y);
  if (!/^https?:/.test(C.TILE_URL)) { try { const r = await fetch(url); if (r.ok) return createImageBitmap(await r.blob()); } catch (e) {} return null; }   // mosaicos propios: los sirve/guarda el service worker
  let resp = null;
  try {
    if (typeof caches !== "undefined") {
      const cache = await caches.open(C.CACHE_TILES);
      resp = await cache.match(url);
      if (!resp && navigator.onLine) {
        const r = await fetch(url, { mode: "cors" });
        if (r.ok) { cache.put(url, r.clone()); resp = r; }
      }
    } else if (navigator.onLine) {
      const r = await fetch(url, { mode: "cors" }); if (r.ok) resp = r;
    }
  } catch (e) { resp = null; }
  return resp ? createImageBitmap(await resp.blob()) : null;
}
function pump() {
  while (inflight < 6 && queue.length) {
    const [z, x, y] = queue.shift(); inflight++;
    fetchTile(z, x, y).then((b) => { tiles.set(z + "/" + x + "/" + y, b || "fail"); if (b) invalidate(); })
      .catch(() => tiles.set(z + "/" + x + "/" + y, "fail"))
      .finally(() => { inflight--; pump(); });
  }
}
function getTile(z, x, y) {
  const k = z + "/" + x + "/" + y, t = tiles.get(k);
  if (t === undefined) {
    if (tiles.size > 350) { let n = 0; for (const [kk, v] of tiles) { if (n++ > 120) break; if (v && v.close) v.close(); tiles.delete(kk); } }
    tiles.set(k, "loading"); queue.push([z, x, y]); pump(); return null;
  }
  return t && t.close ? t : null;
}
function drawTiles(S) {
  const tz = clamp(Math.round(view.z), C.TILE_MINZ, C.TILE_MAXZ);
  const n = Math.pow(2, tz), ts = 256 * Math.pow(2, view.z - tz);
  const cs = [toWorld(0, 0), toWorld(W, 0), toWorld(0, H), toWorld(W, H)], wxs = cs.map((q) => q[0]), wys = cs.map((q) => q[1]);
  const x0 = Math.floor((Math.min(...wxs) * n) / 256), x1 = Math.floor((Math.max(...wxs) * n) / 256);
  const y0 = Math.floor((Math.min(...wys) * n) / 256), y1 = Math.floor((Math.max(...wys) * n) / 256);
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
    if (x < 0 || y < 0 || x >= n || y >= n) continue;
    const sx = ((x * 256) / n - view.cx) * S + W / 2, sy = ((y * 256) / n - view.cy) * S + H / 2;
    const b = getTile(tz, x, y);
    if (b) ctx.drawImage(b, sx, sy, ts + 0.6, ts + 0.6);
    else if (tz > C.TILE_MINZ) {
      const p = tiles.get(tz - 1 + "/" + (x >> 1) + "/" + (y >> 1));
      if (p && p.close) ctx.drawImage(p, (x & 1) * 128, (y & 1) * 128, 128, 128, sx, sy, ts + 0.6, ts + 0.6);
    }
  }
}

/* ---------- Dibujo ---------- */
let raf = 0;
function invalidate() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); }
const sx = (wx, S) => (wx - view.cx) * S + W / 2;   // coordenadas «sin rotar»; el lienzo aplica la rotación
const sy = (wy, S) => (wy - view.cy) * S + H / 2;

function polyStyle(f) {
  switch (f.t) {
    case "cuadrante": return { fill: "rgba(250,204,21,.30)", stroke: "#a16207", lw: 1.3 };
    case "clero": return { fill: "rgba(168,85,247,.38)", stroke: "#6b21a8", lw: 1.6 };
    case "autoridades": return { fill: "rgba(59,130,246,.38)", stroke: "#1d4ed8", lw: 1.6 };
    case "frente": return { fill: "rgba(251,146,60,.32)", stroke: "#c2410c", lw: 1.3 };
    case "sector": return { fill: rgba(f.color || "#888888", 0.6), stroke: "rgba(0,0,0,.45)", lw: 1 };
    case "servicio": return { fill: "rgba(148,163,184,.55)", stroke: "#475569", lw: 1.4 };
    case "ingreso": return { fill: "rgba(34,197,94,.18)", stroke: "#15803d", lw: 1.5, dash: [8, 6] };
    case "escenario": return { fill: "rgba(239,68,68,.6)", stroke: "#991b1b", lw: 2 };
  }
  return { fill: "rgba(0,0,0,.1)", stroke: "#000", lw: 1 };
}
function polyPath(f, S) {
  ctx.beginPath();
  for (let i = 0; i < f.w.length; i++) { const x = sx(f.w[i][0], S), y = sy(f.w[i][1], S); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.closePath();
}
function halo(text, x, y, size, color, weight = 700) {
  ctx.font = `${weight} ${size}px system-ui,-apple-system,sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.lineJoin = "round"; ctx.lineWidth = 3.5; ctx.strokeStyle = "rgba(255,255,255,.92)"; ctx.strokeText(text, x, y);
  ctx.fillStyle = color; ctx.fillText(text, x, y);
}
function pointVisible(f) {
  if (!layersOn[TYPES[f.t].layer]) return false;
  if ((f.t === "ps" || f.t === "se" || f.t === "sacristia") && view.z < 15.6) return false;
  if ((f.t === "pantalla" || f.t === "bateria") && view.z < 16.2) return false;
  return true;
}
const ICONS = {};   // íconos propios opcionales: poné img/map/<tipo>.svg (o .png) y se usan solos
function loadIcons() { for (const t of Object.keys(TYPES)) for (const ext of ["svg", "png"]) { const im = new Image(); im.onload = () => { if (!ICONS[t]) { ICONS[t] = im; invalidate(); } }; im.src = `img/map/${t}.${ext}`; } }
function drawPoint(f, S) {
  const [x, y] = scr(f.cw[0], f.cw[1], S);
  if (x < -30 || y < -30 || x > W + 30 || y > H + 30) return;
  const big = f.t === "hosp" || f.t === "acc" || f.t === "ref" || f.t === "base";
  const r = big ? 14 : clamp(6 + (view.z - 15.6) * 2.2, 8, 13);
  ctx.lineWidth = 2; ctx.strokeStyle = "#fff"; ctx.fillStyle = TYPES[f.t].color;
  const ic = ICONS[f.t];
  if (ic) { ctx.beginPath(); ctx.arc(x, y, r + 1, 0, 6.2832); ctx.fillStyle = "#fff"; ctx.fill(); ctx.drawImage(ic, x - r, y - r, 2 * r, 2 * r); }
  else if (f.t === "hosp") {
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - r, y - r, 2 * r, 2 * r, 5) : ctx.rect(x - r, y - r, 2 * r, 2 * r);
    ctx.fill(); ctx.stroke(); ctx.fillStyle = "#fff";
    ctx.font = "800 16px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("H", x, y + 1);
  } else {
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = "#fff"; ctx.fillStyle = "#fff"; ctx.lineCap = "round";
    if (f.t === "ps") {
      const a = r * 0.5; ctx.lineWidth = Math.max(2.2, r * 0.28);
      ctx.beginPath(); ctx.moveTo(x - a, y); ctx.lineTo(x + a, y); ctx.moveTo(x, y - a); ctx.lineTo(x, y + a); ctx.stroke();
    } else {
      ctx.font = `800 ${Math.round(r * (f.t === "acc" || f.t === "ref" || f.t === "base" ? 0.78 : f.t === "pantalla" || f.t === "bateria" ? 0.7 : 0.95))}px system-ui`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(f.t === "se" ? "SE" : f.t === "pantalla" ? "PA" : f.t === "sacristia" ? "S" : f.t === "bateria" ? "BT" : f.t === "base" ? "CO" : f.t === "ref" ? "i" : "IN", x, y + 0.5);
    }
  }
  if (big && view.z >= 14.2) {
    ctx.font = "700 12px system-ui,sans-serif";
    const half = ctx.measureText(f.name).width / 2 + 6;
    halo(f.name, clamp(x, half, W - half), y + r + 11, 12, TYPES[f.t].color);
  }
  else if (view.z >= 17.3) halo(shortOf(f), x, y + r + 9, 11, TYPES[f.t].color);
}
function draw() {
  if (!data) { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H); return; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const S = Math.pow(2, view.z);
  ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(view.rot); ctx.translate(-W / 2, -H / 2);
  if (layersOn.base) {
    drawTiles(S);
    drawRoadBase(S);
    if (!RB) { ctx.fillStyle = "rgba(255,255,255,.18)"; ctx.fillRect(-W, -H, 3 * W, 3 * H); }
  }
  // polígonos
  for (const t of POLY_DRAW) {
    if (!layersOn[TYPES[t].layer]) continue;
    for (const f of feats) {
      if (f.t !== t) continue;
      const st = polyStyle(f); polyPath(f, S);
      ctx.fillStyle = st.fill; ctx.fill();
      ctx.setLineDash(st.dash || []); ctx.lineWidth = st.lw; ctx.strokeStyle = st.stroke; ctx.lineJoin = "round"; ctx.stroke(); ctx.setLineDash([]);
    }
  }
  // selección de polígono
  if (sel && sel.w && sel.ring) {
    polyPath(sel, S); ctx.lineWidth = 6; ctx.strokeStyle = "#fff"; ctx.stroke();
    ctx.lineWidth = 3; ctx.strokeStyle = "#2563eb"; ctx.stroke();
  }
  drawRoute(S);
  ctx.restore();
  // rótulos de polígonos
  const ls = clamp(10 + (view.z - 15) * 3, 10, 24);
  for (const f of feats) {
    if (!f.ring || !layersOn[TYPES[f.t].layer]) continue;
    const [x, y] = scr(f.cw[0], f.cw[1], S);
    if (x < -50 || y < -50 || x > W + 50 || y > H + 50) continue;
    if (f.t === "cuadrante" || f.t === "frente") { if (view.z >= 15) halo(f.id, x, y, ls, "#422006"); }
    else if (f.t === "clero" || f.t === "autoridades") {
      if (view.z >= 15) halo(f.id, x, y - (view.z >= 16.3 ? ls * 0.45 : 0), ls, TYPES[f.t].color);
      if (view.z >= 16.3) halo(f.t === "clero" ? "CLERO" : "AUTORIDADES", x, y + ls * 0.6, Math.max(9, ls * 0.55), TYPES[f.t].color);
    }
    else if (f.t === "sector") { if (view.z >= 17.2) halo(shortOf(f), x, y, 11, "#111", 600); }
    else if (f.t === "servicio") { if (view.z >= 16) halo(f.name, x, y, 11, "#334155", 700); }
    else if (f.t === "escenario") { if (view.z >= 16.2) halo("Escenario Papal", x, y - 14, 12, "#7f1d1d"); }
  }
  drawRoadNames(S);
  drawDoors(S);
  drawMeasure(S);
  // puntos
  for (const t of ["se", "ps", "acc", "hosp", "ref", "base", "bateria", "pantalla", "sacristia"]) for (const f of feats) if (f.t === t && pointVisible(f)) drawPoint(f, S);
  if (sel && !sel.ring) {
    const [x, y] = scr(sel.cw[0], sel.cw[1], S);
    ctx.beginPath(); ctx.arc(x, y, 20, 0, 6.2832); ctx.lineWidth = 6; ctx.strokeStyle = "#fff"; ctx.stroke();
    ctx.lineWidth = 3; ctx.strokeStyle = "#2563eb"; ctx.stroke();
  }
  drawUser(S);
  if (layersOn.base) { halo(C.TILE_ATTRIBUTION, 62, H - 8, 10, "#475569", 500); }
}
function drawDoors(S) {
  if (!layersOn.door) return;
  for (const f of feats) { const d = DOORS[f.id]; if (!d) continue;
    const q = G.project(d[0], d[1], 0), [x, y] = scr(q[0], q[1], S); if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
    ctx.beginPath(); ctx.arc(x, y, 6, 0, 6.2832); ctx.fillStyle = "#f59e0b"; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = "#fff"; ctx.stroke(); }
}
function drawMeasure(S) {   // línea recta entre vos y el escenario (solo distancia lineal)
  if (!measure || !stageF || !pos) return;
  const p = G.project(pos.ll[0], pos.ll[1], 0), a = scr(p[0], p[1], S), b = scr(stageF.cw[0], stageF.cw[1], S);
  ctx.setLineDash([8, 7]); ctx.lineWidth = 3; ctx.strokeStyle = "#b91c1c"; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.setLineDash([]);
}
function drawRoute(S) {
  const r = route && route.res; if (!r || !r.ok) return;
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  for (const seg of r.segs) {
    if (seg.kind === "out" || seg.kind === "exit") continue;   // nunca se dibuja una recta ficticia si no hay calles
    ctx.beginPath(); seg.pts.forEach((p, i) => { const q = G.project(p[0], p[1], 0), x = sx(q[0], S), y = sy(q[1], S); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    if (seg.kind === "net" || seg.kind === "street") { ctx.setLineDash([]); ctx.lineWidth = 9; ctx.strokeStyle = "#fff"; ctx.stroke(); ctx.lineWidth = 5; ctx.strokeStyle = "#2563eb"; ctx.stroke(); }
    else { ctx.setLineDash([3, 9]); ctx.lineWidth = 2.5; ctx.strokeStyle = "rgba(37,99,235,.35)"; ctx.stroke(); ctx.setLineDash([]); }   // empalmes / tramos orientativos: casi transparentes
  }
  // flechitas de sentido sobre los tramos de red
  for (const seg of r.segs) {
    if (seg.kind !== "net" && seg.kind !== "street") continue;
    for (let i = 0; i + 1 < seg.pts.length; i++) {
      const a = G.project(seg.pts[i][0], seg.pts[i][1], 0), b = G.project(seg.pts[i + 1][0], seg.pts[i + 1][1], 0);
      const ax = sx(a[0], S), ay = sy(a[1], S), bx = sx(b[0], S), by = sy(b[1], S), len = Math.hypot(bx - ax, by - ay);
      if (len < 70) continue;
      for (let t = 0.5; t < 1; t += 1) { const n = Math.floor(len / 140); for (let k = 0; k <= n; k++) {
        const f = n ? (k + 0.5) / (n + 1) : 0.5, mx = ax + (bx - ax) * f, my = ay + (by - ay) * f;
        ctx.save(); ctx.translate(mx, my); ctx.rotate(Math.atan2(by - ay, bx - ax)); ctx.fillStyle = "#fff"; ctx.strokeStyle = "#1d4ed8"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-5, -6); ctx.lineTo(-5, 6); ctx.closePath(); ctx.stroke(); ctx.fill(); ctx.restore(); } break; }
    }
  }
  const e = G.project(r.end[0], r.end[1], 0), ex = sx(e[0], S), ey = sy(e[1], S);
  ctx.beginPath(); ctx.arc(ex, ey, 9, 0, 6.2832); ctx.fillStyle = "#dc2626"; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = "#fff"; ctx.stroke();
  ctx.beginPath(); ctx.arc(ex, ey, 22, 0, 6.2832); ctx.lineWidth = 3; ctx.strokeStyle = "#2563eb"; ctx.stroke();
  if (route.from) { const a = G.project(r.start[0], r.start[1], 0); ctx.beginPath(); ctx.arc(sx(a[0], S), sy(a[1], S), 8, 0, 6.2832); ctx.fillStyle = "#16a34a"; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = "#fff"; ctx.stroke(); }
}
function drawUser(S) {
  if (!pos) return;
  const p = G.project(pos.ll[0], pos.ll[1], 0), [x, y] = scr(p[0], p[1], S);
  const mpp = (40075016.686 * Math.cos((pos.ll[1] * Math.PI) / 180)) / (256 * S), rr = pos.acc / mpp;
  if (rr > 8) { ctx.beginPath(); ctx.arc(x, y, rr, 0, 6.2832); ctx.fillStyle = "rgba(37,99,235,.13)"; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = "rgba(37,99,235,.4)"; ctx.stroke(); }
  const dir = currentHeading();
  if (dir != null) {
    ctx.save(); ctx.translate(x, y); ctx.rotate((dir * Math.PI) / 180 + view.rot);
    const g = ctx.createLinearGradient(0, 0, 0, -44); g.addColorStop(0, "rgba(37,99,235,.55)"); g.addColorStop(1, "rgba(37,99,235,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-17, -44); ctx.lineTo(17, -44); ctx.closePath(); ctx.fill(); ctx.restore();
  }
  ctx.beginPath(); ctx.arc(x, y, 9, 0, 6.2832); ctx.fillStyle = "#2563eb"; ctx.fill(); ctx.lineWidth = 3.5; ctx.strokeStyle = "#fff"; ctx.stroke();
}

/* ---------- Interacción ---------- */
const ptrs = new Map(); let pinch = null;
cv.addEventListener("pointerdown", (e) => {
  cv.setPointerCapture(e.pointerId); cancelAnimationFrame(animId);
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t: performance.now(), moved: false });
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, ang: Math.atan2(b.y - a.y, b.x - a.x) }; ptrs.forEach((p) => (p.moved = true)); }
});
cv.addEventListener("pointermove", (e) => {
  const p = ptrs.get(e.pointerId); if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
  if (ptrs.size === 1) {
    if (!p.moved && Math.hypot(p.x - p.x0, p.y - p.y0) < 7) return;
    if (!p.moved) { p.moved = true; setFollow(false); }
    const S = Math.pow(2, view.z), c = Math.cos(view.rot), sn = Math.sin(view.rot);
    view.cx -= (dx * c + dy * sn) / S; view.cy -= (-dx * sn + dy * c) / S; clampView(); invalidate();
  } else if (ptrs.size === 2 && pinch) {
    const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2, ang = Math.atan2(b.y - a.y, b.x - a.x);
    const w = toWorld(pinch.cx, pinch.cy);                       // punto del mapa bajo los dedos (antes)
    view.z = clamp(view.z + Math.log2(d / pinch.d), minZ, maxZ);
    let da = angNorm(ang - pinch.ang), acc = (pinch.acc || 0) + da, on = pinch.on;
    if (!on) { if (Math.abs(acc) > 0.3) { on = true; da = acc - Math.sign(acc) * 0.3; } else da = 0; }   // zona muerta de ~17°: no gira sin querer al hacer zoom
    view.rot = angNorm(view.rot + da * 0.85);
    anchor(cx, cy, w); clampView(); updateNorth(); invalidate();
    pinch = { d, cx, cy, ang, acc, on }; setFollow(false);
  }
});
function endPtr(e) {
  const p = ptrs.get(e.pointerId); if (!p) return;
  ptrs.delete(e.pointerId);
  if (e.type === "pointerup" && !p.moved && performance.now() - p.t < 600) tap(p.x, p.y);
  if (ptrs.size < 2 && pinch) { pinch = null; if (Math.abs(view.rot) < 0.17 && view.rot !== 0) animateTo({ cx: view.cx, cy: view.cy, z: view.z, rot: 0 }, 200); }   // imán al norte
}
cv.addEventListener("pointerup", endPtr); cv.addEventListener("pointercancel", endPtr);
cv.addEventListener("wheel", (e) => { e.preventDefault(); zoomAt(e.clientX, e.clientY, -e.deltaY * 0.0016); }, { passive: false });
cv.addEventListener("dblclick", (e) => zoomAt(e.clientX, e.clientY, 1));

function hit(px, py) {
  const S = Math.pow(2, view.z);
  let best = null, bd = 20 * 20;
  for (const f of feats) {
    if (f.ring || !pointVisible(f)) continue;
    const q = scr(f.cw[0], f.cw[1], S), dx = q[0] - px, dy = q[1] - py, d2 = dx * dx + dy * dy;
    if (d2 < bd) { bd = d2; best = f; }
  }
  if (best) return best;
  const w = toWorld(px, py);
  for (const t of POLY_HIT) {
    if (!layersOn[TYPES[t].layer]) continue;
    for (const f of feats) if (f.t === t && w[0] >= f.bb[0] && w[0] <= f.bb[2] && w[1] >= f.bb[1] && w[1] <= f.bb[3] && G.inRing(w, f.w)) return f;
  }
  return null;
}
function tap(px, py) {
  closePanels(); hideResults();
  const f = hit(px, py);
  if (f) select(f, false); else { sel = null; renderSheet(); invalidate(); }
}

/* ---------- Selección, ficha y cercanos ---------- */
function select(f, fly = true) {
  sel = f; renderSheet(); invalidate();
  if (fly) flyTo(f);
  try { history.replaceState(null, "", "#" + encodeURIComponent(f.id)); } catch (e) {}
}
function nearest(type, ll, exclude) {
  let best = null, bd = Infinity;
  for (const f of feats) if (f.t === type && f !== exclude) { const d = G.distance(ll, f.ll); if (d < bd) { bd = d; best = f; } }
  return best ? { f: best, d: bd } : null;
}
function renderSheet() {
  const sheet = $("#sheet");
  if (!sel) { sheet.hidden = true; layout(); return; }
  const f = sel, T = TYPES[f.t];
  let h = `<h3>${esc(titleOf(f))}</h3><div class="kv"><span class="badge" style="background:${T.color}">${esc(T.label)}</span>${esc(f.uso || "")}</div>`;
  if (f.t === "ps") h += `<div class="kv">Ubicación: <b>Cuadrante ${esc(f.where)}</b></div>`;
  else if (f.where) h += `<div class="kv">Ubicación: <b>${esc(f.where)}</b></div>`;
  if (pos) { const d = G.distance(pos.ll, f.ll); h += `<div class="kv">A <b>${G.fmtDist(d)}</b> de vos en línea recta</div>`; }
  if (stageF && f !== stageF && f.t !== "escenario") h += `<div class="kv">Al escenario: <b>${G.fmtDist(G.distance(f.ll, stageF.ll))}</b> en línea recta</div>`;
  if (f.t === "clero" || f.t === "autoridades") h += `<div class="kv small">Es el cuadrante completo, con todos sus subsectores.</div><div class="warn">Zona de acceso restringido.</div>`;
  if (f.t === "sector") h += `<div class="kv small">Parte del cuadrante ${esc((f.id.split(" · ")[0]) || "")}.</div>`;
  if (f.aprox) h += `<div class="kv small">Ubicación aproximada (±10–15 m), tomada del plano.</div>`;
  const kinds = { ps: ["se", "hosp"], se: ["ps", "hosp"], hosp: ["ps", "se"], acc: ["ps", "hosp"] }[f.t] || ["ps", "se"];
  const rows = kinds.map((k) => nearest(k, f.ll, f)).filter(Boolean);
  if (rows.length) {
    h += `<div class="near"><div class="kv">${f.ring ? "Más cercanos (desde el centro)" : "Más cercanos"}</div>` +
      rows.map((r, i) => `<button data-sel="${esc(r.f.id)}"><span>${esc(titleOf(r.f))}</span><span>${G.fmtDist(r.d)}</span></button>`).join("") + `</div>`;
  }
  h += `<div class="actions"><button id="aGmaps" class="ghost">🗺 Google Maps a pie hasta el ingreso</button></div>`;
  h += `<div class="actions"><button id="aGo">Ir hasta acá</button><button id="aFrom" class="ghost">Salir desde acá</button><button id="aShare" class="ghost">Compartir</button></div>`;
  $("#sheetBody").innerHTML = h; sheet.hidden = false; sheet.scrollTop = 0; layout();
}
$("#sheetBody").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.sel) { const f = feats.find((x) => x.id === b.dataset.sel); if (f) select(f); }
  else if (b.id === "aGo") goTo(sel);
  else if (b.id === "aGmaps") openGmaps(sel);
  else if (b.id === "aFrom") { pendingFrom = sel; toast("Punto de partida: " + titleOf(sel) + ". Ahora elegí el destino y tocá «Ir hasta acá»."); }
  else if (b.id === "aShare") share(sel);
});
$("#sheetClose").onclick = () => { sel = null; renderSheet(); invalidate(); };
function gateFor(f) {
  const acc = feats.filter((x) => x.t === "acc"), N = acc.find((x) => x.id === "ACC-N"), S = acc.find((x) => x.id === "ACC-S");
  if (f.t === "acc") return f;
  if (f.t === "ingreso") return acc.find((x) => (f.id || f.name || "").toLowerCase().includes(x.id === "ACC-N" ? "norte" : "sur")) || N;
  if (f.predio === "Frente") return N;
  const ref = pos ? pos.ll : f.ll; return G.distance(ref, N.ll) <= G.distance(ref, S.ll) ? N : S;
}
function openGmaps(f) {   // necesita internet; Google arma el camino a pie hasta el ingreso
  const g = gateFor(f); if (!g) return;
  const u = "https://www.google.com/maps/dir/?api=1&travelmode=walking&destination=" + g.ll[1] + "," + g.ll[0];
  toast("Se abre Google Maps (necesita internet) hasta: " + g.name + ". Adentro seguí con este mapa.", 5000);
  window.open(u, "_blank", "noopener");
}
function share(f) {
  const url = location.href.split("#")[0] + "#" + encodeURIComponent(f.id), text = titleOf(f) + " · Visita del Papa, FAdeA";
  if (navigator.share) navigator.share({ title: text, url }).catch(() => {});
  else if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => toast("Enlace copiado"));
  else toast(url, 8000);
}

/* ---------- Rutas por pasillos ---------- */
let ingresoMode = "auto";
try { ingresoMode = localStorage.getItem("papa.ingreso") || "auto"; } catch (e) {}
const INGRESO_LABEL = { auto: "Ingreso: el más conveniente", N: "Ingreso: Norte", S: "Ingreso: Sur" };
let lastCalc = null, calcT = 0;

function originLL() { return route ? (route.from ? route.from.ll : pos ? pos.ll : null) : null; }
function recalc(force) {
  if (!route || !nav) return;
  const o = originLL(); if (!o) { route.res = null; return; }
  const now = performance.now();
  if (!force && route.res && lastCalc && G.distance(lastCalc, o) < 4 && now - calcT < 5000) return;
  lastCalc = o; calcT = now;
  try { route.res = nav.route(o, route.to, { ingreso: ingresoMode }); }
  catch (e) { route.res = { ok: false, msg: "Error calculando la ruta." }; }
}
function goTo(f) {
  if (!nav) { toast("Todavía se está cargando la red de pasillos…"); return; }
  if (pendingFrom && pendingFrom !== f) { route = { to: f, from: pendingFrom, arrived: false }; pendingFrom = null; }
  else { route = { to: f, from: null, arrived: false }; if (!pos) { startGPS(); toast("Esperando señal GPS… (o usá «Salir desde acá» en tu punto de partida)", 5000); } }
  sel = f; $("#sheet").hidden = true; layout(); try { history.replaceState(null, "", "#" + encodeURIComponent(f.id)); } catch (e) {}
  recalc(true); updateHud(); invalidate();
  if (route.res && route.res.ok) fitRoute();
}
function fitRoute() {
  const r = route && route.res; if (!r || !r.ok) return;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  const o = originLL();
  const pts = [];
  r.segs.forEach((s) => s.kind !== "out" && s.kind !== "exit" && s.pts.forEach((p) => pts.push(p)));
  if (r.dist > 1500) { let acc = 0, k = pts.length - 1; while (k > 0 && acc < 1200) { acc += G.distance(pts[k], pts[k - 1]); k--; } pts.splice(0, k); }   // recorrido largo: encuadrar el final
  if (!pts.length) return;
  for (const p of pts) { const q = G.project(p[0], p[1], 0); x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }
  const dx = Math.max(x1 - x0, 1e-7), dy = Math.max(y1 - y0, 1e-7);
  const z = clamp(Math.log2(Math.min((W * 0.8) / dx, (H * 0.42) / dy)), minZ, 18.5);
  animateTo({ cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 + (H * 0.1) / Math.pow(2, z), z, rot: 0 });
}
function currentHeading() { return heading != null ? heading : pos && pos.gh != null ? pos.gh : null; }
function updateHud() {
  const hud = $("#hud");
  keepAwake(!!route);
  if (!route) { hud.hidden = true; $("#steps").hidden = true; layout(); return; }
  hud.hidden = false;
  $("#hudTitle").textContent = "🚶 A pie · Hacia " + titleOf(route.to) + " · referencial";
  const ing = $("#hudIngreso"), o = originLL();
  if (!o) {
    $("#hudDist").textContent = "Buscando GPS…"; $("#hudNote").textContent = "Activá la ubicación del dispositivo";
    $("#arrow").style.opacity = ".3"; ing.hidden = true; layout(); return;
  }
  recalc(false);
  const r = route.res;
  if (!r || !r.ok) { $("#hudDist").textContent = "Sin ruta"; $("#hudNote").textContent = (r && r.msg) || ""; $("#arrow").style.opacity = ".3"; ing.hidden = true; layout(); return; }
  ing.hidden = !r.outside && !(route.from && r.gate); ing.textContent = INGRESO_LABEL[ingresoMode] + " ▾";
  const s0 = r.steps[0], s1 = r.steps[1], dir = route.from ? null : currentHeading();
  const arrived = !route.from && r.dist < C.ARRIVE_M;
  $("#arrow").style.opacity = "1";
  if (s0 && s0.bearing != null) $("#arrow").style.transform = `rotate(${Math.round(s0.bearing - (dir || 0) - 90)}deg)`;
  if (arrived) $("#hudDist").textContent = "¡Llegaste!";
  else if (!s1 || s1.final) $("#hudDist").textContent = (s0 && s0.dist ? G.fmtDist(s0.dist) + " · " : "") + r.steps[r.steps.length - 1].action;
  else $("#hudDist").textContent = "En " + G.fmtDist(s0.dist) + ": " + s1.action.charAt(0).toLowerCase() + s1.action.slice(1);
  const tail = "Total " + G.fmtDist(r.dist) + " · " + Math.max(1, Math.round(r.secs / 60)) + " min";
  $("#hudNote").textContent = (route.from ? "Desde " + titleOf(route.from) + " · " : "") + (s0 && s0.kind !== "end" ? s0.place + " · " : "") + tail;
  if (arrived && !route.arrived) { route.arrived = true; if (navigator.vibrate) navigator.vibrate([200, 100, 200]); toast("¡Llegaste a " + titleOf(route.to) + "!"); }
  renderSteps(); layout();
}
function renderSteps() {
  const r = route && route.res; if (!r || !r.ok) return;
  const T = (f) => (f.t === "clero" || f.t === "autoridades") ? "<li class='warn'>Zona de acceso restringido (" + esc(TYPES[f.t].label) + "). Los ingresos protocolares siguen las indicaciones de tu pase.</li>" : "";
  $("#stepList").innerHTML = T(route.to) + r.notes.map((n) => `<li class="warn">${esc(n)}</li>`).join("") +
    r.steps.map((s, i) => `<li class="st ${s.kind}"><span class="n">${s.final ? "★" : i + 1}</span><span>${esc(s.action)}${s.dist ? `<small>${G.fmtDist(s.dist)} ${esc(s.place || "")}</small>` : ""}</span></li>`).join("");
}
$("#hudClose").onclick = () => { route = null; pendingFrom = null; $("#steps").hidden = true; updateHud(); invalidate(); };
$("#hudSteps").onclick = () => { const h = !$("#steps").hidden; closePanels(); if (!h) { renderSteps(); $("#steps").hidden = false; } };
$("#hudIngreso").onclick = () => {
  ingresoMode = ingresoMode === "auto" ? "N" : ingresoMode === "N" ? "S" : "auto";
  try { localStorage.setItem("papa.ingreso", ingresoMode); } catch (e) {}
  recalc(true); updateHud(); invalidate(); fitRoute(); toast(INGRESO_LABEL[ingresoMode] + " · Si tenés pase protocolar, seguí el ingreso que te indicaron con el pase.", 5000);
};

/* ---------- GPS y brújula ---------- */
function setFollow(v) { follow = v; $("#btnLocate").classList.toggle("follow", v); }
function startGPS() {
  if (!navigator.geolocation) { toast("Este dispositivo no tiene GPS"); return; }
  if (watchId !== null) return;
  requestCompass();
  watchId = navigator.geolocation.watchPosition(onPos, onPosErr, { enableHighAccuracy: true, maximumAge: opt.saver ? 15000 : 2000, timeout: 30000 });
  $("#btnLocate").classList.add("on"); $("#gpsAsk").hidden = true;
}
function onPos(p) {
  const first = !pos, c = p.coords;
  pos = { ll: [c.longitude, c.latitude], acc: c.accuracy, gh: c.heading != null && !isNaN(c.heading) && (c.speed || 0) > 0.7 ? c.heading : null };
  let where = null;
  for (const t of ["clero", "autoridades", "cuadrante", "frente"]) { for (const f of feats) if (f.t === t && G.inRing(pos.ll, f.ring)) { where = f.id; break; } if (where) break; }
  const dSite = G.distance(pos.ll, [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2]);
  const pill = $("#gps"); pill.hidden = false;
  pill.textContent = "GPS ±" + Math.round(pos.acc) + " m" + (where ? " · " + where : dSite > 1500 ? " · lejos del predio" : "");
  pill.className = "pill " + (pos.acc <= 25 ? "ok" : pos.acc > 60 ? "off" : "");
  if (first) {
    if (dSite > 3000) toast("Estás a " + G.fmtDist(dSite) + " del predio. El GPS funcionará cuando estés cerca.", 5000);
    else if (!route) { setFollow(true); const q = G.project(pos.ll[0], pos.ll[1], 0); animateTo({ cx: q[0], cy: q[1], z: Math.max(view.z, 17) }); }
  }
  if (follow && !first) { const q = G.project(pos.ll[0], pos.ll[1], 0); view.cx = q[0]; view.cy = q[1]; clampView(); }
  if (route && first && !route.from) fitRoute();
  updateHud(); updateMeasure(); if (sel) renderSheet(); invalidate();
}
function onPosErr(e) {
  if (e.code === 1) { toast("Permiso de ubicación denegado. Habilitalo en los ajustes del navegador.", 6000); if (watchId !== null) navigator.geolocation.clearWatch(watchId); watchId = null; $("#btnLocate").classList.remove("on"); $("#gpsAsk").hidden = false; }
  else if (e.code === 2) toast("No se pudo obtener señal GPS. Revisá que la ubicación esté activada (¿modo avión?) y probá al aire libre.", 6000);
}
$("#gpsAsk").onclick = () => { startGPS(); toast("Buscando tu ubicación… Permití el acceso cuando te lo pida.", 5000); };
$("#btnLocate").onclick = () => {
  if (watchId === null) { startGPS(); toast("Buscando tu ubicación…"); return; }
  if (!pos) { toast("Esperando señal GPS…"); return; }
  const q = G.project(pos.ll[0], pos.ll[1], 0);
  animateTo({ cx: q[0], cy: q[1], z: Math.max(view.z, 17) }); setFollow(!follow);
};
function requestCompass() {
  const D = window.DeviceOrientationEvent;
  if (D && typeof D.requestPermission === "function") D.requestPermission().then((r) => r === "granted" && listenCompass()).catch(() => {});
  else listenCompass();
}
let lastCompass = 0;
function listenCompass() {
  if (compassOn) return; compassOn = true;
  const h = (e) => {
    let a = null;
    if (typeof e.webkitCompassHeading === "number") a = e.webkitCompassHeading;
    else if ((e.absolute || e.type === "deviceorientationabsolute") && e.alpha != null) a = (360 - e.alpha) % 360;
    if (a == null) return;
    a = (a + ((screen.orientation && screen.orientation.angle) || 0)) % 360;
    if (heading == null) heading = a; else { const d = ((a - heading + 540) % 360) - 180; heading = (heading + d * 0.25 + 360) % 360; }
    const now = performance.now(); if (now - lastCompass < (opt.saver ? 700 : 120)) return; lastCompass = now;
    updateHud(); invalidate();
  };
  addEventListener("deviceorientationabsolute", h, true); addEventListener("deviceorientation", h, true);
}

/* ---------- Búsqueda ---------- */
const qEl = $("#q"), resEl = $("#results");
function glyph(f) { return f.t === "ps" ? "✚" : f.t === "se" ? "SE" : f.t === "hosp" ? "H" : f.t === "acc" || f.t === "ingreso" ? "⇒" : f.t === "escenario" ? "★" : f.t === "sector" ? "▦" : f.id.slice(0, 2); }
function hideResults() { resEl.hidden = true; }
function search() {
  const q = norm(qEl.value.trim()); $("#qclear").hidden = !q;
  if (!q) { hideResults(); return; }
  const toks = q.split(/\s+/);
  let list = feats.filter((f) => toks.every((t) => f.text.includes(t)));
  const ref = pos ? pos.ll : null;
  list.sort((a, b) => {
    const ra = norm(a.id) === q ? 0 : norm(a.id).startsWith(q) ? 1 : 2, rb = norm(b.id) === q ? 0 : norm(b.id).startsWith(q) ? 1 : 2;
    if (ra !== rb) return ra - rb;
    if (ref) return G.distance(ref, a.ll) - G.distance(ref, b.ll);
    return a.id.localeCompare(b.id, "es", { numeric: true });
  });
  list = list.slice(0, 14);
  resEl.innerHTML = list.length ? list.map((f) => `<li data-id="${esc(f.id)}"><span class="dot" style="background:${TYPES[f.t].color}">${esc(glyph(f))}</span><span class="t"><b>${esc(titleOf(f))}</b><small>${esc(TYPES[f.t].label)}${f.where && f.t !== "se" ? " · " + esc(f.t === "ps" ? "Cuadrante " + f.where : f.where) : ""}</small></span>${ref ? `<span class="d">${G.fmtDist(G.distance(ref, f.ll))}</span>` : ""}</li>`).join("") : `<li><span class="t"><small>Sin resultados para «${esc(qEl.value)}»</small></span></li>`;
  resEl.hidden = false;
}
qEl.addEventListener("input", search);
qEl.addEventListener("keydown", (e) => { if (e.key === "Enter") { const li = resEl.querySelector("li[data-id]"); if (li) pickResult(li.dataset.id); } });
$("#qclear").onclick = () => { qEl.value = ""; search(); qEl.focus(); };
resEl.addEventListener("click", (e) => { const li = e.target.closest("li[data-id]"); if (li) pickResult(li.dataset.id); });
function pickResult(id) { const f = feats.find((x) => x.id === id); if (!f) return; qEl.blur(); hideResults(); select(f); }
function updateMeasure() {
  const el = $("#measure"); $("#chipPapa").classList.toggle("on", measure);
  if (!measure || !stageF) { el.hidden = true; return; }
  el.hidden = false;
  if (!pos) { el.innerHTML = "📏 <b>¿A cuánto estás del Papa?</b><small>Activá el GPS (◎) para medir la distancia en línea recta al escenario.</small>"; return; }
  const d = G.distance(pos.ll, stageF.ll);
  el.innerHTML = `📏 Estás a <b>${G.fmtDist(d)}</b> del escenario<small>Distancia en línea recta, no es un recorrido a pie.</small>`;
}
$("#chipPapa").addEventListener("click", () => {
  measure = !measure; if (measure && !pos) startGPS();
  if (measure && stageF) { const z = Math.min(view.z, 16.2); if (pos) { const a = pos.ll, b = stageF.ll; const q = G.project((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0); animateTo({ cx: q[0], cy: q[1], z, rot: view.rot }); } }
  updateMeasure(); invalidate();
});
document.querySelectorAll("#chips button[data-near]").forEach((b) => b.addEventListener("click", () => {
  const ref = pos ? pos.ll : G.unproject(view.cx, view.cy, 0), n = nearest(b.dataset.near, ref);
  if (!n) return;
  closePanels(); hideResults(); select(n.f);
  if (pos) { goTo(n.f); } else toast("Mostrando el más cercano al centro del mapa. Activá el GPS (◎) para que te guíe.", 5000);
}));

/* ---------- Modo noche y ahorro de batería ---------- */
const opt = { dark: null, saver: false };
try { const d = localStorage.getItem("papa.dark"); opt.dark = d === null ? 0 : +d; opt.saver = localStorage.getItem("papa.saver") === "1"; } catch (e) { opt.dark = 0; }
function applyOpts() {
  document.body.classList.toggle("dark", !!opt.dark);
  const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = opt.dark ? "#0b1220" : "#1e3a8a";
  $("#optDark").checked = !!opt.dark; $("#optSaver").checked = opt.saver;
  if (opt.saver) keepAwake(false); else if (route) keepAwake(true);
  if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; startGPS(); }
  invalidate();
}
$("#optDark").addEventListener("change", (e) => { opt.dark = e.target.checked ? 1 : 0; try { localStorage.setItem("papa.dark", opt.dark); } catch (x) {} applyOpts(); });
$("#optSaver").addEventListener("change", (e) => { opt.saver = e.target.checked; try { localStorage.setItem("papa.saver", opt.saver ? 1 : 0); } catch (x) {} applyOpts(); toast(opt.saver ? "Ahorro de batería activado" : "Ahorro de batería desactivado"); });

/* ---------- ¿Dónde estoy? ---------- */
let whereText = "", whereSms = "";
function whereMsg() {
  const ll = pos.ll; let zone = null;
  for (const t of ["clero", "autoridades", "cuadrante", "frente"]) { for (const f of feats) if (f.t === t && G.inRing(ll, f.ring)) { zone = f; break; } if (zone) break; }
  let place = zone ? "en el cuadrante " + zone.id : null;
  if (!place && nav) { const pi = nav.pointInfo(ll); place = pi.kind === "pasillo" ? pi.place : pi.kind === "zona" ? "dentro de " + (pi.zone || "") : "fuera del predio"; }
  const ps = nearest("ps", ll), se = nearest("se", ll), st = stageF ? G.distance(ll, stageF.ll) : null;
  const L = [`Estoy ${place || "en el predio"} (GPS ±${Math.round(pos.acc)} m).`];
  if (ps) L.push(`Puesto sanitario más cercano: ${locTxt(ps.f) || ps.f.id}, a ${G.fmtDist(ps.d)}.`);
  if (se) L.push(`Salida de emergencia más cercana: ${locTxt(se.f) || se.f.id}, a ${G.fmtDist(se.d)}.`);
  if (st != null) L.push(`Al escenario: ${G.fmtDist(st)} en línea recta.`);
  L.push(`Coordenadas: ${ll[1].toFixed(5)}, ${ll[0].toFixed(5)}`, `https://maps.google.com/?q=${ll[1].toFixed(6)},${ll[0].toFixed(6)}`);
  const hh = new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });
  const link = location.href.split("#")[0] + "#@" + ll[1].toFixed(5) + "," + ll[0].toFixed(5);
  const plain = (t) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");   // sin tildes: entra en menos SMS
  const sms = plain(`Hola, mi ubicacion a las ${hh} h es ${place || "en el predio"} (GPS +-${Math.round(pos.acc)} m). Abrila en el mapa: ${link}`);
  return { text: L.join("\n"), place: place || "en el predio", sms };
}
function openWhere() {
  closePanels(); hideResults();
  if (watchId === null) startGPS();
  if (!pos) { toast("Esperando señal GPS… probá al aire libre y con la ubicación activada.", 5000); return; }
  const m = whereMsg(); whereText = m.text; whereSms = m.sms;
  $("#whereBody").innerHTML = `<div class="big">${esc(m.place)}</div><pre>${esc(m.text)}</pre><div class="small">Si no hay señal de datos, podés dictarlo por radio o mandarlo por mensaje de texto.</div>`;
  $("#where").hidden = false;
}
$("#chipWhere").addEventListener("click", openWhere);
$("#whereCopy").onclick = () => { if (navigator.clipboard) navigator.clipboard.writeText(whereText).then(() => toast("Mensaje copiado")); else toast(whereText, 9000); };
$("#whereSms").onclick = () => { location.href = "sms:?&body=" + encodeURIComponent(whereSms); };
$("#whereShare").onclick = () => { if (navigator.share) navigator.share({ text: whereText }).catch(() => {}); else $("#whereCopy").click(); };

/* ---------- Avisos de último momento (avisos.json, con red primero) ---------- */
let avisosSeen = {}; try { avisosSeen = JSON.parse(localStorage.getItem("papa.avisos") || "{}"); } catch (e) {}
async function loadAvisos() {
  let j = null;
  try { const r = await fetch("avisos.json?t=" + Date.now(), { cache: "no-store" }); if (r.ok) { j = await r.json(); try { localStorage.setItem("papa.avisos.last", JSON.stringify(j)); } catch (e) {} } } catch (e) {}
  if (!j) { try { j = JSON.parse(localStorage.getItem("papa.avisos.last") || "null"); } catch (e) {} }
  renderAvisos(j);
}
function renderAvisos(j) {
  const box = $("#avisos"), now = Date.now();
  const items = ((j && j.items) || []).filter((a) => a && a.texto && (!a.hasta || Date.parse(a.hasta) > now) && !avisosSeen[a.id + "|" + (a.v || j.actualizado || "")]);
  box.innerHTML = items.map((a) => `<div class="av ${a.nivel === "alerta" ? "alerta" : ""}" data-k="${esc(a.id + "|" + (a.v || j.actualizado || ""))}"><b>${a.nivel === "alerta" ? "⚠ " : "ℹ "}</b>${esc(a.texto)}${j.actualizado ? `<small>Actualizado: ${esc(j.actualizado)}</small>` : ""}<button aria-label="Cerrar aviso">✕</button></div>`).join("");
  document.body.classList.toggle("has-avisos", items.length > 0);
  document.body.style.setProperty("--avH", items.length ? box.offsetHeight + 8 + "px" : "0px");
}
$("#avisos").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; const a = b.closest(".av"); avisosSeen[a.dataset.k] = 1; try { localStorage.setItem("papa.avisos", JSON.stringify(avisosSeen)); } catch (x) {} a.remove(); document.body.style.setProperty("--avH", $("#avisos").offsetHeight ? $("#avisos").offsetHeight + 8 + "px" : "0px"); });
addEventListener("online", loadAvisos); setInterval(() => { if (navigator.onLine && document.visibilityState === "visible") loadAvisos(); }, 300000);

/* ---------- Paneles ---------- */
function closePanels() { $("#layers").hidden = true; $("#info").hidden = true; $("#steps").hidden = true; $("#where").hidden = true; }
document.querySelectorAll("[data-close]").forEach((b) => (b.onclick = closePanels));
$("#btnLayers").onclick = () => { const h = !$("#layers").hidden; closePanels(); if (!h) { $("#layers").hidden = false; refreshOffState(); } };
$("#btnInfo").onclick = () => { const h = !$("#info").hidden; closePanels(); if (!h) $("#info").hidden = false; };
$("#btnNorth").onclick = () => animateTo({ cx: view.cx, cy: view.cy, z: view.z, rot: 0 }, 300);
$("#btnFit").onclick = () => { setFollow(false); fitView(true); };
function layout() {
  const sh = $("#sheet"), hud = $("#hud");
  const sH = sh.hidden ? 0 : sh.offsetHeight, hH = hud.hidden ? 0 : hud.offsetHeight + 10;
  document.body.style.setProperty("--sheetH", sH + "px");
  document.body.style.setProperty("--lift", sH + hH + 18 + "px");
  document.body.classList.toggle("sheet-open", !sh.hidden); document.body.classList.toggle("hud-open", !hud.hidden);
}
function buildLayers() {
  $("#layerList").innerHTML = LAYERS.map((l) => `<div class="row"><input type="checkbox" id="ly-${l.id}" ${layersOn[l.id] ? "checked" : ""}><label for="ly-${l.id}"><span class="sw" style="background:${l.color}"></span>${l.name}</label></div>`).join("");
  LAYERS.forEach((l) => $("#ly-" + l.id).addEventListener("change", (e) => {
    layersOn[l.id] = e.target.checked ? 1 : 0;
    try { localStorage.setItem("papa.layers", JSON.stringify(layersOn)); } catch (x) {}
    invalidate();
  }));
}
function buildInfo() {
  $("#infoTitle").textContent = data.meta.titulo;
  const sw = (c, t) => `<div class="row"><span class="sw" style="background:${c};margin:0"></span><label>${t}</label></div>`;
  $("#infoBody").innerHTML = `
    <img src="img/wordmark-dorado.svg" class="wm" alt="Bienvenidos todos · Vayan y anuncien">
    <p class="small">Misa y vigilia · <b>10 de noviembre de 2026</b> · Plano act. 14/10/2026</p>
    <table class="cap">
      <tr><td>Capacidad predio FAdeA (49 cuadrantes)</td><td>686.000</td></tr>
      <tr><td>Capacidad predio frente (9 cuadrantes)</td><td>162.000</td></tr>
      <tr><td>Capacidad total (plano)</td><td>848.000</td></tr>
      <tr><td>Área del evento</td><td>86 + 16 ha</td></tr>
    </table>
    <h2>Referencias</h2>
    ${sw("#facc15", "Cuadrante de público general")}${sw("#a855f7", "C1 · Clero")}${sw("#3b82f6", "D1 · Autoridades")}${sw("#fb923c", "Cuadrantes del predio frente (L–P)")}
    ${sw("#ef4444", "Escenario Papal (40 × 40 m)")}${sw("#22c55e", "Zonas de ingreso norte y sur")}
    <div class="row"><span class="badge" style="background:#dc2626;margin:0">✚</span><label>Puesto sanitario</label></div>
    <div class="row"><span class="badge" style="background:#15803d;margin:0">SE</span><label>Salida de emergencia</label></div>
    <div class="row"><span class="badge" style="background:#7f1d1d;margin:0">H</span><label>Hospital modular / de pronta atención</label></div>
    <h2>Importante</h2>
    <p class="small">• Mapa <b>no oficial</b>, de referencia interna para el equipo de voluntarios y voluntarias. Se basa en el mapa de la Municipalidad de Córdoba y en el mapa distribuido por la coordinación de voluntarios y voluntarias.<br>
    • Hasta FAdeA se llega a pie por la vía pública (Circunvalación está cortada al tránsito). Adentro, la ruta sigue <b>los pasillos</b>; los cuadrantes solo se cruzan si es tu destino o estás adentro.<br>
    • Cada persona entra por el ingreso que le corresponde. Las <b>entradas protocolares</b> siguen las indicaciones recibidas con los pases.<br>
    • Adentro cada sector usa su pulsera, y solo se sale al baño en los horarios que permita el control de cada cuadrante o patio.<br>
    • <b>C1 (Clero)</b> y <b>D1 (Autoridades)</b> son los cuadrantes completos; sus subsectores forman parte de ellos.<br>
    • Las distancias al escenario y a las pantallas son <b>en línea recta</b>, no recorridos.<br>
    • Los pasos de la ruta son <b>referenciales</b>. El GPS en multitudes puede tener error de varios metros.<br>
    • Podés girar el mapa con dos dedos; el botón de brújula lo vuelve al norte.</p>
    <div class="aviso"><b>Aviso</b><p>El trazado y la logística de movimiento dentro del predio dependerán, en última instancia, de las indicaciones de seguridad y del equipo de coordinación del voluntariado para la Visita Papal. Prevalecen siempre sus indicaciones.</p></div>
    <p class="small">Versión ${esc(C.BUILD)} · Mapa no oficial para el equipo de voluntarios y voluntarias.</p>
    <button class="wide ghost" id="reopenWelcome">Ver aviso e instalación</button>`;
}

/* ---------- Offline: mapa base y estado ---------- */
function baseTileList() {
  const out = [];
  for (let z = C.TILE_MINZ; z <= C.TILE_MAXZ; z++) out.push(...G.tilesFor(bounds, z, C.TILE_PAD_DEG));
  return out;
}
async function refreshOffState() {
  const el = $("#offState"), local = !/^https?:/.test(C.TILE_URL), msg = [];
  if (!C.TILE_URL) { el.innerHTML = "App, plano, rutas y calles: " + (self.__swReady ? "<b>guardados ✔</b>" : "instalando…"); $("#btnDl").hidden = true; return; }
  msg.push(self.__swReady ? "App, plano y rutas: <b>guardados ✔</b>" : "App, plano y rutas: instalando…");
  try {
    const list = baseTileList(); let n = 0;
    if (typeof caches !== "undefined") {
      if (local) { for (const [z, x, y] of list) if (await caches.match(new URL(tileUrl(z, x, y), location.href).href)) n++; }
      else { const c = await caches.open(C.CACHE_TILES); const keys = new Set((await c.keys()).map((r) => r.url)); n = list.filter(([z, x, y]) => keys.has(new URL(tileUrl(z, x, y), location.href).href)).length; }
    }
    msg.push(local && n === 0 ? "Mapa base de calles: no incluido en esta versión" : `Mapa base de calles: <b>${n}/${list.length}</b> mosaicos${n >= list.length ? " ✔" : ""}`);
  } catch (e) {}
  $("#btnDl").hidden = local; el.innerHTML = msg.join("<br>");
}
$("#btnDl").onclick = async () => {
  if (!navigator.onLine) { toast("Necesitás conexión para descargar el mapa base."); return; }
  if (typeof caches === "undefined") { toast("Este navegador no permite guardar archivos sin conexión."); return; }
  const btn = $("#btnDl"), bar = $("#dlbar"), fill = $("#dlfill"); btn.disabled = true; bar.hidden = false;
  const list = baseTileList(); let done = 0, bad = 0;
  const cache = await caches.open(C.CACHE_TILES);
  for (let i = 0; i < list.length; i += 6) {
    await Promise.all(list.slice(i, i + 6).map(async ([z, x, y]) => {
      const url = tileUrl(z, x, y);
      try { if (!(await cache.match(url))) { const r = await fetch(url, { mode: "cors" }); if (r.ok) await cache.put(url, r); else bad++; } } catch (e) { bad++; }
      done++; fill.style.width = (done / list.length) * 100 + "%";
    }));
  }
  btn.disabled = false; setTimeout(() => (bar.hidden = true), 1200);
  toast(bad ? `Descarga con ${bad} fallos. Reintentá con mejor señal.` : "Mapa base guardado para usar sin conexión ✔");
  tiles.forEach((v, k) => { if (v === "fail") tiles.delete(k); });
  refreshOffState(); invalidate();
};
function setNet() {
  const el = $("#net"), on = navigator.onLine;
  el.textContent = on ? "En línea" : "Sin conexión"; el.className = "pill " + (on ? "" : "off");
  if (on) { tiles.forEach((v, k) => { if (v === "fail") tiles.delete(k); }); invalidate(); }
}
addEventListener("online", setNet); addEventListener("offline", setNet);

/* ---------- Bienvenida, aviso e instalación ---------- */
const UA = navigator.userAgent || "";
const isIOS = /iPad|iPhone|iPod/.test(UA) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isAndroid = /Android/i.test(UA);
const inApp = /FBAN|FBAV|FB_IAB|Instagram|Line\/|Twitter|MicroMessenger|Snapchat|TikTok|GSA\//i.test(UA);
const isStandalone = () => (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
let deferredPrompt = null;
addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferredPrompt = e; renderInstall(); });
addEventListener("appinstalled", () => { deferredPrompt = null; renderInstall(); toast("App instalada ✔"); });
function renderInstall() {
  const box = $("#installBox"), pill = $("#instPill"), done = isStandalone(); if (!box) return;
  pill.hidden = done;
  let h;
  if (done) h = `<div class="inst ok">✔ App instalada. Abrila siempre desde su ícono.</div>`;
  else if (inApp) h = `<div class="inst warn"><b>Abrí este enlace en tu navegador</b><br>Estás dentro de otra app (Instagram, Facebook…), que no permite instalar ni usar sin conexión. Tocá ⋯ o «Abrir en el navegador» y elegí ${isIOS ? "Safari" : "Chrome"}.<button id="copyLink" class="wide ghost">Copiar enlace</button></div>`;
  else if (deferredPrompt) h = `<div class="inst"><b>Instalala en tu celular</b> para usarla sin conexión el día del evento.<button id="doInstall" class="wide">Instalar app</button></div>`;
  else if (isIOS) h = `<div class="inst"><b>Instalala en tu iPhone / iPad</b> (desde Safari):<ol><li>Tocá el botón <b>Compartir</b> ⬆︎ (en la barra de Safari).</li><li>Elegí <b>«Agregar a inicio»</b> (deslizá el menú hacia abajo si no lo ves).</li><li>Tocá <b>Agregar</b> y abrí la app desde el ícono.</li></ol></div>`;
  else if (isAndroid) h = `<div class="inst"><b>Instalala en tu Android</b> (desde Chrome):<ol><li>Tocá el menú <b>⋮</b> (arriba a la derecha).</li><li>Elegí <b>«Instalar aplicación»</b> o <b>«Agregar a la pantalla principal»</b>.</li><li>Confirmá y abrila desde el ícono.</li></ol></div>`;
  else h = `<div class="inst">Podés instalarla desde el ícono ⊕ de la barra de direcciones del navegador.</div>`;
  if (!done) h += `<p class="small">Después de instalarla, abrila <b>una vez con internet (mejor con wifi)</b> y esperá el aviso «Lista sin conexión ✔».</p>`;
  box.innerHTML = h;
  const di = $("#doInstall"); if (di) di.onclick = async () => { try { deferredPrompt.prompt(); await deferredPrompt.userChoice; } catch (e) {} deferredPrompt = null; renderInstall(); };
  const cl = $("#copyLink"); if (cl) cl.onclick = () => navigator.clipboard && navigator.clipboard.writeText(location.href.split("#")[0]).then(() => toast("Enlace copiado"));
}
const ACK = "papa.ack.v1";
function openWelcome(acked) {
  renderInstall(); $("#okAviso").checked = !!acked; $("#welcomeGo").disabled = !acked; $("#welcomeGo").textContent = acked ? "Volver al mapa" : "Entrar al mapa";
  $("#welcome").hidden = false; $("#welcome .card").scrollTop = 0;
}
function initWelcome() {
  let acked = false; try { acked = localStorage.getItem(ACK) === "1"; } catch (e) {}
  $("#okAviso").onchange = (e) => ($("#welcomeGo").disabled = !e.target.checked);
  $("#welcomeGo").onclick = () => { try { localStorage.setItem(ACK, "1"); } catch (e) {} $("#welcome").hidden = true; };
  $("#instPill").onclick = () => openWelcome(true);
  const rw = $("#reopenWelcome"); if (rw) rw.onclick = () => { closePanels(); openWelcome(true); };
  renderInstall(); if (!acked) openWelcome(false);
}
let readyTries = 0;
async function setReadyPill() {
  const el = $("#ready");
  try {
    await navigator.serviceWorker.ready;
    let ok = true, msg = "Lista sin conexión ✔";
    if (C.TILE_URL && !/^https?:/.test(C.TILE_URL)) {
      const r = await fetch("tiles/index.json").catch(() => null);
      if (r && r.ok) { const list = await r.json(); let n = 0; for (const p of list) if (await caches.match(new URL(p, location.href).href)) n++; ok = n >= list.length; if (!ok) msg = "Descargando mapa… " + Math.round((100 * n) / list.length) + "%"; }
    }
    el.hidden = false; el.textContent = msg; el.className = "pill " + (ok ? "ok" : "");
    if (!ok && readyTries++ < 80) setTimeout(setReadyPill, 2500);
  } catch (e) {}
}
let wl = null;
async function keepAwake(on) {
  if (on && opt.saver) return;
  try {
    if (on && !wl && "wakeLock" in navigator && document.visibilityState === "visible") { wl = await navigator.wakeLock.request("screen"); wl.addEventListener("release", () => (wl = null)); }
    else if (!on && wl) { await wl.release(); wl = null; }
  } catch (e) { wl = null; }
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && route) keepAwake(true); });

/* ---------- Arranque ---------- */
async function init() {
  buildLayers(); resize();
  if (C.BACK_URL) { const b = $("#btnBack"); b.href = C.BACK_URL; b.textContent = "← " + (C.BACK_LABEL || "Volver"); b.hidden = false; }
  try { data = await (await fetch("data.json")).json(); }
  catch (e) { toast("No se pudieron cargar los datos. Abrí la app una vez con internet.", 8000); return; }
  try { const ex = await (await fetch("extras.json")).json(); EXTRAS = (ex.items || []).filter((x) => x && x.id && (x.pt || x.ring) && TYPES[x.t]).map((x) => Object.assign({ uso: x.nota || "", aprox: 1 }, x, { nota: "" })); } catch (e) {}
  const mh = /^#@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(location.hash || "");
  if (mh && Math.abs(+mh[1]) <= 90 && Math.abs(+mh[2]) <= 180) { sharedPos = [+mh[2], +mh[1]]; EXTRAS.push({ id: "UBI", t: "ref", name: "Ubicación compartida", pt: sharedPos, uso: "Ubicación enviada por mensaje" }); }
  prep(); computeFit(); fitView(false); buildInfo(); setNet();
  try {
    const nd = await (await fetch("nav.json")).json();
    let roads = null; try { const rr = await fetch("roads.json"); if (rr.ok) roads = await rr.json(); } catch (e) {}
    buildRoadBase(roads);
    nav = self.Nav.create(nd, feats, roads);
    DOORS = nd.doors || {};
  } catch (e) { toast("No se pudo cargar la red de pasillos: las rutas no estarán disponibles.", 7000); }
  let id = decodeURIComponent((location.hash || "").slice(1));
  if (sharedPos) id = "UBI";
  const f = id && feats.find((x) => x.id === id);
  if (f) select(f); else invalidate();
  initWelcome(); applyOpts(); loadAvisos(); loadIcons();
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
  if ("serviceWorker" in navigator) {
    const had = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener("controllerchange", () => { if (had) toast("Hay una versión nueva del mapa. Cerrá y volvé a abrir la app para usarla.", 9000); });
    navigator.serviceWorker.register("sw.js").catch(() => {});
    navigator.serviceWorker.ready.then(() => {
      self.__swReady = true; setReadyPill();
      try { if (!localStorage.getItem("papa.offlineToast")) { localStorage.setItem("papa.offlineToast", "1"); toast("Listo: el plano funciona sin conexión ✔"); } } catch (e) {}
    });
  }
}
addEventListener("resize", resize);
addEventListener("orientationchange", () => setTimeout(resize, 250));
init();
})();
