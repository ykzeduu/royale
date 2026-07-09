const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const CARDS = require('./public/cards.js');
const C = require('./public/constants.js');

const MELEE_RANGE = 40; // acima disso, o ataque gera um projétil visual
const ALL_CARD_KEYS = Object.keys(CARDS);
const SELECTABLE_KEYS = ALL_CARD_KEYS.filter(k => !CARDS[k].hidden);
const DRAFT_ROUNDS = SELECTABLE_KEYS.length / 2;
const EVOLUTION_INTERVAL_S = 70; // 1min10s
const EVOLUTION_MAX_PICKS = 4;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {}; // code -> room

// ---------- Utilidades ----------

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function isValidDeck(deck) {
  if (!Array.isArray(deck) || deck.length !== 8) return false;
  const set = new Set(deck);
  if (set.size !== 8) return false;
  return deck.every(k => SELECTABLE_KEYS.includes(k));
}

function randomDeck() {
  return shuffle(SELECTABLE_KEYS).slice(0, 8);
}

// ---------- Evolução (buffs de carta) ----------

function genericBuffsFor() {
  return [
    { id: 'hp', label: '+30% de vida', mods: (b, e) => ({ hp: Math.round((e.hp || b.hp) * 1.3) }) },
    { id: 'dmg', label: '+30% de dano', mods: (b, e) => ({ damage: Math.round((e.damage || b.damage) * 1.3) }) },
    { id: 'spd', label: '+25% de velocidade', mods: (b, e) => ({ speed: Math.round((e.speed || b.speed) * 1.25) }) }
  ];
}

const BUFF_DEFS = {
  witch: [
    { id: 'fastspawn', label: 'Invocação 2x mais rápida', mods: (b, e) => ({ spawnEvery: Math.round((e.spawnEvery || b.spawnEvery) / 2) }) },
    { id: 'fireball_form', label: 'Passa a atirar bolas de fogo (metade do dano/alcance)', mods: (b, e) => ({ damage: Math.round((e.damage || b.damage) * 0.5), range: Math.round((e.range || b.range) * 0.5), splash: 55 }) },
    { id: 'hp', label: '+30% de vida', mods: (b, e) => ({ hp: Math.round((e.hp || b.hp) * 1.3) }) }
  ],
  fireball: [
    { id: 'radius', label: '+100% de raio', mods: (b, e) => ({ radius: Math.round((e.radius || b.radius) * 2) }) },
    { id: 'dmg', label: '+30% de dano', mods: (b, e) => ({ damage: Math.round((e.damage || b.damage) * 1.3) }) },
    { id: 'double', label: 'Feitiço em dobro (cai 2 vezes)', mods: () => ({ doubleCast: true }) }
  ],
  arrows: [
    { id: 'radius', label: '+100% de raio', mods: (b, e) => ({ radius: Math.round((e.radius || b.radius) * 2) }) },
    { id: 'dmg', label: '+30% de dano', mods: (b, e) => ({ damage: Math.round((e.damage || b.damage) * 1.3) }) },
    { id: 'double', label: 'Feitiço em dobro (cai 2 vezes)', mods: () => ({ doubleCast: true }) }
  ],
  goblin_cage: [
    { id: 'cage_hp', label: '+50% de vida da jaula', mods: (b, e) => ({ hp: Math.round((e.hp || b.hp) * 1.5) }) },
    { id: 'brawler_hp', label: 'Goblin Brutamontes +40% de vida', mods: () => ({}), extraKey: 'goblin_brawler', extraMods: (eb, ee) => ({ hp: Math.round((ee.hp || eb.hp) * 1.4) }) },
    { id: 'brawler_dmg', label: 'Goblin Brutamontes +40% de dano', mods: () => ({}), extraKey: 'goblin_brawler', extraMods: (eb, ee) => ({ damage: Math.round((ee.damage || eb.damage) * 1.4) }) }
  ]
};

function buffsForCard(cardKey) {
  return BUFF_DEFS[cardKey] || genericBuffsFor();
}

function getEffectiveCard(player, cardKey) {
  const base = CARDS[cardKey];
  const override = player.evoOverrides && player.evoOverrides[cardKey];
  return override ? { ...base, ...override } : base;
}

