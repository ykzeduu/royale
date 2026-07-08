const socket = io();
const C = window.GAME_CONST;
const CARDS = window.CARDS;

let myIdx = null;
let latestState = null;
let roomCode = null;
let dragState = null; // { cardKey, ghost }
let handSlots = []; // [{el, cardKey}]
let effects = [];       // efeitos visuais temporários (projéteis, feitiços)
let attackFlash = {};   // id da tropa -> timestamp do último ataque (para o "pulo" de ataque)
let rafId = null;

let selectedMode = 'normal';
let pendingDeckAction = null; // {action:'create'} ou {action:'join', code}
let myDeckSelection = [];

// ---------- Telas ----------
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function shuffleClient(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- Home: seleção de modo ----------
document.querySelectorAll('.mode-card').forEach(el => {
  el.addEventListener('click', () => {
    document.querySelectorAll('.mode-card').forEach(m => m.classList.remove('selected'));
    el.classList.add('selected');
    selectedMode = el.dataset.mode;
  });
});

document.getElementById('btn-create').addEventListener('click', () => {
  if (selectedMode === 'normal') {
    pendingDeckAction = { action: 'create' };
    openDeckBuilder();
  } else {
    socket.emit('create_room', { mode: 'draft' });
  }
});

document.getElementById('btn-join').addEventListener('click', () => {
  const code = document.getElementById('input-code').value.trim();
  if (!code) return;
  document.getElementById('home-error').textContent = '';
  socket.emit('check_room', code);
});

document.getElementById('input-code').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-join').click();
});

socket.on('room_check_result', res => {
  if (!res.ok) {
    document.getElementById('home-error').textContent = res.error;
    return;
  }
  if (res.mode === 'normal') {
    pendingDeckAction = { action: 'join', code: res.code };
    openDeckBuilder();
  } else {
    socket.emit('join_room', { code: res.code });
  }
});

document.getElementById('btn-copy').addEventListener('click', () => {
  if (!roomCode) return;
  navigator.clipboard?.writeText(roomCode).catch(() => {});
  const btn = document.getElementById('btn-copy');
  const old = btn.textContent;
  btn.textContent = 'Copiado!';
  setTimeout(() => (btn.textContent = old), 1200);
});

document.getElementById('btn-replay').addEventListener('click', () => {
  location.reload();
});

// ---------- Montagem de baralho (modo normal) ----------
function openDeckBuilder() {
  myDeckSelection = [];
  buildDeckGrid();
  updateDeckCounter();
  showScreen('screen-deckbuilder');
}

function buildDeckGrid() {
  const grid = document.getElementById('deck-grid');
  grid.innerHTML = '';
  Object.keys(CARDS).forEach(key => {
    const card = CARDS[key];
    const el = document.createElement('div');
    el.className = 'deck-card';
    el.dataset.key = key;
    el.style.background = card.color;
    el.innerHTML = `<div class="cost">${card.cost}</div><div class="icon">${card.icon}</div><div>${card.name}</div>`;
    el.addEventListener('click', () => {
      const i = myDeckSelection.indexOf(key);
      if (i >= 0) {
        myDeckSelection.splice(i, 1);
        el.classList.remove('picked');
      } else {
        if (myDeckSelection.length >= 8) return;
        myDeckSelection.push(key);
        el.classList.add('picked');
      }
      updateDeckCounter();
    });
    grid.appendChild(el);
  });
}

function updateDeckCounter() {
  document.getElementById('deck-count').textContent = myDeckSelection.length;
  document.getElementById('btn-confirm-deck').disabled = myDeckSelection.length !== 8;
}

document.getElementById('btn-random-deck').addEventListener('click', () => {
  myDeckSelection = shuffleClient(Object.keys(CARDS)).slice(0, 8);
  document.querySelectorAll('#deck-grid .deck-card').forEach(el => {
    el.classList.toggle('picked', myDeckSelection.includes(el.dataset.key));
  });
  updateDeckCounter();
});

