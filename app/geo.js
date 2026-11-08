/* Utilidades geográficas puras (sin DOM). Funcionan en el navegador (global Geo) y en Node (tests). */
(function (root) {
  const R = 6371008.8;
  const rad = (d) => (d * Math.PI) / 180;
  const deg = (r) => (r * 180) / Math.PI;
  const TILE = 256;

  // Web Mercator en "píxeles de mundo" para un zoom (puede ser fraccionario)
  function project(lon, lat, z) {
    const s = TILE * Math.pow(2, z);
    const x = ((lon + 180) / 360) * s;
    const sin = Math.sin(rad(Math.max(-85.0511, Math.min(85.0511, lat))));
    const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * s;
    return [x, y];
  }
  function unproject(x, y, z) {
    const s = TILE * Math.pow(2, z);
    const lon = (x / s) * 360 - 180;
    const n = Math.PI - (2 * Math.PI * y) / s;
    const lat = deg(Math.atan(Math.sinh(n)));
    return [lon, lat];
  }

  function distance(a, b) { // a,b = [lon,lat] → metros (haversine)
    const dLat = rad(b[1] - a[1]), dLon = rad(b[0] - a[0]);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function bearing(a, b) { // grados 0-360 desde a hacia b
    const y = Math.sin(rad(b[0] - a[0])) * Math.cos(rad(b[1]));
    const x = Math.cos(rad(a[1])) * Math.sin(rad(b[1])) - Math.sin(rad(a[1])) * Math.cos(rad(b[1])) * Math.cos(rad(b[0] - a[0]));
    return (deg(Math.atan2(y, x)) + 360) % 360;
  }
  function cardinal(b) {
    return ["N", "NE", "E", "SE", "S", "SO", "O", "NO"][Math.round(b / 45) % 8];
  }
  function inRing(pt, ring) {
    let ins = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) ins = !ins;
    }
    return ins;
  }
  function centroid(ring) { // promedio simple de vértices; suficiente para rótulos
    let x = 0, y = 0;
    for (const p of ring) { x += p[0]; y += p[1]; }
    return [x / ring.length, y / ring.length];
  }
  function fmtDist(m) {
    if (m < 1000) { const r = Math.round(m / 5) * 5; return r === 0 ? "<5 m" : r + " m"; }
    return (m / 1000).toFixed(2).replace(".", ",") + " km";
  }
  function fmtTime(m, speed) { // minutos caminando
    const min = Math.max(1, Math.round(m / (speed || 1.2) / 60));
    return min + " min";
  }
  function tilesFor(bounds, z, pad) { // lista de tiles que cubren bounds [w,s,e,n]
    const p = pad || 0;
    const [x0, y1] = project(bounds[0] - p, bounds[1] - p, z);
    const [x1, y0] = project(bounds[2] + p, bounds[3] + p, z);
    const out = [];
    for (let x = Math.floor(x0 / TILE); x <= Math.floor(x1 / TILE); x++)
      for (let y = Math.floor(y0 / TILE); y <= Math.floor(y1 / TILE); y++) out.push([z, x, y]);
    return out;
  }

  const api = { project, unproject, distance, bearing, cardinal, inRing, centroid, fmtDist, fmtTime, tilesFor, TILE };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.Geo = api;
})(typeof self !== "undefined" ? self : this);