function offerEvolution(room, idx) {
  const state = room.state;
  const p = state.players[idx];
  if (p.evoPicksUsed >= EVOLUTION_MAX_PICKS || p.evoPending) return;
  let candidates = p.deck.filter(k => !p.evoBuffedCards.includes(k));
  if (candidates.length === 0) candidates = p.deck.slice();
  const cardKey = candidates[Math.floor(Math.random() * candidates.length)];
  const pool = shuffle(buffsForCard(cardKey)).slice(0, 2);
  p.evoPending = { cardKey, options: pool.map(b => b.id) };
  io.to(room.code).emit('evolution_offer', {
    playerIdx: idx,
    cardKey,
    options: pool.map(b => ({ id: b.id, label: b.label }))
  });
}

function handleEvolutionPick(room, idx, buffId) {
  const state = room.state;
  if (!state) return;
  const p = state.players[idx];
  if (!p.evoPending || !p.evoPending.options.includes(buffId)) return;
  const cardKey = p.evoPending.cardKey;
  const buff = buffsForCard(cardKey).find(b => b.id === buffId);
  if (!buff) return;

  const base = CARDS[cardKey];
  const existing = p.evoOverrides[cardKey] || {};
  p.evoOverrides[cardKey] = { ...existing, ...buff.mods(base, existing) };

  if (buff.extraKey) {
    const exBase = CARDS[buff.extraKey];
    const exExisting = p.evoOverrides[buff.extraKey] || {};
    p.evoOverrides[buff.extraKey] = { ...exExisting, ...buff.extraMods(exBase, exExisting) };
  }

  if (!p.evoBuffedCards.includes(cardKey)) p.evoBuffedCards.push(cardKey);
  p.evoPicksUsed++;
  p.evoPending = null;
}

// ---------- Estado do jogador ----------

function newPlayerState(deck) {
  const fullDeck = isValidDeck(deck) ? deck : randomDeck();
  const shuffled = shuffle(fullDeck); // 8 cartas
  const hand = shuffled.splice(0, 4);
  const next = shuffled.shift();
  const queue = shuffled; // restam 3
  return {
    elixir: C.ELIXIR_START,
    elixirTimer: 0,
    deck: fullDeck,
    hand, next, queue,
    evoOverrides: {},
    evoBuffedCards: [],
    evoPicksUsed: 0,
    evoPending: null,
    towers: {
      king: { hp: C.TOWERS.king.hp, maxHp: C.TOWERS.king.hp, activated: false, cooldown: 0 },
      left: { hp: C.TOWERS.princess.hp, maxHp: C.TOWERS.princess.hp, cooldown: 0 },
      right: { hp: C.TOWERS.princess.hp, maxHp: C.TOWERS.princess.hp, cooldown: 0 }
    }
  };
}

function createRoom(mode) {
  let code;
  do { code = genCode(); } while (rooms[code]);
  const validModes = ['normal', 'draft', 'turbo', 'evolution'];
  const room = {
    code, mode: validModes.includes(mode) ? mode : 'normal',
    sockets: [], decks: [null, null],
    state: null, interval: null, secTimer: null, cdTimer: null,
    draft: null, started: false
  };
  rooms[code] = room;
  return room;
}

function destroyRoom(room) {
  if (room.interval) clearInterval(room.interval);
  if (room.secTimer) clearInterval(room.secTimer);
  if (room.cdTimer) clearInterval(room.cdTimer);
  delete rooms[room.code];
}

// ---------- Fim de partida ----------

function crownsFor(state, idx) {
  const opp = state.players[1 - idx].towers;
  let n = 0;
  if (opp.left.hp <= 0) n++;
  if (opp.right.hp <= 0) n++;
  if (opp.king.hp <= 0) n++;
  return n;
}

function concludeMatch(state, winner, reason) {
  state.finished = true;
  state.winner = winner; // null = empate
  state.reason = reason;
  state.crowns = [crownsFor(state, 0), crownsFor(state, 1)];
}

function princessScore(p) {
  let n = 0;
  if (p.towers.left.hp > 0) n++;
  if (p.towers.right.hp > 0) n++;
  return n;
}