document.getElementById('btn-confirm-deck').addEventListener('click', () => {
  if (myDeckSelection.length !== 8 || !pendingDeckAction) return;
  if (pendingDeckAction.action === 'create') {
    socket.emit('create_room', { mode: 'normal', deck: myDeckSelection });
  } else {
    socket.emit('join_room', { code: pendingDeckAction.code, deck: myDeckSelection });
  }
});

// ---------- Escolha Rápida (draft) ----------
socket.on('draft_round', data => {
  showScreen('screen-draft');
  document.getElementById('draft-round-label').textContent = `Rodada ${data.round} de ${data.total}`;
  const isMyTurn = data.chooser === myIdx;
  document.getElementById('draft-turn-label').textContent = isMyTurn ? 'Sua vez de escolher!' : 'Aguardando escolha do adversário...';
  renderDraftCard('draft-card-a', data.cardA, isMyTurn);
  renderDraftCard('draft-card-b', data.cardB, isMyTurn);
  renderMiniDeck(data.decks[myIdx] || []);
});

function renderDraftCard(elId, cardKey, pickable) {
  const el = document.getElementById(elId);
  const card = CARDS[cardKey];
  el.style.background = card.color;
  el.innerHTML = `<div class="icon">${card.icon}</div><div>${card.name}</div>`;
  el.classList.toggle('pickable', pickable);
  el.classList.toggle('disabled', !pickable);
  el.onclick = pickable ? () => socket.emit('draft_pick', { cardKey }) : null;
}

function renderMiniDeck(deckArr) {
  const el = document.getElementById('draft-my-deck');
  el.innerHTML = '';
  deckArr.forEach(key => {
    const span = document.createElement('span');
    span.textContent = CARDS[key].icon;
    el.appendChild(span);
  });
}

// ---------- Socket eventos ----------
socket.on('your_index', idx => { myIdx = idx; });

socket.on('room_created', ({ code }) => {
  roomCode = code;
  document.getElementById('room-code-display').textContent = code;
  showScreen('screen-waiting');
});

socket.on('join_error', msg => {
  document.getElementById('home-error').textContent = msg;
});

socket.on('room_ready', () => {});

socket.on('match_start', state => {
  latestState = state;
  effects = [];
  attackFlash = {};
  initHandSlots();
  showScreen('screen-game');
  startRenderLoop();
});

socket.on('state', state => {
  latestState = state;
  (state.events || []).forEach(spawnEffect);
  if (state.finished) onMatchEnd(state);
});

socket.on('opponent_left', () => {
  stopRenderLoop();
  document.getElementById('end-title').textContent = 'Seu adversário saiu';
  document.getElementById('end-subtitle').textContent = 'A partida foi encerrada.';
  document.querySelectorAll('#screen-end .stars-row').forEach(el => el.style.display = 'none');
  showScreen('screen-end');
});

function onMatchEnd(state) {
  let title, subtitle;
  if (state.reason === 'empate') {
    title = 'Empate!';
    subtitle = 'Ninguém destruiu torres suficientes.';
  } else if (state.winner === myIdx) {
    title = 'Vitória! 🏆';
    subtitle = state.reason === 'torre-do-rei' ? 'Você destruiu a torre do rei!'
      : state.reason === 'morte-subita' ? 'Você venceu na morte súbita!'
      : 'Você teve mais torres ao fim do tempo.';
  } else {
    title = 'Derrota';
    subtitle = state.reason === 'torre-do-rei' ? 'Sua torre do rei foi destruída.'
      : state.reason === 'morte-subita' ? 'Seu adversário venceu na morte súbita.'
      : 'Seu adversário teve mais torres.';
  }
  document.getElementById('end-title').textContent = title;
  document.getElementById('end-subtitle').textContent = subtitle;
  document.querySelectorAll('#screen-end .stars-row').forEach(el => el.style.display = '');

  const crowns = state.crowns || [0, 0];
  renderStars('end-stars-me', crowns[myIdx]);
  renderStars('end-stars-opp', crowns[1 - myIdx]);

  setTimeout(() => { stopRenderLoop(); showScreen('screen-end'); }, 900);
}

