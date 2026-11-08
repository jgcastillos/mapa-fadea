/* Configuración de la app. Cambiá TILE_URL por tu propio servidor de tiles antes de
   publicar para uso masivo (la política de OpenStreetMap no admite tráfico masivo ni descargas en bloque). */
self.APP_CONFIG = {
  TILE_URL: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  TILE_ATTRIBUTION: "© OpenStreetMap",
  TILE_MINZ: 14,
  TILE_MAXZ: 17,          // niveles que se descargan para uso offline (z14–z17 ≈ 130 tiles)
  TILE_PAD_DEG: 0.003,    // margen alrededor del predio (~300 m)
  WALK_SPEED: 1.2,        // m/s, para estimar minutos a pie entre multitudes
  ARRIVE_M: 12,           // distancia para considerar "llegaste"
  CACHE_TILES: "papa-tiles-v1"
};
