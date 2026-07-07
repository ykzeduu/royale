const socket = io();
const C = window.GAME_CONST;
const CARDS = window.CARDS;

let myIdx = null;
let latestState = null;
let roomCode = null;
let dragState = null; // { cardKey, ghostEl }
let handSlots = []; // [{el, cardKey}]

// ---------- Telas ----------
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ---------- Home ----------
document.getElementById('btn-create').addEventListener('click', () => {
  socket.emit('create_room');
});

document.getElementById('btn-join').addEventListener('click', () => {
  const code = document.getElementById('input-code').value;
  if (!code) return;
  socket.emit('join_room', code);
});

document.getElementById('input-code').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-join').click();
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
  initHandSlots();
  showScreen('screen-game');
  render();
});

socket.on('state', state => {
  latestState = state;
  render();
  if (state.finished) onMatchEnd(state);
});

socket.on('opponent_left', () => {
  document.getElementById('end-title').textContent = 'Seu adversário saiu';
  document.getElementById('end-subtitle').textContent = 'A partida foi encerrada.';
  showScreen('screen-end');
});

function onMatchEnd(state) {
  let title, subtitle;
  if (state.reason === 'empate') {
    title = 'Empate!';
    subtitle = 'Ninguém destruiu torres suficientes.';
  } else if (state.winner === myIdx) {
    title = 'Vitória! 🏆';
    subtitle = state.reason === 'torre-do-rei' ? 'Você destruiu a torre do rei!' : 'Você teve mais torres ao fim do tempo.';
  } else {
    title = 'Derrota';
    subtitle = state.reason === 'torre-do-rei' ? 'Sua torre do rei foi destruída.' : 'Seu adversário teve mais torres.';
  }
  document.getElementById('end-title').textContent = title;
  document.getElementById('end-subtitle').textContent = subtitle;
  setTimeout(() => showScreen('screen-end'), 600);
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
// IMPORTANTE: os 4 slots são criados UMA VEZ só e nunca mais recriados.
// Antes, a mão inteira era recriada a cada estado do servidor (~20x/s), o que
// fazia o navegador "perder" o clique/toque no meio do caminho (o elemento em
// que você tocava sumia antes do gesto terminar). Agora só atualizamos o
// conteúdo/estilo do slot quando a carta dele realmente muda.
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

function updateHand() {
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

  document.getElementById('elixir-count').textContent = Math.floor(player.elixir);
  document.getElementById('elixir-fill').style.width = (player.elixir / C.ELIXIR_MAX * 100) + '%';
  document.getElementById('double-elixir-badge').classList.toggle('hidden', !latestState.doubleElixir);

  const mm = Math.floor(latestState.time / 60);
  const ss = String(latestState.time % 60).padStart(2, '0');
  document.getElementById('timer').textContent = `${mm}:${ss}`;
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
  // realça o campo se o dedo/mouse estiver em cima dele
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

// ---------- Canvas ----------
const canvas = document.getElementById('arena');
const ctx = canvas.getContext('2d');

function drawTowerShape(x, y, hp, maxHp, radius, isKing) {
  const pct = Math.max(0, hp / maxHp);
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = isKing ? '#8d6e63' : '#5d4037';
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#3e2723';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = isKing ? '20px sans-serif' : '14px sans-serif';
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
  } else {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawTroop(t) {
  const p = toDisplay(t.x, t.y);
  const card = CARDS[t.cardKey];
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.fillStyle = t.owner === myIdx ? (card.color || '#2196f3') : '#e53935';
  ctx.beginPath();
  ctx.arc(0, 0, t.radius, 0, Math.PI * 2);
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
  ctx.fillStyle = '#000';
  ctx.fillRect(p.x - barW / 2, p.y - t.radius - 8, barW, 4);
  ctx.fillStyle = pct > 0.4 ? '#4caf50' : '#f44336';
  ctx.fillRect(p.x - barW / 2, p.y - t.radius - 8, barW * pct, 4);
}

function render() {
  updateHand();
  if (!latestState || myIdx === null) return;
  const W = C.ARENA_W, H = C.ARENA_H;

  ctx.clearRect(0, 0, W, H);

  ctx.fillStyle = '#3f8f4a';
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = 'rgba(0,0,0,0.05)';
  ctx.fillRect(0, 0, W, H / 2);

  ctx.fillStyle = '#2196f3';
  ctx.fillRect(0, C.RIVER_Y - C.RIVER_HALF, W, C.RIVER_HALF * 2);

  ctx.fillStyle = '#8d6e63';
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

function drawSideTowers(ownerIdx, player) {
  const positions = C.TOWER_POSITIONS['p' + ownerIdx];
  ['left', 'right'].forEach(k => {
    const pos = toDisplay(positions[k].x, positions[k].y);
    drawTowerShape(pos.x, pos.y, player.towers[k].hp, player.towers[k].maxHp, C.TOWERS.princess.radius, false);
  });
  const kp = toDisplay(positions.king.x, positions.king.y);
  drawTowerShape(kp.x, kp.y, player.towers.king.hp, player.towers.king.maxHp, C.TOWERS.king.radius, true);
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