function renderStars(elId, count) {
  const el = document.getElementById(elId);
  el.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    const s = document.createElement('span');
    s.className = 'star' + (i < count ? ' filled' : '');
    s.textContent = '⭐';
    el.appendChild(s);
  }
}

// ---------- Transformação de coordenadas ----------
// Jogador 1 vê o campo rotacionado 180° para sempre estar "embaixo".
function toDisplay(x, y) {
  if (myIdx === 1) return { x: C.ARENA_W - x, y: C.ARENA_H - y };
  return { x, y };
}
function toWorld(x, y) {
  if (myIdx === 1) return { x: C.ARENA_W - x, y: C.ARENA_H - y };
  return { x, y };
}

// ---------- HUD: mão de cartas ----------
function initHandSlots() {
  const handDiv = document.getElementById('hand');
  handDiv.innerHTML = '';
  handSlots = [];
  for (let i = 0; i < 4; i++) {
    const el = document.createElement('div');
    el.className = 'card';
    handDiv.appendChild(el);
    const slot = { el, cardKey: null };
    attachDragHandlers(slot);
    handSlots.push(slot);
  }
}

function attachDragHandlers(slot) {
  slot.el.addEventListener('pointerdown', e => {
    e.preventDefault();
    const cardKey = slot.cardKey;
    if (!cardKey || !latestState) return;
    if (latestState.phase !== 'playing' && latestState.phase !== 'overtime') return;
    const player = latestState.players[myIdx];
    if (player.elixir < CARDS[cardKey].cost) return;
    startDrag(cardKey, e.clientX, e.clientY);
    slot.el.setPointerCapture(e.pointerId);
    slot.el.classList.add('dragging');
  });
  slot.el.addEventListener('pointermove', e => {
    if (dragState) moveGhost(e.clientX, e.clientY);
  });
  slot.el.addEventListener('pointerup', e => {
    slot.el.classList.remove('dragging');
    if (dragState) endDrag(e.clientX, e.clientY);
  });
  slot.el.addEventListener('pointercancel', () => {
    slot.el.classList.remove('dragging');
    cancelDrag();
  });
}

function updateHandCards() {
  if (!latestState || handSlots.length === 0) return;
  const player = latestState.players[myIdx];
  player.hand.forEach((cardKey, i) => {
    const slot = handSlots[i];
    if (!slot) return;
    if (slot.cardKey !== cardKey) {
      slot.cardKey = cardKey;
      const card = CARDS[cardKey];
      slot.el.style.background = card.color;
      slot.el.innerHTML = `<div class="cost">${card.cost}</div><div class="icon">${card.icon}</div><div class="cardname">${card.name}</div>`;
    }
    const affordable = player.elixir >= CARDS[cardKey].cost;
    slot.el.classList.toggle('disabled', !affordable);
    slot.el.classList.toggle('selected', dragState && dragState.cardKey === cardKey);
  });
}

// ---------- HUD geral (elixir, timer, coroas, prorrogação, contagem regressiva) ----------
function crownsForClient(state, idx) {
  const opp = state.players[1 - idx].towers;
  let n = 0;
  if (opp.left.hp <= 0) n++;
  if (opp.right.hp <= 0) n++;
  if (opp.king.hp <= 0) n++;
  return n;
}

