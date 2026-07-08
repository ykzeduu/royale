(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.GAME_CONST = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const ARENA_W = 360;
  const ARENA_H = 600;
  const RIVER_Y = 300;
  const RIVER_HALF = 20;

  return {
    ARENA_W,
    ARENA_H,
    RIVER_Y,
    RIVER_HALF,
    BRIDGES: [{ x: 90 }, { x: 270 }],
    MATCH_TIME: 180,       // segundos
    DOUBLE_ELIXIR_AT: 60,  // segundos restantes para ativar elixir duplo
    OVERTIME_TIME: 60,     // segundos de prorrogação (morte súbita)
    TROOP_SPEED_MULTIPLIER: 0.9, // ~10% mais lento
    COUNTDOWN_SECONDS: 5,
    ELIXIR_MAX: 10,
    ELIXIR_START: 5,
    ELIXIR_REGEN_MS: 2000,      // 1 elixir a cada 2s (normal)
    ELIXIR_REGEN_MS_FAST: 1000, // 1 elixir a cada 1s (elixir duplo)
    TOWERS: {
      king: { hp: 2400, damage: 110, range: 140, attackSpeed: 1000, radius: 30 },
      princess: { hp: 1400, damage: 90, range: 155, attackSpeed: 900, radius: 24 }
    },
    // Posições em coordenadas de mundo. p0 fica embaixo, p1 fica em cima.
    TOWER_POSITIONS: {
      p0: { king: { x: 180, y: 570 }, left: { x: 70, y: 500 }, right: { x: 290, y: 500 } },
      p1: { king: { x: 180, y: 30 }, left: { x: 70, y: 100 }, right: { x: 290, y: 100 } }
    }
  };
});