function totalTowerHp(p) {
  return p.towers.king.hp + p.towers.left.hp + p.towers.right.hp;
}

// ---------- Modo Escolha Rápida (draft) ----------

function startDraft(room) {
  const pool = shuffle(SELECTABLE_KEYS);
  const pairs = [];
  for (let i = 0; i < pool.length; i += 2) pairs.push([pool[i], pool[i + 1]]);

  room.draft = { pairs, round: 0, decks: [[], []] };
  sendDraftRound(room);
}

function sendDraftRound(room) {
  const d = room.draft;
  if (d.round >= DRAFT_ROUNDS) {
    room.decks[0] = d.decks[0];
    room.decks[1] = d.decks[1];
    io.to(room.code).emit('draft_complete', { decks: room.decks });
    startMatch(room);
    return;
  }
  const chooser = d.round % 2;
  const [cardA, cardB] = d.pairs[d.round];
  io.to(room.code).emit('draft_round', {
    round: d.round + 1,
    total: DRAFT_ROUNDS,
    chooser,
    cardA, cardB,
    decks: d.decks
  });
}

function handleDraftPick(room, idx, cardKey) {
  const d = room.draft;
  if (!d) return;
  const chooser = d.round % 2;
  if (idx !== chooser) return;
  const [cardA, cardB] = d.pairs[d.round];
  if (cardKey !== cardA && cardKey !== cardB) return;
  const other = cardKey === cardA ? cardB : cardA;
  d.decks[idx].push(cardKey);
  d.decks[1 - idx].push(other);
  d.round++;
  sendDraftRound(room);
}

// ---------- Ciclo de vida da partida ----------

function startMatch(room) {
  room.state = {
    mode: room.mode,
    phase: 'countdown',
    countdown: C.COUNTDOWN_SECONDS,
    time: C.MATCH_TIME,
    overtimeTime: 0,
    playSeconds: 0,
    doubleElixir: false,
    turboElixir: room.mode === 'turbo',
    evolutionMode: room.mode === 'evolution',
    finished: false,
    winner: null,
    reason: null,
    crowns: null,
    troops: [],
    events: [],
    players: [newPlayerState(room.decks[0]), newPlayerState(room.decks[1])]
  };
  room.started = true;

  io.to(room.code).emit('match_start', room.state);

  let n = C.COUNTDOWN_SECONDS;
  room.cdTimer = setInterval(() => {
    n--;
    room.state.countdown = n;
    io.to(room.code).emit('state', room.state);
    if (n <= -1) {
      clearInterval(room.cdTimer);
      room.state.phase = 'playing';
      beginSimulation(room);
    }
  }, 1000);
}

function beginSimulation(room) {
  let last = Date.now();
  room.interval = setInterval(() => {
    const now = Date.now();
    const dt = (now - last) / 1000;
    last = now;
    tick(room.state, dt);
    io.to(room.code).emit('state', room.state);
    room.state.events = [];
    if (room.state.finished) {
      clearInterval(room.interval);
      clearInterval(room.secTimer);
    }
  }, 50);

  room.secTimer = setInterval(() => {
    const state = room.state;
    if (!state || state.finished) return;

    if (state.phase === 'playing' || state.phase === 'overtime') {
      state.playSeconds++;
      if (state.evolutionMode && state.playSeconds % EVOLUTION_INTERVAL_S === 0) {
        state.players.forEach((p, idx) => offerEvolution(room, idx));
      }
    }

    if (state.phase === 'playing') {
      state.time -= 1;
      if (state.time <= C.DOUBLE_ELIXIR_AT) state.doubleElixir = true;
      if (state.time <= 0) {
        state.time = 0;
        const s0 = princessScore(state.players[0]);
        const s1 = princessScore(state.players[1]);
        if (s0 === s1) {
          state.phase = 'overtime';
          state.overtimeTime = C.OVERTIME_TIME;
          state.doubleElixir = true;
        } else {
          concludeMatch(state, s0 > s1 ? 0 : 1, 'tempo');
        }
      }
    } else if (state.phase === 'overtime') {
      state.overtimeTime -= 1;
      if (state.overtimeTime <= 0) {
        state.overtimeTime = 0;
        const h0 = totalTowerHp(state.players[0]);
        const h1 = totalTowerHp(state.players[1]);
        if (h0 === h1) concludeMatch(state, null, 'empate');
        else concludeMatch(state, h0 > h1 ? 0 : 1, 'tempo-extra');
      }
    }
  }, 1000);
}