function updateHud() {
  if (!latestState || myIdx === null) return;
  const state = latestState;
  const player = state.players[myIdx];

  document.getElementById('elixir-count').textContent = Math.floor(player.elixir);
  document.getElementById('elixir-fill').style.width = (player.elixir / C.ELIXIR_MAX * 100) + '%';
  document.getElementById('double-elixir-badge').classList.toggle('hidden', !state.doubleElixir);

  document.getElementById('crown-me').textContent = crownsForClient(state, myIdx);
  document.getElementById('crown-opp').textContent = crownsForClient(state, 1 - myIdx);

  const overtimeBadge = document.getElementById('overtime-badge');
  overtimeBadge.classList.toggle('hidden', state.phase !== 'overtime');

  const secs = state.phase === 'overtime' ? state.overtimeTime : state.time;
  const mm = Math.floor(secs / 60);
  const ss = String(secs % 60).padStart(2, '0');
  document.getElementById('timer').textContent = `${mm}:${ss}`;

  const overlay = document.getElementById('countdown-overlay');
  const text = document.getElementById('countdown-text');
  if (state.phase === 'countdown') {
    if (state.countdown >= 1) {
      overlay.classList.remove('hidden');
      text.textContent = state.countdown;
    } else if (state.countdown === 0) {
      overlay.classList.remove('hidden');
      text.textContent = 'VAI!';
    } else {
      overlay.classList.add('hidden');
    }
  } else {
    overlay.classList.add('hidden');
  }

  updateHandCards();
}

// ---------- Arrastar e soltar ----------
function startDrag(cardKey, clientX, clientY) {
  const card = CARDS[cardKey];
  const ghost = document.createElement('div');
  ghost.className = 'card drag-ghost';
  ghost.style.background = card.color;
  ghost.innerHTML = `<div class="icon">${card.icon}</div>`;
  document.body.appendChild(ghost);
  dragState = { cardKey, ghost };
  moveGhost(clientX, clientY);
}

function moveGhost(x, y) {
  if (!dragState) return;
  dragState.ghost.style.left = x + 'px';
  dragState.ghost.style.top = y + 'px';
  const rect = canvas.getBoundingClientRect();
  const over = x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  dragState.ghost.classList.toggle('over-field', over);
}

function endDrag(clientX, clientY) {
  if (!dragState) return;
  const rect = canvas.getBoundingClientRect();
  const overCanvas = clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  if (overCanvas) {
    const world = canvasClickToWorld(clientX, clientY);
    socket.emit('deploy', { cardKey: dragState.cardKey, x: world.x, y: world.y });
  }
  dragState.ghost.remove();
  dragState = null;
}

function cancelDrag() {
  if (!dragState) return;
  dragState.ghost.remove();
  dragState = null;
}

// ---------- Efeitos visuais (projéteis / feitiços) ----------
function spawnEffect(ev) {
  if (ev.type === 'shot') {
    effects.push({ type: 'shot', x1: ev.x1, y1: ev.y1, x2: ev.x2, y2: ev.y2, owner: ev.owner, start: performance.now(), duration: 180 });
    if (ev.fromId) attackFlash[ev.fromId] = performance.now();
  } else if (ev.type === 'melee') {
    if (ev.fromId) attackFlash[ev.fromId] = performance.now();
  } else if (ev.type === 'spell') {
    effects.push({ type: 'spell', cardKey: ev.cardKey, x: ev.x, y: ev.y, owner: ev.owner, start: performance.now(), duration: 750 });
  }
}

function hashInt(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

function lighten(hex) {
  hex = (hex || '#2196f3').replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const num = parseInt(hex, 16);
  let r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255;
  r = Math.min(255, r + 70); g = Math.min(255, g + 70); b = Math.min(255, b + 70);
  return `rgb(${r},${g},${b})`;
}

// ---------- Canvas ----------
const canvas = document.getElementById('arena');
const ctx = canvas.getContext('2d');

function buildPattern(w, h, drawFn) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const pc = c.getContext('2d');
  drawFn(pc, w, h);
  return ctx.createPattern(c, 'repeat');
}

