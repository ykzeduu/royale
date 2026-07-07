const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { 
    cors: { origin: "*" },
    transports: ['polling'] // Força Polling estável para garantir o Player 2 no Render
});

app.use(express.static('public'));

let lobbies = {}; 

function generateLobbyId() {
    return Math.random().toString(36).substring(2, 7).toUpperCase();
}

const TROOP_TYPES = {
    gigante: { hp: 400, maxHp: 400, speed: 1.0, damage: 20, cost: 5, range: 20, size: 16 },
    arqueiro: { hp: 100, maxHp: 100, speed: 1.6, damage: 12, cost: 3, range: 90, size: 10 },
    goblin: { hp: 70, maxHp: 70, speed: 2.6, damage: 10, cost: 2, range: 15, size: 8 }
};

io.on('connection', (socket) => {
    // Força atualização imediata de salas disponíveis
    socket.emit('update_lobby_list', Object.values(lobbies).filter(l => !l.isGameStarted && l.players.length < 2));

    socket.on('create_lobby', (username) => {
        const lobbyId = generateLobbyId();
        lobbies[lobbyId] = {
            id: lobbyId,
            creator: username,
            players: [{ id: socket.id, name: username, role: 'p1' }],
            isGameStarted: false,
            gameState: {
                elixir: { p1: 5, p2: 5 },
                towers: {
                    p1_king: { hp: 1200, maxHp: 1200, x: 200, y: 550, type: 'king', alive: true },
                    p1_left: { hp: 800, maxHp: 800, x: 80, y: 460, type: 'princess', alive: true },
                    p1_right: { hp: 800, maxHp: 800, x: 320, y: 460, type: 'princess', alive: true },
                    p2_king: { hp: 1200, maxHp: 1200, x: 200, y: 50, type: 'king', alive: true },
                    p2_left: { hp: 800, maxHp: 800, x: 80, y: 140, type: 'princess', alive: true },
                    p2_right: { hp: 800, maxHp: 800, x: 320, y: 140, type: 'princess', alive: true }
                },
                troops: []
            }
        };
        socket.join(lobbyId);
        socket.emit('lobby_created', lobbies[lobbyId]);
        io.emit('update_lobby_list', Object.values(lobbies).filter(l => !l.isGameStarted && l.players.length < 2));
    });

    socket.on('join_lobby', ({ lobbyId, username }) => {
        const lobby = lobbies[lobbyId.toUpperCase()];
        if (!lobby) return socket.emit('join_error', 'Lobby não encontrado!');
        if (lobby.players.length >= 2) return socket.emit('join_error', 'Lobby cheio!');

        lobby.players.push({ id: socket.id, name: username, role: 'p2' });
        socket.join(lobby.id);
        lobby.isGameStarted = true;
        
        io.to(lobby.id).emit('game_start', lobby);
        io.emit('update_lobby_list', Object.values(lobbies).filter(l => !l.isGameStarted && l.players.length < 2));
    });

    socket.on('join_random', (username) => {
        const available = Object.values(lobbies).filter(l => !l.isGameStarted && l.players.length < 2);
        if (available.length > 0) {
            const lobby = available[Math.floor(Math.random() * available.length)];
            lobby.players.push({ id: socket.id, name: username, role: 'p2' });
            socket.join(lobby.id);
            lobby.isGameStarted = true;
            io.to(lobby.id).emit('game_start', lobby);
            io.emit('update_lobby_list', Object.values(lobbies).filter(l => !l.isGameStarted && l.players.length < 2));
        } else {
            socket.emit('join_error', 'Nenhum lobby disponível.');
        }
    });

    socket.on('leave_lobby', () => { handleDisconnectOrLeave(socket); });

    socket.on('spawn_troop', (data) => {
        const lobby = Object.values(lobbies).find(l => l.players.some(p => p.id === socket.id));
        if (!lobby || !lobby.isGameStarted) return;

        const player = lobby.players.find(p => p.id === socket.id);
        const role = player.role;
        const typeConfig = TROOP_TYPES[data.type];

        if (typeConfig && lobby.gameState.elixir[role] >= typeConfig.cost) {
            if (role === 'p1' && data.y < 320) return;
            if (role === 'p2' && data.y > 280) return;

            lobby.gameState.elixir[role] -= typeConfig.cost;
            lobby.gameState.troops.push({
                id: Math.random().toString(36).substr(2, 9),
                type: data.type,
                x: data.x,
                y: data.y,
                hp: typeConfig.hp,
                maxHp: typeConfig.maxHp,
                owner: role,
                speed: typeConfig.speed,
                damage: typeConfig.damage,
                range: typeConfig.range,
                size: typeConfig.size
            });
        }
    });

    socket.on('disconnect', () => { handleDisconnectOrLeave(socket); });
});

