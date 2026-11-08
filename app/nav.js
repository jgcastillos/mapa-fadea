/* nav.js — ruteo peatonal por pasillos (sin dependencias; navegador y Node).
   Reglas:
   - Los cuadrantes/subsectores/escenario están bloqueados; solo se "abren" el del origen y el del destino.
   - Desde afuera se entra por Ingreso Norte o Sur (auto / norte-invitación / sur).
   - Papa Fest (L–P) solo se alcanza por Ingreso Norte y la calle peatonal. */
(function (root) {
"use strict";
const R = 6371008.8, D2R = Math.PI / 180, SQ2 = Math.SQRT2, WALK = 1.2;
const NAMEABLE = { cuadrante: 1, clero: 1, autoridades: 1, frente: 1 };
const CARD = ["norte", "noreste", "este", "sureste", "sur", "suroeste", "oeste", "noroeste"];
const cardinal = (b) => CARD[Math.round((((b % 360) + 360) % 360) / 45) % 8];
const MAX_EXIT = 900;          // m máx. de tramo exterior en línea recta (hospitales fuera del recinto)
const ZONE_COST = 1.6;         // caminar dentro de un cuadrante abierto cuesta más que por el pasillo

function ptSegDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  const t = L === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
function inRing(x, y, ring) {
  let ins = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}
function ringDist(x, y, ring) {
  let d = Infinity;
  for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; d = Math.min(d, ptSegDist(x, y, a[0], a[1], b[0], b[1])); }
  return d;
}

function create(nd, feats) {
  const lon0 = nd.origin[0], lat0 = nd.origin[1];
  const mx = R * Math.cos(lat0 * D2R) * D2R, my = R * D2R;
  const toXY = (ll) => [(ll[0] - lon0) * mx, (ll[1] - lat0) * my];
  const toLL = (p) => [lon0 + p[0] / mx, lat0 + p[1] / my];
  const CELL = nd.cell, X0 = nd.x0, Y0 = nd.y0, nx = nd.nx, ny = nd.ny, N = nx * ny;

  /* ---- grilla ---- */
  const bin = atob(nd.rle), cls = new Uint8Array(N);
  for (let i = 0, p = 0; i < bin.length; i += 3) {
    const n = bin.charCodeAt(i + 1) | (bin.charCodeAt(i + 2) << 8);
    cls.fill(bin.charCodeAt(i), p, p + n); p += n;
  }
  const zoneClass = {}; nd.zones.forEach((id, i) => (zoneClass[id] = i + 2));
  const zbb = new Int32Array(256 * 4);
  for (let c = 0; c < 256; c++) { zbb[c * 4] = 1e9; zbb[c * 4 + 1] = 1e9; zbb[c * 4 + 2] = -1; zbb[c * 4 + 3] = -1; }
  for (let j = 0, k = 0; j < ny; j++) for (let i = 0; i < nx; i++, k++) {
    const c = cls[k]; if (c < 2) continue;
    const o = c * 4; if (i < zbb[o]) zbb[o] = i; if (j < zbb[o + 1]) zbb[o + 1] = j; if (i > zbb[o + 2]) zbb[o + 2] = i; if (j > zbb[o + 3]) zbb[o + 3] = j;
  }
  // distancia (en celdas) a lo no caminable, para centrar la ruta en el pasillo
  const clear = new Float32Array(N);
  for (let k = 0; k < N; k++) clear[k] = cls[k] === 1 ? 1e9 : 0;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i; if (clear[k] === 0) continue; let d = clear[k];
    if (i > 0) d = Math.min(d, clear[k - 1] + 1); if (j > 0) { d = Math.min(d, clear[k - nx] + 1); if (i > 0) d = Math.min(d, clear[k - nx - 1] + SQ2); if (i < nx - 1) d = Math.min(d, clear[k - nx + 1] + SQ2); }
    clear[k] = d;
  }
  for (let j = ny - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) {
    const k = j * nx + i; if (clear[k] === 0) continue; let d = clear[k];
    if (i < nx - 1) d = Math.min(d, clear[k + 1] + 1); if (j < ny - 1) { d = Math.min(d, clear[k + nx] + 1); if (i < nx - 1) d = Math.min(d, clear[k + nx + 1] + SQ2); if (i > 0) d = Math.min(d, clear[k + nx - 1] + SQ2); }
    clear[k] = d;
  }

  /* ---- geometría de features en metros ---- */
  const rings = new Map(), pts = new Map();
  const llOf = (f) => f.ll || (f.pt ? f.pt : [f.ring.reduce((s, p) => s + p[0], 0) / f.ring.length, f.ring.reduce((s, p) => s + p[1], 0) / f.ring.length]);
  for (const f of feats) { if (f.ring) rings.set(f, f.ring.map(toXY)); else pts.set(f, toXY(f.pt)); }
  const nameable = feats.filter((f) => NAMEABLE[f.t]);
  const ingresoFeats = feats.filter((f) => f.t === "ingreso");
  const calleXY = nd.calle.pts.map(toXY), calleHalf = nd.calle.w / 2;
  const pfRings = (nd.pf || []).map((r) => r.map(toXY));
  const accFeat = (id) => feats.find((f) => f.id === id);
  const cellOf = (x, y) => { const i = Math.floor((x - X0) / CELL), j = Math.floor((y - Y0) / CELL); return i < 0 || j < 0 || i >= nx || j >= ny ? -1 : j * nx + i; };
  const cellXY = (k) => [X0 + ((k % nx) + 0.5) * CELL, Y0 + (((k / nx) | 0) + 0.5) * CELL];

  function nearestPass(x, y, rc) {
    const u = (x - X0) / CELL, v = (y - Y0) / CELL, cx = Math.floor(u), cy = Math.floor(v);
    let best = -1, bd = Infinity;
    for (let j = cy - rc; j <= cy + rc; j++) { if (j < 0 || j >= ny) continue;
      for (let i = cx - rc; i <= cx + rc; i++) { if (i < 0 || i >= nx) continue;
        const k = j * nx + i; if (cls[k] !== 1) continue;
        const d = (i + 0.5 - u) ** 2 + (j + 0.5 - v) ** 2; if (d < bd) { bd = d; best = k; } } }
    return best < 0 ? null : { idx: best, d: Math.sqrt(bd) * CELL };
  }
  function distCalle(x, y) { let d = Infinity; for (let i = 0; i + 1 < calleXY.length; i++) d = Math.min(d, ptSegDist(x, y, calleXY[i][0], calleXY[i][1], calleXY[i + 1][0], calleXY[i + 1][1])); return d; }

  /* ---- salidas de la red hacia terreno abierto (SE y calle) ---- */
  const exits = [];
  for (const f of feats) if (f.t === "se") { const xy = pts.get(f), s = nearestPass(xy[0], xy[1], 8); if (s) exits.push({ idx: s.idx, xy, kind: "se", id: f.id }); }
  for (let i = 0; i + 1 < calleXY.length; i++) {
    const a = calleXY[i], b = calleXY[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(L / 25));
    for (let t = 0; t <= n; t++) { const x = a[0] + ((b[0] - a[0]) * t) / n, y = a[1] + ((b[1] - a[1]) * t) / n, s = nearestPass(x, y, 8); if (s) exits.push({ idx: s.idx, xy: [x, y], kind: "calle" }); }
  }
  const gates = {};
  for (const [k, id] of [["N", "ACC-N"], ["S", "ACC-S"]]) {
    const f = accFeat(id); if (!f) continue; const xy = pts.get(f), s = nearestPass(xy[0], xy[1], 15);
    if (s) gates[k] = { idx: s.idx, xy, name: f.name };
  }

  /* ---- búsqueda A* ---- */
  const gA = new Float32Array(N), came = new Int32Array(N), closed = new Uint32Array(N), seen = new Uint32Array(N);
  const goalMark = new Uint8Array(N); let gen = 0;
  const pass = new Uint8Array(256);   // 0 bloqueado · 1 pasillo · 2 zona abierta
  let hk = new Float64Array(1 << 16), hv = new Int32Array(1 << 16), hn = 0;
  function hpush(k, v) {
    if (hn === hk.length) { const a = new Float64Array(hn * 2), b = new Int32Array(hn * 2); a.set(hk); b.set(hv); hk = a; hv = b; }
    let i = hn++; while (i > 0) { const p = (i - 1) >> 1; if (hk[p] <= k) break; hk[i] = hk[p]; hv[i] = hv[p]; i = p; } hk[i] = k; hv[i] = v;
  }
  function hpop() {
    const top = hv[0]; hn--;
    if (hn > 0) { const k = hk[hn], v = hv[hn]; let i = 0;
      for (;;) { let c = 2 * i + 1; if (c >= hn) break; if (c + 1 < hn && hk[c + 1] < hk[c]) c++; if (hk[c] >= k) break; hk[i] = hk[c]; hv[i] = hv[c]; i = c; }
      hk[i] = k; hv[i] = v; }
    return top;
  }
  const DX = [1, -1, 0, 0, 1, 1, -1, -1], DY = [0, 0, 1, -1, 1, -1, 1, -1];
  function setPass(open) { pass.fill(0); pass[1] = 1; for (const c of open) if (c >= 2) pass[c] = 2; }
  function search(starts, gbox, all) {
    gen++; hn = 0;
    const h = (i, j) => { if (all || !gbox) return 0; const dx = Math.max(gbox[0] - i, 0, i - gbox[2]), dy = Math.max(gbox[1] - j, 0, j - gbox[3]); return (dx + dy + (SQ2 - 2) * Math.min(dx, dy)) * CELL; };
    for (const s of starts) { seen[s.idx] = gen; gA[s.idx] = s.g; came[s.idx] = -1; hpush(s.g + h(s.idx % nx, (s.idx / nx) | 0), s.idx); }
    while (hn) {
      const cur = hpop(); if (closed[cur] === gen) continue; closed[cur] = gen;
      if (!all && goalMark[cur]) return cur;
      const ci = cur % nx, cj = (cur / nx) | 0, gc = gA[cur];
      for (let d = 0; d < 8; d++) {
        const ni = ci + DX[d], nj = cj + DY[d]; if (ni < 0 || nj < 0 || ni >= nx || nj >= ny) continue;
        const nk = nj * nx + ni, pc = pass[cls[nk]]; if (!pc || closed[nk] === gen) continue;
        if (d >= 4 && (!pass[cls[cj * nx + ni]] || !pass[cls[nj * nx + ci]])) continue;   // no cortar esquinas
        let step = d >= 4 ? SQ2 : 1;
        if (pc === 2) step *= ZONE_COST; else { const c = clear[nk]; step *= 1 + (c <= 1 ? 1 : c <= 2 ? 0.4 : c <= 3 ? 0.1 : 0); }
        const g = gc + step * CELL;
        if (seen[nk] !== gen || g < gA[nk]) { seen[nk] = gen; gA[nk] = g; came[nk] = cur; hpush(g + h(ni, nj), nk); }
      }
    }
    return -1;
  }
  const trace = (k) => { const o = []; while (k >= 0) { o.push(k); k = came[k]; } return o.reverse(); };

  /* ---- suavizado (line-of-sight) ---- */
  function los(a, b) {
    const ax = (a % nx) + 0.5, ay = ((a / nx) | 0) + 0.5, bx = (b % nx) + 0.5, by = ((b / nx) | 0) + 0.5;
    const L = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.ceil(L / 0.4));
    for (let s = 0; s <= n; s++) {
      const k = Math.floor(ay + ((by - ay) * s) / n) * nx + Math.floor(ax + ((bx - ax) * s) / n), pc = pass[cls[k]];
      if (!pc || (pc === 1 && clear[k] < 1.5)) return false;
    }
    return true;
  }
  function smooth(cells) {
    if (cells.length < 3) return cells.slice();
    const out = [cells[0]]; let i = 0;
    while (i < cells.length - 1) { let j = cells.length - 1; while (j > i + 1 && !los(cells[i], cells[j])) j--; out.push(cells[j]); i = j; }
    return out;
  }

  /* ---- destino y origen ---- */
  function nearPF(xy) {
    for (const r of pfRings) { if (inRing(xy[0], xy[1], r) || ringDist(xy[0], xy[1], r) < 80) return true; } return false;
  }
  function destOf(f) {
    const ll = llOf(f), xy = toXY(ll);
    if (f.ring) {
      const rg = rings.get(f), c = zoneClass[f.id];
      if (c) { const o = c * 4; return { kind: "zone", cls: c, open: [c], gbox: [zbb[o], zbb[o + 1], zbb[o + 2], zbb[o + 3]], xy, north: f.predio === "Frente", name: f.name, f }; }
      // polígono caminable (ingresos): objetivo = celdas de pasillo dentro del polígono
      const xs = rg.map((p) => p[0]), ys = rg.map((p) => p[1]), idxs = [];
      const i0 = Math.max(0, Math.floor((Math.min(...xs) - X0) / CELL)), i1 = Math.min(nx - 1, Math.floor((Math.max(...xs) - X0) / CELL));
      const j0 = Math.max(0, Math.floor((Math.min(...ys) - Y0) / CELL)), j1 = Math.min(ny - 1, Math.floor((Math.max(...ys) - Y0) / CELL));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const k = j * nx + i; if (cls[k] === 1 && inRing(X0 + (i + 0.5) * CELL, Y0 + (j + 0.5) * CELL, rg)) idxs.push(k); }
      if (!idxs.length) return { kind: "outside", xy, open: [], north: nearPF(xy), name: f.name, f };
      return { kind: "cells", idxs, gbox: [i0, j0, i1, j1], open: [], xy, north: nearPF(xy), name: f.name, f, poly: true };
    }
    const k = cellOf(xy[0], xy[1]), c = k >= 0 ? cls[k] : 0, north = nearPF(xy);
    if (k >= 0 && c === 1) return { kind: "cells", idxs: [k], gbox: [k % nx, (k / nx) | 0, k % nx, (k / nx) | 0], open: [], xy, north, name: titleOf(f), f };
    if (k >= 0 && c >= 2) return { kind: "cells", idxs: [k], gbox: [k % nx, (k / nx) | 0, k % nx, (k / nx) | 0], open: [c], xy, north, name: titleOf(f), f, inZone: c };
    const s = nearestPass(xy[0], xy[1], 12);
    if (s) return { kind: "cells", idxs: [s.idx], gbox: [s.idx % nx, (s.idx / nx) | 0, s.idx % nx, (s.idx / nx) | 0], open: [], xy, north, name: titleOf(f), f };
    return { kind: "outside", xy, open: [], north, name: titleOf(f), f };
  }
  const titleOf = (f) => (f.t === "ps" ? "Puesto sanitario " + f.id : f.t === "se" ? "Salida de emergencia " + f.id : f.name);
  function analyzeOrigin(ll) {
    const xy = toXY(ll), k = cellOf(xy[0], xy[1]);
    if (k >= 0) { const c = cls[k]; if (c === 1) return { mode: "net", idx: k, open: [], xy }; if (c >= 2) return { mode: "net", idx: k, open: [c], xy, zone: c }; }
    const s = nearestPass(xy[0], xy[1], 15);
    if (s) return { mode: "net", idx: s.idx, open: [], xy, snapped: s.d };
    return { mode: "outside", xy };
  }

  /* ---- resolver ---- */
  function solve(sidx, open, dest) {
    setPass(open.concat(dest.open));
    if (dest.kind === "outside") return solveExit(sidx, dest);
    let marked = [];
    if (dest.kind === "zone") { const [a, b, c, d] = dest.gbox; for (let j = b; j <= d; j++) for (let i = a; i <= c; i++) { const k = j * nx + i; if (cls[k] === dest.cls) { goalMark[k] = 1; marked.push(k); } } }
    else for (const k of dest.idxs) { goalMark[k] = 1; marked.push(k); }
    const g = search([{ idx: sidx, g: 0 }], dest.gbox, false);
    for (const k of marked) goalMark[k] = 0;
    if (g < 0) return dest.xy ? solveExit(sidx, dest) : null;
    return { cells: trace(g), cost: gA[g] };
  }
  function solveExit(sidx, dest) {
    search([{ idx: sidx, g: 0 }], null, true);
    let best = null, bs = Infinity;
    for (const e of exits) {
      if (closed[e.idx] !== gen) continue;
      const ex = Math.hypot(e.xy[0] - dest.xy[0], e.xy[1] - dest.xy[1]); if (ex > MAX_EXIT) continue;
      const tot = gA[e.idx] + ex; if (tot < bs) { bs = tot; best = e; }
    }
    if (!best) return null;
    return { cells: trace(best.idx), cost: bs, exit: { from: best.xy, to: dest.xy, kind: best.kind, id: best.id } };
  }

  /* ---- nombres de lugares e instrucciones ---- */
  function placeName(xy) {
    for (const f of ingresoFeats) if (inRing(xy[0], xy[1], rings.get(f))) return "por el " + f.name;
    if (distCalle(xy[0], xy[1]) <= calleHalf + 2) return "por la calle peatonal (Av. Fuerza Aérea)";
    const k = cellOf(xy[0], xy[1]);
    if (k >= 0 && cls[k] >= 2) { const f = nameable.find((q) => zoneClass[q.id] === cls[k]); if (f) return "dentro de " + f.id; }
    const ds = nameable.map((f) => ({ id: f.id, d: ringDist(xy[0], xy[1], rings.get(f)) })).sort((a, b) => a.d - b.d);
    if (ds[0].d <= 16 && ds[1].d <= 16) return `por el pasillo entre ${ds[0].id} y ${ds[1].id}`;
    if (ds[0].d <= 24) return `junto a ${ds[0].id}`;
    return "por el perímetro";
  }
  const turnText = (t) => { const a = Math.abs(t), side = t > 0 ? "derecha" : "izquierda";
    return a < 20 ? "Seguí derecho" : a < 60 ? "Girá levemente a la " + side : a < 135 ? "Girá a la " + side : "Giro cerrado a la " + side; };

  // eje del predio (regresión x~y) para decir "borde oeste/este" en tramos largos por el perímetro
  let axis = [0, 0];
  { const c = nameable.filter((f) => f.predio === "FAdeA").map((f) => toXY(llOf(f))), n = c.length || 1;
    const my_ = c.reduce((s, p) => s + p[1], 0) / n, mx_ = c.reduce((s, p) => s + p[0], 0) / n;
    let sxy = 0, syy = 0; for (const p of c) { sxy += (p[0] - mx_) * (p[1] - my_); syy += (p[1] - my_) ** 2; }
    const b = syy ? sxy / syy : 0; axis = [mx_ - b * my_, b]; }
  const sideOf = (xy) => (xy[0] < axis[0] + axis[1] * xy[1] ? "oeste" : "este");

  function makeSteps(legs, dest, gateName) {
    // 1) tramos crudos con su(s) lugar(es)
    let raw = [];
    for (const L of legs) {
      const dx = L.b[0] - L.a[0], dy = L.b[1] - L.a[1], d = Math.hypot(dx, dy); if (d < 0.5) continue;
      const pl = {};
      if (L.kind === "net") { const n = Math.max(1, Math.min(7, Math.ceil(d / 60)));
        for (let i = 0; i < n; i++) { const t = (i + 0.5) / n, nm = placeName([L.a[0] + dx * t, L.a[1] + dy * t]); pl[nm] = (pl[nm] || 0) + d / n; } }
      else pl[L.kind === "out" ? "por fuera del recinto" : "por fuera del perímetro"] = d;
      raw.push({ kind: L.kind, a: L.a, b: L.b, dist: d, pl });
    }
    // 2) unir tramos casi rectos o muy cortos del mismo tipo
    const bearing = (s) => ((Math.atan2(s.b[0] - s.a[0], s.b[1] - s.a[1]) / D2R) + 360) % 360;
    const steps = [];
    for (const r of raw) {
      const last = steps[steps.length - 1];
      if (last && last.kind === r.kind) {
        const t = Math.abs(((bearing(r) - last.lastB + 540) % 360) - 180);                 // giro local
        const merged = ((Math.atan2(r.b[0] - last.a[0], r.b[1] - last.a[1]) / D2R) + 360) % 360;
        const drift = Math.abs(((merged - last.firstB + 540) % 360) - 180);                // desvío acumulado
        if ((t < 25 && drift < 35) || r.dist < 8 || last.dist < 6) {
          last.b = r.b; last.dist += r.dist; last.lastB = bearing(r); for (const k in r.pl) last.pl[k] = (last.pl[k] || 0) + r.pl[k]; continue;
        }
      }
      steps.push({ kind: r.kind, a: r.a, b: r.b, dist: r.dist, pl: Object.assign({}, r.pl), firstB: bearing(r), lastB: bearing(r) });
    }
    // 3) rumbo, giro y texto
    steps.forEach((s, i) => {
      s.bearing = bearing(s); s.at = s.a; s.end = s.b;
      const cat = (n) => (/^por el pasillo entre/.test(n) ? "pasillo" : n), byCat = {};
      for (const k in s.pl) byCat[cat(k)] = (byCat[cat(k)] || 0) + s.pl[k];
      const top = Object.keys(byCat).sort((x, y) => byCat[y] - byCat[x])[0];
      if (top === "pasillo") { const best = Object.keys(s.pl).filter((k) => cat(k) === "pasillo").sort((x, y) => s.pl[y] - s.pl[x])[0]; s.place = s.pl[best] >= 0.5 * byCat.pasillo ? best : "por los pasillos del predio"; }
      else s.place = top;
      if (s.kind === "net" && s.dist > 200 && /^junto a|perímetro/.test(s.place)) s.place = `por el borde ${sideOf([(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2])} del predio`;
      const prev = steps[i - 1]; s.turn = prev ? ((s.bearing - prev.bearing + 540) % 360) - 180 : 0;
      if (s.kind === "out") s.action = `Dirigite al ${gateName} (hacia el ${cardinal(s.bearing)})`;
      else if (s.kind === "exit") s.action = prev ? `Salí por el perímetro hacia ${dest.name}` : `Caminá hacia el ${cardinal(s.bearing)}`;
      else if (!prev) s.action = `Caminá hacia el ${cardinal(s.bearing)}`;
      else if (prev.kind === "out") s.action = `Entrá por el ${gateName}`;
      else s.action = turnText(s.turn);
    });
    steps.push({ kind: "end", dist: 0, action: "Llegás a " + dest.name, final: true, at: legs.length ? legs[legs.length - 1].b : null });
    return steps;
  }

  /* ---- API ---- */
  function route(oll, f, opts) {
    opts = opts || {}; const mode = opts.ingreso || "auto", notes = [];
    const dest = destOf(f), org = analyzeOrigin(oll);
    let plan = null, gateKey = null;
    const orgIsDest = org.mode === "net" && dest.kind === "zone" && org.zone === dest.cls;
    if (org.mode === "net") {
      const r = orgIsDest ? { cells: [org.idx], cost: 0 } : solve(org.idx, org.open, dest);
      if (r) plan = { r, start: org.xy };
    }
    if (!plan) {   // origen fuera del recinto (o sin camino): entrar por un ingreso
      let keys = ["N", "S"];
      if (dest.north) { keys = ["N"]; if (mode === "S") notes.push("Papa Fest solo se alcanza por el Ingreso Norte y la calle peatonal."); }
      else if (mode === "N") keys = ["N"]; else if (mode === "S") keys = ["S"];
      let best = null, bs = Infinity;
      for (const k of keys) {
        const g = gates[k]; if (!g) continue;
        const r = solve(g.idx, [], dest); if (!r) continue;
        const straight = Math.hypot(org.xy[0] - g.xy[0], org.xy[1] - g.xy[1]);
        if (straight + r.cost < bs) { bs = straight + r.cost; best = { r, k, straight }; }
      }
      if (!best) return { ok: false, msg: "No encontré un camino hasta ese punto." };
      gateKey = best.k; plan = { r: best.r, start: gates[best.k].xy, outFrom: org.xy };
      if (mode === "N" && !dest.north) notes.push("Ingreso por el Norte (invitados).");
    }
    // waypoints
    const cells = plan.r.cells; setPass((plan.outFrom ? [] : org.open).concat(dest.open));
    const wp = smooth(cells).map(cellXY); wp[0] = plan.start.slice();
    let endXY;
    if (plan.r.exit) endXY = plan.r.exit.from;
    else if (dest.kind === "zone") {   // entrar ~12 m hacia adentro del cuadrante
      const g = wp[wp.length - 1], cx = dest.xy[0] - g[0], cy = dest.xy[1] - g[1], L = Math.hypot(cx, cy) || 1, s = Math.min(12, L);
      const p = [g[0] + (cx / L) * s, g[1] + (cy / L) * s], k = cellOf(p[0], p[1]);
      endXY = k >= 0 && cls[k] === dest.cls ? p : g;
    } else endXY = dest.kind === "cells" && !dest.poly ? dest.xy : wp[wp.length - 1];
    wp[wp.length - 1] = endXY;
    const legs = [];
    if (plan.outFrom) legs.push({ a: plan.outFrom, b: wp[0], kind: "out" });
    for (let i = 0; i + 1 < wp.length; i++) legs.push({ a: wp[i], b: wp[i + 1], kind: "net" });
    if (plan.r.exit) legs.push({ a: endXY, b: plan.r.exit.to, kind: "exit" });
    if (plan.r.exit) notes.push("Tramo final por fuera del perímetro, en línea recta (terreno abierto): tomalo como orientación.");
    if (dest.north && !notes.length) notes.push("Papa Fest: se accede por el Ingreso Norte y la calle peatonal.");
    const gateName = gateKey ? gates[gateKey].name : "";
    const steps = makeSteps(legs, dest, gateName);
    const segs = []; let total = 0;
    for (const L of legs) {
      total += Math.hypot(L.b[0] - L.a[0], L.b[1] - L.a[1]);
      const s = segs[segs.length - 1];
      if (s && s.kind === L.kind) s.pts.push(toLL(L.b)); else segs.push({ kind: L.kind, pts: [toLL(L.a), toLL(L.b)] });
    }
    return { ok: true, legs, segs, steps, dist: total, secs: total / WALK, outside: !!plan.outFrom, gate: gateKey, notes,
             start: toLL(plan.outFrom || plan.start), end: toLL(legs.length ? legs[legs.length - 1].b : plan.start) };
  }
  function classAt(ll) { const xy = toXY(ll), k = cellOf(xy[0], xy[1]); return k < 0 ? 0 : cls[k]; }
  function pointInfo(ll) {
    const xy = toXY(ll), k = cellOf(xy[0], xy[1]), c = k < 0 ? 0 : cls[k];
    return { kind: c === 1 ? "pasillo" : c >= 2 ? "zona" : "fuera", zone: c >= 2 ? nd.zones[c - 2] : null, place: placeName(xy) };
  }
  return { route, pointInfo, classAt, toXY, toLL, fence: nd.fence, calle: nd.calle, zoneClass, _dbg: { cls, clear, nx, ny, CELL, X0, Y0, gates, exits } };
}

const api = { create };
if (typeof module !== "undefined" && module.exports) module.exports = api; else root.Nav = api;
})(typeof self !== "undefined" ? self : this);
