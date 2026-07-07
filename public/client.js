const socket = io();
const C = window.GAME_CONST;
const CARDS = window.CARDS;

let myIdx = null;
let latestState = null;
let selectedCard = null;
let roomCode = null;

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

socket.on('room_ready', () => {
  // ambos jogadores prontos, o match_start virá em seguida
});

socket.on('match_start', state => {
  latestState = state;
  selectedCard = null;
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
function renderHand() {
  if (!latestState) return;
  const player = latestState.players[myIdx];
  const handDiv = document.getElementById('hand');
  handDiv.innerHTML = '';
  player.hand.forEach(cardKey => {
    const card = CARDS[cardKey];
    const el = document.createElement('div');
    el.className = 'card';
    el.style.background = card.color;
    const affordable = player.elixir >= card.cost;
    if (!affordable) el.classList.add('disabled');
    if (selectedCard === cardKey) el.classList.add('selected');
    el.innerHTML = `<div class="cost">${card.cost}</div><div class="icon">${card.icon}</div><div>${card.name}</div>`;
    el.addEventListener('click', () => {
      if (!affordable) return;
      selectedCard = (selectedCard === cardKey) ? null : cardKey;
      renderHand();
    });
    handDiv.appendChild(el);
  });

  document.getElementById('elixir-count').textContent = Math.floor(player.elixir);
  document.getElementById('elixir-fill').style.width = (player.elixir / C.ELIXIR_MAX * 100) + '%';
  document.getElementById('double-elixir-badge').classList.toggle('hidden', !latestState.doubleElixir);

  const mm = Math.floor(latestState.time / 60);
  const ss = String(latestState.time % 60).padStart(2, '0');
  document.getElementById('timer').textContent = `${mm}:${ss}`;
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
  renderHand();
  if (!latestState) return;
  const W = C.ARENA_W, H = C.ARENA_H;

  ctx.clearRect(0, 0, W, H);

  // campo
  ctx.fillStyle = '#3f8f4a';
  ctx.fillRect(0, 0, W, H);

  // metades levemente diferentes
  ctx.fillStyle = 'rgba(0,0,0,0.05)';
  ctx.fillRect(0, 0, W, H / 2);

  // rio
  ctx.fillStyle = '#2196f3';
  ctx.fillRect(0, C.RIVER_Y - C.RIVER_HALF, W, C.RIVER_HALF * 2);

  // pontes
  ctx.fillStyle = '#8d6e63';
  C.BRIDGES.forEach(b => {
    ctx.fillRect(b.x - 30, C.RIVER_Y - C.RIVER_HALF - 6, 60, C.RIVER_HALF * 2 + 12);
  });

  // linha central (referência visual)
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(0, H / 2);
  ctx.lineTo(W, H / 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // torres - meu lado sempre embaixo (idx myIdx), oponente em cima
  const oppIdx = 1 - myIdx;
  drawSideTowers(myIdx, latestState.players[myIdx]);
  drawSideTowers(oppIdx, latestState.players[oppIdx]);

  // tropas
  latestState.troops.forEach(drawTroop);

  // destaque de área válida se uma carta estiver selecionada
  if (selectedCard) {
    const card = CARDS[selectedCard];
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    if (card.spell) {
      ctx.fillRect(0, 0, W, H);
    } else {
      // minha metade válida (em coordenadas de display, meu lado é sempre embaixo)
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

// ---------- Interação: clicar no campo para posicionar carta ----------
function canvasClickToWorld(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const dispX = (clientX - rect.left) * scaleX;
  const dispY = (clientY - rect.top) * scaleY;
  return toWorld(dispX, dispY);
}

function handlePlacement(clientX, clientY) {
  if (!selectedCard || !latestState) return;
  const world = canvasClickToWorld(clientX, clientY);
  socket.emit('deploy', { cardKey: selectedCard, x: world.x, y: world.y });
  selectedCard = null;
}

canvas.addEventListener('click', e => handlePlacement(e.clientX, e.clientY));
canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  const t = e.changedTouches[0];
  handlePlacement(t.clientX, t.clientY);
}, { passive: false });

showScreen('screen-home');