function handleDisconnectOrLeave(socket) {
    Object.keys(lobbies).forEach(lobbyId => {
        const lobby = lobbies[lobbyId];
        if (lobby.players.some(p => p.id === socket.id)) {
            socket.leave(lobbyId);
            io.to(lobbyId).emit('opponent_left', 'Conexão perdida com o oponente.');
            delete lobbies[lobbyId];
        }
    });
    io.emit('update_lobby_list', Object.values(lobbies).filter(l => !l.isGameStarted && l.players.length < 2));
}

// LOOP DE MOVIMENTAÇÃO E ATAQUE (30 FPS)
setInterval(() => {
    Object.keys(lobbies).forEach(lobbyId => {
        const lobby = lobbies[lobbyId];
        if (!lobby.isGameStarted) return;

        let state = lobby.gameState;

        if (state.elixir.p1 < 10) state.elixir.p1 += 0.04;
        if (state.elixir.p2 < 10) state.elixir.p2 += 0.04;

        state.troops.forEach((troop) => {
            const opp = troop.owner === 'p1' ? 'p2' : 'p1';

            // 1. Encontrar torre viva mais próxima
            let targets = [];
            if (state.towers[`${opp}_left`].alive) targets.push(state.towers[`${opp}_left`]);
            if (state.towers[`${opp}_right`].alive) targets.push(state.towers[`${opp}_right`]);
            if (state.towers[`${opp}_king`].alive) targets.push(state.towers[`${opp}_king`]);

            let primaryTarget = state.towers[`${opp}_king`];
            let minDistTower = Infinity;
            targets.forEach(t => {
                let d = Math.hypot(t.x - troop.x, t.y - troop.y);
                if (d < minDistTower) { minDistTower = d; primaryTarget = t; }
            });

            let targetX = primaryTarget.x;
            let targetY = primaryTarget.y;

            // 2. Inteligência das Pontes Corrigida (Sem travar!)
            if (troop.owner === 'p1' && troop.y > 315) {
                let bridgeX = targetX < 200 ? 80 : 320;
                if (Math.abs(troop.x - bridgeX) > 15) {
                    targetY = 330;
                    targetX = bridgeX;
                }
            } else if (troop.owner === 'p2' && troop.y < 285) {
                let bridgeX = targetX < 200 ? 80 : 320;
                if (Math.abs(troop.x - bridgeX) > 15) {
                    targetY = 270;
                    targetX = bridgeX;
                }
            }

            // 3. Buscar Tropa Inimiga por perto
            let closestEnemy = null;
            let minDistEnemy = Infinity;
            state.troops.forEach(other => {
                if (other.owner !== troop.owner) {
                    let d = Math.hypot(other.x - troop.x, other.y - troop.y);
                    if (d < minDistEnemy) { minDistEnemy = d; closestEnemy = other; }
                }
            });

            let currentDist = 0;
            if (closestEnemy && minDistEnemy < 120) {
                targetX = closestEnemy.x;
                targetY = closestEnemy.y;
                currentDist = minDistEnemy;
            } else {
                currentDist = Math.hypot(targetX - troop.x, targetY - troop.y);
            }

            // 4. Executar ataque ou mover
            if (closestEnemy && currentDist <= troop.range + closestEnemy.size) {
                closestEnemy.hp -= troop.damage / 15;
            } else if (!closestEnemy && currentDist <= troop.range + 25) {
                primaryTarget.hp -= troop.damage / 15;
                if (primaryTarget.hp <= 0) primaryTarget.alive = false;
            } else {
                let angle = Math.atan2(targetY - troop.y, targetX - troop.x);
                troop.x += Math.cos(angle) * troop.speed;
                troop.y += Math.sin(angle) * troop.speed;
            }
        });

        state.troops = state.troops.filter(t => t.hp > 0);

        if (!state.towers.p1_king.alive) {
            io.to(lobbyId).emit('game_over', 'Jogador Vermelho (Cima)');
            delete lobbies[lobbyId];
        } else if (!state.towers.p2_king.alive) {
            io.to(lobbyId).emit('game_over', 'Jogador Azul (Baixo)');
            delete lobbies[lobbyId];
        } else {
            io.to(lobbyId).emit('game_update', state);
        }
    });
}, 1000 / 30);

const PORT = process.env.PORT || 10000;
http.listen(PORT, () => console.log(`Servidor Ativo`));