// ---------- Dano (com suporte a escudo) ----------

function damageTroop(t, dmg) {
  if (t.shield && t.shield > 0) {
    if (dmg <= t.shield) { t.shield -= dmg; return; }
    const overflow = dmg - t.shield;
    t.shield = 0;
    t.hp -= overflow;
  } else {
    t.hp -= dmg;
  }
}

// ---------- Criação de tropas ----------

function makeTroop(card, cardKey, owner, x, y, lane, bridgeX) {
  return {
    id: Math.random().toString(36).slice(2),
    owner,
    cardKey,
    x: clamp(x, 10, C.ARENA_W - 10),
    y: clamp(y, 10, C.ARENA_H - 10),
    hp: card.hp,
    maxHp: card.hp,
    shield: card.shield || 0,
    maxShield: card.shield || 0,
    damage: card.damage,
    range: card.range,
    speed: card.speed,
    attackSpeed: card.attackSpeed,
    cooldown: 0,
    radius: card.radius,
    sight: card.sight || 0,
    buildingOnly: card.target === 'buildings',
    flying: !!card.flying,
    canTargetAir: !!card.canTargetAir,
    ignoreRiver: !!card.ignoreRiver,
    splash: card.splash || 0,
    kamikaze: !!card.kamikaze,
    aoe: card.aoe || 0,
    slowFactorOnHit: card.slowFactor || 0,
    slowDurationOnHit: card.slowDuration || 0,
    spawnOnDeath: card.spawnOnDeath || null,
    spawnEvery: card.spawnEvery || 0,
    spawnCount: card.spawnCount || 1,
    spawnCooldown: card.spawnEvery || 0,
    breathFx: !!card.breathFx,
    lifetime: card.lifetime || 0,
    lane, bridgeX
  };
}

function laneAndBridgeFor(x) {
  const bridgeX = x < C.ARENA_W / 2 ? C.BRIDGES[0].x : C.BRIDGES[1].x;
  const lane = x < C.ARENA_W / 2 ? 'left' : 'right';
  return { lane, bridgeX };
}

// ---------- Simulação ----------

function tick(state, dt) {
  if (state.finished) return;

  // elixir
  const baseRegen = state.doubleElixir ? C.ELIXIR_REGEN_MS_FAST : C.ELIXIR_REGEN_MS;
  const regenMs = state.turboElixir ? baseRegen / 7 : baseRegen;
  state.players.forEach(p => {
    if (p.elixir < C.ELIXIR_MAX) {
      p.elixirTimer += dt * 1000;
      while (p.elixirTimer >= regenMs && p.elixir < C.ELIXIR_MAX) {
        p.elixir++;
        p.elixirTimer -= regenMs;
      }
    } else {
      p.elixirTimer = 0;
    }
  });

  // torres atacando (torres enxergam tudo, inclusive voadores)
  state.players.forEach((p, ownerIdx) => {
    const enemyIdx = 1 - ownerIdx;
    ['king', 'left', 'right'].forEach(key => {
      const tower = p.towers[key];
      if (tower.hp <= 0) return;
      if (key === 'king' && !tower.activated) return;
      tower.cooldown -= dt * 1000;
      const stats = key === 'king' ? C.TOWERS.king : C.TOWERS.princess;
      const pos = C.TOWER_POSITIONS['p' + ownerIdx][key];
      let best = null, bestDist = Infinity;
      state.troops.forEach(t => {
        if (t.owner !== enemyIdx || t.hp <= 0) return;
        const d = dist(pos, t);
        if (d <= stats.range + t.radius && d < bestDist) { bestDist = d; best = t; }
      });
      if (best && tower.cooldown <= 0) {
        damageTroop(best, stats.damage);
        tower.cooldown = stats.attackSpeed;
        state.events.push({ type: 'shot', x1: pos.x, y1: pos.y, x2: best.x, y2: best.y, owner: ownerIdx });
      }
    });
  });

  const newTroops = [];
  state.troops.forEach(t => updateTroop(t, state, dt, newTroops));
  state.troops.push(...newTroops);

  // tempo de vida (ex: Jaula de Goblin expira e libera o Goblin Brutamontes)
  state.troops.forEach(t => {
    if (t.lifetime > 0) {
      t.lifetime -= dt * 1000;
      if (t.lifetime <= 0 && t.hp > 0) t.hp = 0;
    }
  });

  processDeaths(state);
  state.troops = state.troops.filter(t => t.hp > 0);

  // vitória imediata (torre do rei destruída)
  state.players.forEach((p, i) => {
    if (!state.finished && p.towers.king.hp <= 0) {
      concludeMatch(state, 1 - i, 'torre-do-rei');
    }
  });

  // morte súbita na prorrogação: qualquer torre destruída encerra a partida
  if (!state.finished && state.phase === 'overtime') {
    const s0 = princessScore(state.players[0]);
    const s1 = princessScore(state.players[1]);
    if (s0 !== s1) concludeMatch(state, s0 > s1 ? 0 : 1, 'morte-subita');
  }
}

