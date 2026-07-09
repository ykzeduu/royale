(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CARDS = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  return {
    knight: {
      name: 'Cavaleiro', cost: 3, hp: 1450, damage: 167, range: 30,
      attackSpeed: 1200, speed: 60, count: 1, radius: 16,
      color: '#4a90d9', icon: '⚔️', target: 'ground', sight: 120
    },
    archers: {
      name: 'Arqueiras', cost: 3, hp: 304, damage: 107, range: 100,
      attackSpeed: 900, speed: 70, count: 2, radius: 12, spread: 24,
      color: '#8bc34a', icon: '🏹', target: 'ground', sight: 150, canTargetAir: true
    },
    musketeer: {
      name: 'Mosqueteira', cost: 4, hp: 720, damage: 218, range: 120,
      attackSpeed: 1100, speed: 60, count: 1, radius: 12,
      color: '#9b59b6', icon: '🔫', target: 'ground', sight: 170, canTargetAir: true
    },
    pekka: {
      name: 'Mini P.E.K.K.A', cost: 4, hp: 1361, damage: 698, range: 30,
      attackSpeed: 1600, speed: 65, count: 1, radius: 16,
      color: '#c0392b', icon: '🗡️', target: 'ground', sight: 120
    },
    skeletons: {
      name: 'Esqueletos', cost: 1, hp: 81, damage: 81, range: 20,
      attackSpeed: 1000, speed: 80, count: 3, radius: 8, spread: 20,
      color: '#ecf0f1', icon: '💀', target: 'ground', sight: 100
    },
    barbarians: {
      name: 'Bárbaros', cost: 5, hp: 670, damage: 192, range: 25,
      attackSpeed: 1300, speed: 60, count: 5, radius: 14, spread: 28,
      color: '#795548', icon: '🪓', target: 'ground', sight: 120
    },
    fireball: {
      name: 'Bola de Fogo', cost: 4, spell: true, damage: 689, towerDamage: 207, radius: 50,
      color: '#ff5722', icon: '🔥'
    },

    goblin_cage: {
      name: 'Jaula de Goblin', cost: 4, hp: 942, damage: 0, range: 0,
      attackSpeed: 1000, speed: 0, count: 1, radius: 20,
      color: '#607d8b', icon: '🔒', target: 'buildings', sight: 0,
      spawnOnDeath: 'goblin_brawler', lifetime: 20000
    },
    goblins: {
      name: 'Goblins', cost: 2, hp: 202, damage: 120, range: 20,
      attackSpeed: 1100, speed: 90, count: 4, radius: 10, spread: 22,
      color: '#33691e', icon: '👺', target: 'ground', sight: 110
    },
    dragon: {
      name: 'Dragão', cost: 4, hp: 1152, damage: 160, range: 110,
      attackSpeed: 1500, speed: 50, count: 1, radius: 18,
      color: '#8e24aa', icon: '🐉', target: 'ground', sight: 160,
      flying: true, canTargetAir: true, splash: 45, breathFx: true
    },
    royal_guards: {
      name: 'Guardas Reais', cost: 3, hp: 81, shield: 241, damage: 109, range: 25,
      attackSpeed: 1000, speed: 45, count: 3, radius: 13, spread: 22,
      color: '#3949ab', icon: '🛡️', target: 'ground', sight: 110
    },
    hog_rider: {
      name: 'Corredor', cost: 4, hp: 1696, damage: 318, range: 30,
      attackSpeed: 1600, speed: 105, count: 1, radius: 15,
      color: '#a1887f', icon: '🐗', target: 'buildings', sight: 0,
      ignoreRiver: true
    },
    witch: {
      name: 'Bruxa', cost: 5, hp: 838, damage: 134, range: 115,
      attackSpeed: 1100, speed: 55, count: 1, radius: 14, splash: 40,
      color: '#4a148c', icon: '🧙', target: 'ground', sight: 150,
      canTargetAir: true, spawnEvery: 7000, spawnCount: 4
    },
    minions: {
      name: 'Servos Voadores', cost: 3, hp: 230, damage: 102, range: 110,
      attackSpeed: 1000, speed: 80, count: 3, radius: 10, spread: 20,
      color: '#00acc1', icon: '🧚', target: 'ground', sight: 130,
      flying: true, canTargetAir: true
    },
    arrows: {
      name: 'Flechas', cost: 3, spell: true, damage: 366, towerDamage: 111, radius: 80,
      color: '#7cb342', icon: '🎯'
    },
    hunter: {
      name: 'Caçador', cost: 4, hp: 838, damage: 420, range: 70,
      attackSpeed: 2200, speed: 60, count: 1, radius: 14,
      color: '#00695c', icon: '🦅', target: 'ground', sight: 150,
      canTargetAir: true
    },

    // ---------- Carta escondida (invocada, não aparece na loja/draft) ----------
    goblin_brawler: {
      name: 'Goblin Brutamontes', hidden: true, cost: 0,
      hp: 1021, damage: 254, range: 25, attackSpeed: 1100, speed: 65,
      count: 1, radius: 17, color: '#558b2f', icon: '👹', target: 'ground', sight: 110
    }
  };
});