let grassPattern = null, woodPattern = null;
function initPatterns() {
  grassPattern = buildPattern(48, 48, pc => {
    pc.fillStyle = '#3f8f4a'; pc.fillRect(0, 0, 48, 48);
    pc.fillStyle = '#469152';
    for (let i = 0; i < 10; i++) {
      pc.fillRect(Math.random() * 48, Math.random() * 48, 5 + Math.random() * 7, 2);
    }
    pc.fillStyle = 'rgba(0,0,0,0.06)';
    for (let i = 0; i < 12; i++) {
      pc.beginPath(); pc.arc(Math.random() * 48, Math.random() * 48, 1.4, 0, Math.PI * 2); pc.fill();
    }
  });
  woodPattern = buildPattern(30, 30, pc => {
    pc.fillStyle = '#8d6e63'; pc.fillRect(0, 0, 30, 30);
    pc.strokeStyle = 'rgba(0,0,0,0.18)'; pc.lineWidth = 3;
    for (let i = -30; i < 30; i += 9) {
      pc.beginPath(); pc.moveTo(i, 0); pc.lineTo(i + 30, 30); pc.stroke();
    }
  });
}
initPatterns();

function drawRiver() {
  const W = C.ARENA_W;
  ctx.fillStyle = '#2196f3';
  ctx.fillRect(0, C.RIVER_Y - C.RIVER_HALF, W, C.RIVER_HALF * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 2;
  const t = performance.now() / 600;
  for (let li = 0; li < 3; li++) {
    ctx.beginPath();
    const yBase = C.RIVER_Y - C.RIVER_HALF + 8 + li * 12;
    for (let x = 0; x <= W; x += 12) {
      const y = yBase + Math.sin(t + x * 0.06 + li * 1.4) * 3;
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

function drawTowerShape(x, y, hp, maxHp, radius, isKing) {
  const pct = Math.max(0, hp / maxHp);
  ctx.save();
  ctx.translate(x, y);
  if (hp > 0) {
    const grad = ctx.createRadialGradient(-radius * 0.3, -radius * 0.3, 1, 0, 0, radius);
    grad.addColorStop(0, isKing ? '#a1887f' : '#795548');
    grad.addColorStop(1, isKing ? '#6d4c41' : '#4e342e');
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
  }
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#3e2723';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = (isKing ? 20 : 14) + 'px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(isKing ? '👑' : '🏹', 0, 1);
  ctx.restore();

  if (hp > 0) {
    const barW = radius * 2;
    ctx.fillStyle = '#000';
    ctx.fillRect(x - barW / 2, y - radius - 10, barW, 5);
    ctx.fillStyle = pct > 0.4 ? '#4caf50' : '#f44336';
    ctx.fillRect(x - barW / 2, y - radius - 10, barW * pct, 5);
  }
}

function drawTroop(t) {
  const p = toDisplay(t.x, t.y);
  const card = CARDS[t.cardKey];
  const now = performance.now();
  const phase = hashInt(t.id) % 1000;
  const bob = Math.sin(now / 220 + phase) * 1.6;

  let scale = 1;
  const flashAt = attackFlash[t.id];
  if (flashAt) {
    const age = now - flashAt;
    if (age < 180) scale = 1 + 0.35 * (1 - age / 180);
    else delete attackFlash[t.id];
  }

  ctx.save();
  ctx.translate(p.x, p.y + bob + (t.flying ? -14 : 0));

  if (t.flying) {
    // sombra projetada no chão para dar noção de altura
    ctx.beginPath();
    ctx.ellipse(0, t.radius + 14, t.radius * 0.7, t.radius * 0.25, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.ellipse(0, t.radius * 0.9, t.radius * 0.8, t.radius * 0.3, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fill();
  }

  ctx.scale(scale, scale);
  const base = t.owner === myIdx ? (card.color || '#2196f3') : '#e53935';
  const grad = ctx.createRadialGradient(-t.radius * 0.3, -t.radius * 0.3, 1, 0, 0, t.radius);
  grad.addColorStop(0, lighten(base));
  grad.addColorStop(1, base);
  ctx.beginPath();
  ctx.arc(0, 0, t.radius, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = t.owner === myIdx ? '#1565c0' : '#7f0000';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.font = Math.max(10, t.radius) + 'px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(card.icon, 0, 1);
  ctx.restore();

  const pct = Math.max(0, t.hp / t.maxHp);
  const barW = t.radius * 2;
  const barY = p.y + bob + (t.flying ? -14 : 0) - t.radius - 8;
  ctx.fillStyle = '#000';
  ctx.fillRect(p.x - barW / 2, barY, barW, 4);
  ctx.fillStyle = pct > 0.4 ? '#4caf50' : '#f44336';
  ctx.fillRect(p.x - barW / 2, barY, barW * pct, 4);
}

function drawShotEffect(e, p) {
  const a = toDisplay(e.x1, e.y1), b = toDisplay(e.x2, e.y2);
  const x = a.x + (b.x - a.x) * p, y = a.y + (b.y - a.y) * p;
  ctx.save();
  const color = e.owner === myIdx ? '#64b5f6' : '#ff8a65';
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(x, y); ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawSpellEffect(e, p) {
  const target = toDisplay(e.x, e.y);
  const card = CARDS[e.cardKey];
  if (p < 0.55) {
    const fp = p / 0.55;
    const startY = -40;
    const x = target.x + Math.sin(fp * 8) * 6;
    const y = startY + (target.y - startY) * fp;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(fp * 6);
    ctx.font = (32 - fp * 8) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(card.icon, 0, 0);
    ctx.restore();
  } else {
    const ep = (p - 0.55) / 0.45;
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - ep);
    ctx.fillStyle = card.color || '#ff5722';
    ctx.beginPath();
    ctx.arc(target.x, target.y, card.radius * (0.3 + ep * 1.1), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawEffects() {
  const now = performance.now();
  effects = effects.filter(e => now - e.start < e.duration);
  effects.forEach(e => {
    const p = Math.min(1, (now - e.start) / e.duration);
    if (e.type === 'shot') drawShotEffect(e, p);
    else if (e.type === 'spell') drawSpellEffect(e, p);
  });
}

function drawSideTowers(ownerIdx, player) {
  const positions = C.TOWER_POSITIONS['p' + ownerIdx];
  ['left', 'right'].forEach(k => {
    const pos = toDisplay(positions[k].x, positions[k].y);
    drawTowerShape(pos.x, pos.y, player.towers[k].hp, player.towers[k].maxHp, C.TOWERS.princess.radius, false);
  });
  const kp = toDisplay(positions.king.x, positions.king.y);
  drawTowerShape(kp.x, kp.y, player.towers.king.hp, player.towers.king.maxHp, C.TOWERS.king.radius, true);
}

function render() {
  updateHud();
  if (latestState && myIdx !== null) {
    const W = C.ARENA_W, H = C.ARENA_H;
    ctx.clearRect(0, 0, W, H);

    ctx.fillStyle = grassPattern || '#3f8f4a';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(0,0,0,0.05)';
    ctx.fillRect(0, 0, W, H / 2);

    drawRiver();

    ctx.fillStyle = woodPattern || '#8d6e63';
    C.BRIDGES.forEach(b => {
      ctx.fillRect(b.x - 30, C.RIVER_Y - C.RIVER_HALF - 6, 60, C.RIVER_HALF * 2 + 12);
    });

    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(0, H / 2);
    ctx.lineTo(W, H / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    const oppIdx = 1 - myIdx;
    drawSideTowers(myIdx, latestState.players[myIdx]);
    drawSideTowers(oppIdx, latestState.players[oppIdx]);

    latestState.troops.forEach(drawTroop);
    drawEffects();

    if (dragState) {
      const card = CARDS[dragState.cardKey];
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      if (card.spell) {
        ctx.fillRect(0, 0, W, H);
      } else {
        ctx.fillRect(0, H / 2 + C.RIVER_HALF, W, H / 2 - C.RIVER_HALF);
      }
    }
  }
  rafId = requestAnimationFrame(render);
}

function startRenderLoop() {
  if (rafId) return;
  rafId = requestAnimationFrame(render);
}
function stopRenderLoop() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
}

function canvasClickToWorld(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const dispX = (clientX - rect.left) * scaleX;
  const dispY = (clientY - rect.top) * scaleY;
  return toWorld(dispX, dispY);
}

showScreen('screen-home');