function processDeaths(state) {
  state.troops.forEach(t => {
    if (t.hp <= 0 && t.spawnOnDeath) {
      const player = state.players[t.owner];
      const card = getEffectiveCard(player, t.spawnOnDeath);
      if (!card) return;
      const count = card.count || 1;
      for (let i = 0; i < count; i++) {
        const off = (i - (count - 1) / 2) * 18;
        state.troops.push(makeTroop(card, t.spawnOnDeath, t.owner, t.x + off, t.y, t.lane, t.bridgeX));
      }
      t.spawnOnDeath = null;
    }
  });
}

function updateTroop(t, state, dt, newTroops) {
  // invocação periódica (ex: Bruxa invocando esqueletos)
  if (t.spawnEvery && t.hp > 0) {
    t.spawnCooldown -= dt * 1000;
    if (t.spawnCooldown <= 0) {
      t.spawnCooldown = t.spawnEvery;
      const skelCard = CARDS.skeletons;
      const n = t.spawnCount || 1;
      for (let i = 0; i < n; i++) {
        const off = (i - (n - 1) / 2) * 18;
        newTroops.push(makeTroop(
          { ...skelCard, count: 1 }, 'skeletons', t.owner,
          t.x + off, t.y + (Math.random() - 0.5) * 10,
          t.lane, t.bridgeX
        ));
      }
    }
  }

  const enemyIdx = 1 - t.owner;
  const enemyPlayer = state.players[enemyIdx];

  let target = null;

  if (!t.buildingOnly) {
    let best = null, bestDist = Infinity;
    const side = t.y < C.RIVER_Y ? 'top' : 'bottom';
    state.troops.forEach(o => {
      if (o.owner === t.owner || o.hp <= 0) return;
      if (o.flying && !t.canTargetAir) return;
      const oside = o.y < C.RIVER_Y ? 'top' : 'bottom';
      if (oside !== side) return;
      const d = dist(t, o);
      if (d <= t.sight && d < bestDist) { bestDist = d; best = o; }
    });
    if (best) target = { type: 'troop', ref: best, x: best.x, y: best.y, radius: best.radius };
  }

  if (!target) {
    const towers = enemyPlayer.towers;
    let which = t.lane;
    if (towers[which].hp <= 0) which = 'king';
    const pos = C.TOWER_POSITIONS['p' + enemyIdx][which];
    const stats = which === 'king' ? C.TOWERS.king : C.TOWERS.princess;
    target = { type: 'tower', which, owner: enemyIdx, x: pos.x, y: pos.y, radius: stats.radius };
  }

  const effRange = t.range + (target.radius || 0);
  const d = dist(t, target);

  t.cooldown -= dt * 1000;

  if (d <= effRange) {
    if (t.cooldown <= 0) {
      if (t.kamikaze) {
        state.troops.forEach(o => {
          if (o.owner !== t.owner && o.hp > 0 && dist(t, o) <= t.aoe) {
            if (o.flying && !t.canTargetAir) return;
            damageTroop(o, t.damage);
            if (t.slowFactorOnHit) {
              o.slowUntil = Date.now() + t.slowDurationOnHit;
              o.slowFactor = t.slowFactorOnHit;
            }
          }
        });
        state.events.push({ type: 'melee', x: t.x, y: t.y, owner: t.owner, fromId: t.id });
        t.hp = 0;
      } else {
        applyDamage(target, t.damage, state);
        if (t.splash) {
          state.troops.forEach(o => {
            if (o.owner !== t.owner && o.hp > 0 && !(target.type === 'troop' && o === target.ref) && dist(target, o) <= t.splash) {
              if (o.flying && !t.canTargetAir) return;
              damageTroop(o, t.damage);
            }
          });
        }
        t.cooldown = t.attackSpeed;
        if (t.breathFx) {
          state.events.push({ type: 'dragonbreath', x1: t.x, y1: t.y, x2: target.x, y2: target.y, owner: t.owner, radius: t.splash || 40 });
        } else if (t.range > MELEE_RANGE) {
          state.events.push({ type: 'shot', x1: t.x, y1: t.y, x2: target.x, y2: target.y, owner: t.owner, fromId: t.id });
        } else {
          state.events.push({ type: 'melee', x: t.x, y: t.y, owner: t.owner, fromId: t.id });
        }
      }
    }
    return;
  }

  const moveTo = target.type === 'troop'
    ? target
    : ((t.flying || t.ignoreRiver) ? { x: target.x, y: target.y } : nextWaypoint(t, target));

  const dx = moveTo.x - t.x, dy = moveTo.y - t.y;
  const dd = Math.hypot(dx, dy) || 1;
  let spd = t.speed;
  if (t.slowUntil && Date.now() < t.slowUntil) spd *= t.slowFactor;
  if (t.ignoreRiver && t.y >= C.RIVER_Y - C.RIVER_HALF && t.y <= C.RIVER_Y + C.RIVER_HALF) {
    spd *= 0.5;
  }
  const step = spd * dt * C.TROOP_SPEED_MULTIPLIER;
  const m = Math.min(step, dd);
  t.x += (dx / dd) * m;
  t.y += (dy / dd) * m;
}

