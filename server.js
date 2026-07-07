const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const CARDS = require('./public/cards.js');
const C = require('./public/constants.js');

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

function shuffledKeys() {
  const keys = Object.keys(CARDS);
  for (let i = keys.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [keys[i], keys[j]] = [keys[j], keys[i]];
  }
  return keys;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function newPlayerState() {
  const shuffled = shuffledKeys(); // 8 cartas
  const hand = shuffled.splice(0, 4);
  const next = shuffled.shift();
  const queue = shuffled; // restam 3
  return {
    elixir: C.ELIXIR_START,
    elixirTimer: 0,
    hand, next, queue,
    towers: {
      king: { hp: C.TOWERS.king.hp, maxHp: C.TOWERS.king.hp, activated: false, cooldown: 0 },
      left: { hp: C.TOWERS.princess.hp, maxHp: C.TOWERS.princess.hp, cooldown: 0 },
      right: { hp: C.TOWERS.princess.hp, maxHp: C.TOWERS.princess.hp, cooldown: 0 }
    }
  };
}

function createRoom() {
  let code;
  do { code = genCode(); } while (rooms[code]);
  const room = { code, sockets: [], state: null, interval: null, secTimer: null, started: false };
  rooms[code] = room;
  return room;
}

function destroyRoom(room) {
  if (room.interval) clearInterval(room.interval);
  if (room.secTimer) clearInterval(room.secTimer);
  delete rooms[room.code];
}

// ---------- Simulação do jogo ----------

function startMatch(room) {
  room.state = {
    time: C.MATCH_TIME,
    doubleElixir: false,
    finished: false,
    winner: null,
    reason: null,
    troops: [],
    players: [newPlayerState(), newPlayerState()]
  };
  room.started = true;

  io.to(room.code).emit('match_start', room.state);

  let last = Date.now();
  room.interval = setInterval(() => {
    const now = Date.now();
    const dt = (now - last) / 1000;
    last = now;
    tick(room.state, dt);
    io.to(room.code).emit('state', room.state);
    if (room.state.finished) {
      clearInterval(room.interval);
      clearInterval(room.secTimer);
    }
  }, 50);

  room.secTimer = setInterval(() => {
    if (!room.state || room.state.finished) return;
    room.state.time -= 1;
    if (room.state.time <= C.DOUBLE_ELIXIR_AT) room.state.doubleElixir = true;
    if (room.state.time <= 0) {
      room.state.time = 0;
      finishByTowers(room.state);
    }
  }, 1000);
}

function towerScore(p) {
  let n = 0;
  if (p.towers.left.hp > 0) n++;
  if (p.towers.right.hp > 0) n++;
  return n;
}

function finishByTowers(state) {
  state.finished = true;
  const s0 = towerScore(state.players[0]);
  const s1 = towerScore(state.players[1]);
  if (s0 === s1) {
    state.winner = null;
    state.reason = 'empate';
  } else {
    state.winner = s0 > s1 ? 0 : 1;
    state.reason = 'tempo';
  }
}

function tick(state, dt) {
  if (state.finished) return;

  // elixir
  const regenMs = state.doubleElixir ? C.ELIXIR_REGEN_MS_FAST : C.ELIXIR_REGEN_MS;
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

  // torres atacando
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
        best.hp -= stats.damage;
        tower.cooldown = stats.attackSpeed;
      }
    });
  });
  state.troops = state.troops.filter(t => t.hp > 0);

  // tropas
  state.troops.forEach(t => updateTroop(t, state, dt));
  state.troops = state.troops.filter(t => t.hp > 0);

  // condição de vitória imediata (torre do rei destruída)
  state.players.forEach((p, i) => {
    if (!state.finished && p.towers.king.hp <= 0) {
      state.finished = true;
      state.winner = 1 - i;
      state.reason = 'torre-do-rei';
    }
  });
}

