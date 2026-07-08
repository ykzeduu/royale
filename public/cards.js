(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CARDS = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  return {
    // ---------- Baralho original ----------
    knight: {
      name: 'Cavaleiro', cost: 3, hp: 600, damage: 75, range: 30,
      attackSpeed: 1100, speed: 60, count: 1, radius: 16,
      color: '#4a90d9', icon: '⚔️', target: 'ground', sight: 120
    },
    archers: {
      name: 'Arqueiras', cost: 3, hp: 170, damage: 50, range: 125,
      attackSpeed: 1000, speed: 70, count: 2, radius: 12, spread: 24,
      color: '#8bc34a', icon: '🏹', target: 'ground', sight: 150, canTargetAir: true
    },
    giant: {
      name: 'Gigante', cost: 5, hp: 2000, damage: 120, range: 30,
      attackSpeed: 1500, speed: 40, count: 1, radius: 22,
      color: '#e67e22', icon: '👊', target: 'buildings', sight: 0
    },
    musketeer: {
      name: 'Mosqueteira', cost: 4, hp: 250, damage: 100, range: 135,
      attackSpeed: 1100, speed: 60, count: 1, radius: 12,
      color: '#9b59b6', icon: '🔫', target: 'ground', sight: 170, canTargetAir: true
    },
    pekka: {
      name: 'Mini P.E.K.K.A', cost: 4, hp: 700, damage: 280, range: 30,
      attackSpeed: 1600, speed: 65, count: 1, radius: 16,
      color: '#c0392b', icon: '🗡️', target: 'ground', sight: 120
    },
    skeletons: {
      name: 'Esqueletos', cost: 1, hp: 50, damage: 40, range: 20,
      attackSpeed: 800, speed: 80, count: 3, radius: 8, spread: 20,
      color: '#ecf0f1', icon: '💀', target: 'ground', sight: 100
    },
    barbarians: {
      name: 'Bárbaros', cost: 5, hp: 380, damage: 90, range: 25,
      attackSpeed: 1200, speed: 60, count: 4, radius: 14, spread: 26,
      color: '#795548', icon: '🪓', target: 'ground', sight: 120
    },
    fireball: {
      name: 'Bola de Fogo', cost: 4, spell: true, damage: 400, radius: 60,
      color: '#ff5722', icon: '🔥'
    },

    // ---------- Cartas novas ----------
    goblin_cage: {
      name: 'Jaula de Goblin', cost: 4, hp: 400, damage: 0, range: 0,
      attackSpeed: 1000, speed: 0, count: 1, radius: 20,
      color: '#607d8b', icon: '🔒', target: 'buildings', sight: 0,
      spawnOnDeath: 'goblins'
    },
    goblins: {
      name: 'Goblins', cost: 2, hp: 90, damage: 55, range: 20,
      attackSpeed: 700, speed: 90, count: 4, radius: 10, spread: 22,
      color: '#33691e', icon: '👺', target: 'ground', sight: 110
    },
    dragon: {
      name: 'Dragão', cost: 4, hp: 1000, damage: 130, range: 110,
      attackSpeed: 1300, speed: 50, count: 1, radius: 18,
      color: '#8e24aa', icon: '🐉', target: 'ground', sight: 160,
      flying: true, canTargetAir: true, splash: 45
    },
    royal_guards: {
      name: 'Guardas Reais', cost: 3, hp: 220, damage: 90, range: 25,
      attackSpeed: 1300, speed: 45, count: 3, radius: 13, spread: 22,
      color: '#3949ab', icon: '🛡️', target: 'ground', sight: 110
    },
    hog_rider: {
      name: 'Hogrider', cost: 4, hp: 800, damage: 150, range: 30,
      attackSpeed: 1500, speed: 100, count: 1, radius: 15,
      color: '#a1887f', icon: '🐗', target: 'buildings', sight: 0,
      ignoreRiver: true
    },
    witch: {
      name: 'Bruxa', cost: 5, hp: 350, damage: 90, range: 115,
      attackSpeed: 1100, speed: 55, count: 1, radius: 14,
      color: '#4a148c', icon: '🧙', target: 'ground', sight: 150,
      canTargetAir: true, spawnEvery: 3500
    },
    ice_spirit: {
      name: 'Espírito de Gelo', cost: 1, hp: 90, damage: 45, range: 20,
      attackSpeed: 1000, speed: 110, count: 1, radius: 9,
      color: '#4fc3f7', icon: '❄️', target: 'ground', sight: 100,
      canTargetAir: true, kamikaze: true, aoe: 40, slowFactor: 0.5, slowDuration: 2500
    },
    arrows: {
      name: 'Flechas', cost: 3, spell: true, damage: 170, radius: 90,
      color: '#7cb342', icon: '🎯'
    }
  };
});