function applyDamage(target, dmg, state) {
  if (target.type === 'troop') {
    damageTroop(target.ref, dmg);
  } else {
    const p = state.players[target.owner];
    const tower = p.towers[target.which];
    tower.hp -= dmg;
    if (tower.hp < 0) tower.hp = 0;
    if (target.which === 'king') tower.activated = true;
  }
}

function nextWaypoint(t, finalTarget) {
  const movingUp = t.owner === 0;
  const nearEdge = movingUp ? C.RIVER_Y + C.RIVER_HALF : C.RIVER_Y - C.RIVER_HALF;
  const farEdge = movingUp ? C.RIVER_Y - C.RIVER_HALF : C.RIVER_Y + C.RIVER_HALF;
  const crossed = movingUp ? t.y <= farEdge : t.y >= farEdge;
  if (crossed) return { x: finalTarget.x, y: finalTarget.y };
  const reachedNear = movingUp ? t.y <= nearEdge : t.y >= nearEdge;
  if (!reachedNear) return { x: t.bridgeX, y: nearEdge };
  return { x: t.bridgeX, y: farEdge };
}

// ---------- Feitiços ----------

function castSpell(state, idx, card, cardKey, x, y) {
  if (state.finished) return;
  state.events.push({ type: 'spell', cardKey, x, y, owner: idx });

  state.troops.forEach(t => {
    if (t.owner !== idx && t.hp > 0 && dist({ x, y }, t) <= card.radius) damageTroop(t, card.damage);
  });

  const towerDmg = card.towerDamage != null ? card.towerDamage : card.damage;
  state.players.forEach((p, pi) => {
    if (pi === idx) return;
    ['king', 'left', 'right'].forEach(k => {
      if (p.towers[k].hp <= 0) return;
      const pos = C.TOWER_POSITIONS['p' + pi][k];
      if (dist({ x, y }, pos) <= card.radius) {
        p.towers[k].hp -= towerDmg;
        if (p.towers[k].hp < 0) p.towers[k].hp = 0;
        if (k === 'king') p.towers[k].activated = true;
      }
    });
  });
  state.troops = state.troops.filter(t => t.hp > 0);
}