function updateTroop(t, state, dt) {
  const enemyIdx = 1 - t.owner;
  const enemyPlayer = state.players[enemyIdx];

  let target = null;

  if (!t.buildingOnly) {
    let best = null, bestDist = Infinity;
    const side = t.y < C.RIVER_Y ? 'top' : 'bottom';
    state.troops.forEach(o => {
      if (o.owner === t.owner || o.hp <= 0) return;
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
      applyDamage(target, t.damage, state);
      t.cooldown = t.attackSpeed;
    }
    return;
  }

  const moveTo = target.type === 'troop' ? target : nextWaypoint(t, target);
  const dx = moveTo.x - t.x, dy = moveTo.y - t.y;
  const dd = Math.hypot(dx, dy) || 1;
  const step = t.speed * dt;
  const m = Math.min(step, dd);
  t.x += (dx / dd) * m;
  t.y += (dy / dd) * m;
}

function applyDamage(target, dmg, state) {
  if (target.type === 'troop') {
    target.ref.hp -= dmg;
  } else {
    const p = state.players[target.owner];
    const tower = p.towers[target.which];
    tower.hp -= dmg;
    if (tower.hp < 0) tower.hp = 0;
    if (target.which === 'king') tower.activated = true;
  }
}

function nextWaypoint(t, finalTarget) {
  const movingUp = t.owner === 0; // p0 sobe (y diminui), p1 desce (y aumenta)
  const nearEdge = movingUp ? C.RIVER_Y + C.RIVER_HALF : C.RIVER_Y - C.RIVER_HALF;
  const farEdge = movingUp ? C.RIVER_Y - C.RIVER_HALF : C.RIVER_Y + C.RIVER_HALF;
  const crossed = movingUp ? t.y <= farEdge : t.y >= farEdge;
  if (crossed) return { x: finalTarget.x, y: finalTarget.y };
  const reachedNear = movingUp ? t.y <= nearEdge : t.y >= nearEdge;
  if (!reachedNear) return { x: t.bridgeX, y: nearEdge };
  return { x: t.bridgeX, y: farEdge };
}

function handleDeploy(room, idx, cardKey, x, y) {
  const state = room.state;
  if (!state || state.finished) return;
  const player = state.players[idx];
  const card = CARDS[cardKey];
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
    state.troops.forEach(t => {
      if (t.owner !== idx && dist({ x, y }, t) <= card.radius) t.hp -= card.damage;
    });
    state.players.forEach((p, pi) => {
      if (pi === idx) return;
      ['king', 'left', 'right'].forEach(k => {
        if (p.towers[k].hp <= 0) return;
        const pos = C.TOWER_POSITIONS['p' + pi][k];
        if (dist({ x, y }, pos) <= card.radius) {
          p.towers[k].hp -= card.damage;
          if (p.towers[k].hp < 0) p.towers[k].hp = 0;
          if (k === 'king') p.towers[k].activated = true;
        }
      });
    });
    state.troops = state.troops.filter(t => t.hp > 0);
  } else {
    const count = card.count || 1;
    const bridgeX = x < C.ARENA_W / 2 ? C.BRIDGES[0].x : C.BRIDGES[1].x;
    const lane = x < C.ARENA_W / 2 ? 'left' : 'right';
    for (let i = 0; i < count; i++) {
      const off = card.spread ? (Math.random() - 0.5) * card.spread : (i - (count - 1) / 2) * 18;
      state.troops.push({
        id: Math.random().toString(36).slice(2),
        owner: idx,
        cardKey,
        x: clamp(x + off, 10, C.ARENA_W - 10),
        y,
        hp: card.hp,
        maxHp: card.hp,
        damage: card.damage,
        range: card.range,
        speed: card.speed,
        attackSpeed: card.attackSpeed,
        cooldown: 0,
        radius: card.radius,
        sight: card.sight || 0,
        buildingOnly: card.target === 'buildings',
        lane,
        bridgeX
      });
    }
  }

  const hIdx = player.hand.indexOf(cardKey);
  player.hand[hIdx] = player.next;
  player.next = player.queue.shift();
  player.queue.push(cardKey);
}

// ---------- Socket.io ----------

io.on('connection', socket => {
  socket.on('create_room', () => {
    const room = createRoom();
    room.sockets.push(socket.id);
    socket.join(room.code);
    socket.data.room = room.code;
    socket.data.idx = 0;
    socket.emit('room_created', { code: room.code });
    socket.emit('your_index', 0);
  });

  socket.on('join_room', code => {
    code = (code || '').toUpperCase().trim();
    const room = rooms[code];
    if (!room) return socket.emit('join_error', 'Sala não encontrada.');
    if (room.sockets.length >= 2) return socket.emit('join_error', 'Sala cheia.');
    room.sockets.push(socket.id);
    socket.join(room.code);
    socket.data.room = room.code;
    socket.data.idx = 1;
    socket.emit('your_index', 1);
    io.to(room.code).emit('room_ready', { code: room.code });
    startMatch(room);
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
