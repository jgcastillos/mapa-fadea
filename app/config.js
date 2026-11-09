/* Configuración de la app. Cambiá TILE_URL por tu propio servidor de tiles antes de
   publicar para uso masivo (la política de OpenStreetMap no admite tráfico masivo ni descargas en bloque). */
self.APP_CONFIG = {
  // Mosaicos propios dentro de la app (se generan con tools/fetch_tiles.py). Si querés usar un servidor remoto, poné aquí su URL https://…
  BUILD: "mw8r5mcf",
  // Si la usás dentro de la app de voluntarios (subcarpeta), poné acá a dónde vuelve el botón «← Voluntarios». Ej.: "../" o "/". Vacío = sin botón.
  BACK_URL: "",
  BACK_LABEL: "Voluntarios",
  TILE_URL: "",   // sin mosaicos de OpenStreetMap: el fondo se dibuja con las calles de roads.json
  TILE_ATTRIBUTION: "© OpenStreetMap",
  TILE_MINZ: 14,
  TILE_MAXZ: 17,          // niveles que se descargan para uso offline (z14–z17 ≈ 130 tiles)
  TILE_PAD_DEG: 0.003,    // margen alrededor del predio (~300 m)
  WALK_SPEED: 1.2,        // m/s, para estimar minutos a pie entre multitudes
  ARRIVE_M: 12,           // distancia para considerar "llegaste"
  CACHE_TILES: "papa-tiles-v1"
};