function handleDeploy(room, idx, cardKey, x, y) {
  const state = room.state;
  if (!state || (state.phase !== 'playing' && state.phase !== 'overtime')) return;
  const player = state.players[idx];
  const card = getEffectiveCard(player, cardKey);
  if (!card) return;
  if (!player.hand.includes(cardKey)) return;
  if (player.elixir < card.cost) return;

  x = clamp(x, 10, C.ARENA_W - 10);

  if (card.spell) {
    y = clamp(y, 10, C.ARENA_H - 10);
  } else {
    if (idx === 0) {
      y = clamp(y, C.RIVER_Y + C.RIVER_HALF + 5, C.ARENA_H - 10);
    } else {
      y = clamp(y, 10, C.RIVER_Y - C.RIVER_HALF - 5);
    }
  }

  player.elixir -= card.cost;

  if (card.spell) {
    castSpell(state, idx, card, cardKey, x, y);
    if (card.doubleCast) {
      setTimeout(() => castSpell(state, idx, card, cardKey, x, y), 500);
    }
  } else {
    const count = card.count || 1;
    const { lane, bridgeX } = laneAndBridgeFor(x);
    for (let i = 0; i < count; i++) {
      const off = card.spread ? (Math.random() - 0.5) * card.spread : (i - (count - 1) / 2) * 18;
      state.troops.push(makeTroop(card, cardKey, idx, x + off, y, lane, bridgeX));
    }
  }

  const hIdx = player.hand.indexOf(cardKey);
  player.hand[hIdx] = player.next;
  player.next = player.queue.shift();
  player.queue.push(cardKey);
}

// ---------- Socket.io ----------

io.on('connection', socket => {
  socket.on('check_room', code => {
    code = (code || '').toUpperCase().trim();
    const room = rooms[code];
    if (!room) return socket.emit('room_check_result', { ok: false, error: 'Sala não encontrada.' });
    if (room.sockets.length >= 2) return socket.emit('room_check_result', { ok: false, error: 'Sala cheia.' });
    socket.emit('room_check_result', { ok: true, code, mode: room.mode });
  });

  socket.on('create_room', ({ mode, deck } = {}) => {
    const room = createRoom(mode);
    room.sockets.push(socket.id);
    socket.join(room.code);
    socket.data.room = room.code;
    socket.data.idx = 0;
    if (room.mode !== 'draft') room.decks[0] = isValidDeck(deck) ? deck : randomDeck();
    socket.emit('room_created', { code: room.code, mode: room.mode });
    socket.emit('your_index', 0);
  });

  socket.on('join_room', ({ code, deck } = {}) => {
    code = (code || '').toUpperCase().trim();
    const room = rooms[code];
    if (!room) return socket.emit('join_error', 'Sala não encontrada.');
    if (room.sockets.length >= 2) return socket.emit('join_error', 'Sala cheia.');
    room.sockets.push(socket.id);
    socket.join(room.code);
    socket.data.room = room.code;
    socket.data.idx = 1;
    socket.emit('your_index', 1);

    if (room.mode !== 'draft') {
      room.decks[1] = isValidDeck(deck) ? deck : randomDeck();
      io.to(room.code).emit('room_ready', { code: room.code, mode: room.mode });
      startMatch(room);
    } else {
      io.to(room.code).emit('room_ready', { code: room.code, mode: room.mode });
      startDraft(room);
    }
  });

  socket.on('draft_pick', ({ cardKey }) => {
    const room = rooms[socket.data.room];
    if (!room) return;
    handleDraftPick(room, socket.data.idx, cardKey);
  });

  socket.on('evolution_pick', ({ buffId }) => {
    const room = rooms[socket.data.room];
    if (!room) return;
    handleEvolutionPick(room, socket.data.idx, buffId);
  });

  socket.on('deploy', ({ cardKey, x, y }) => {
    const room = rooms[socket.data.room];
    if (!room) return;
    handleDeploy(room, socket.data.idx, cardKey, x, y);
  });

  socket.on('disconnect', () => {
    const room = rooms[socket.data.room];
    if (!room) return;
    io.to(room.code).emit('opponent_left');
    destroyRoom(room);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Servidor rodando na porta ' + PORT));
