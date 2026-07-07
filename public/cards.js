(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CARDS = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  return {
    knight: {
      name: 'Cavaleiro', cost: 3, hp: 600, damage: 75, range: 30,
      attackSpeed: 1100, speed: 60, count: 1, radius: 16,
      color: '#4a90d9', icon: '⚔️', target: 'ground', sight: 120
    },
    archers: {
      name: 'Arqueiras', cost: 3, hp: 170, damage: 50, range: 150,
      attackSpeed: 1000, speed: 70, count: 2, radius: 12, spread: 24,
      color: '#8bc34a', icon: '🏹', target: 'ground', sight: 150
    },
    giant: {
      name: 'Gigante', cost: 5, hp: 2000, damage: 120, range: 30,
      attackSpeed: 1500, speed: 40, count: 1, radius: 22,
      color: '#e67e22', icon: '👊', target: 'buildings', sight: 0
    },
    musketeer: {
      name: 'Mosqueteira', cost: 4, hp: 250, damage: 100, range: 170,
      attackSpeed: 1100, speed: 60, count: 1, radius: 12,
      color: '#9b59b6', icon: '🔫', target: 'ground', sight: 170
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
    }
  };
});
