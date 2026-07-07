const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: "*" } });

app.use(express.static('public'));

let lobbies = {}; 

function generateLobbyId() {
    return Math.random().toString(36).substring(2, 7).toUpperCase();
}

// Configurações dos tipos de tropas
const TROOP_TYPES = {
    gigante: { hp: 300, speed: 1.2, damage: 15, cost: 5, range: 25, color_p1: '#00D2FF', color_p2: '#FF3D00', size: 18 },
    arqueiro: { hp: 90, speed: 1.8, damage: 10, cost: 3, range: 80, color_p1: '#00FFFF', color_p2: '#FF00E4', size: 12 },
    goblin: { hp: 60, speed: 2.8, damage: 8, cost: 2, range: 20, color_p1: '#00FF66', color_p2: '#FFE600', size: 10 }
};

io.on('connection', (socket) => {
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
                    p1: { hp: 1000, maxHp: 1000, x: 200, y: 550 },
                    p2: { hp: 1000, maxHp: 1000, x: 200, y: 50 }
                },
                troops: []
            }
        };
        socket.join(lobbyId);
        socket.emit('lobby_created', lobbies[lobbyId]);
        updateAllLobbyLists();
    });

    socket.on('join_lobby', ({ lobbyId, username }) => {
        const lobby = lobbies[lobbyId.toUpperCase()];
        if (!lobby) return socket.emit('join_error', 'Lobby não encontrado!');
        if (lobby.players.length >= 2) return socket.emit('join_error', 'Lobby está cheio!');

        lobby.players.push({ id: socket.id, name: username, role: 'p2' });
        socket.join(lobby.id);
        lobby.isGameStarted = true;
        io.to(lobby.id).emit('game_start', lobby);
        updateAllLobbyLists();
    });

    socket.on('join_random', (username) => {
        const available = Object.values(lobbies).filter(l => !l.isGameStarted && l.players.length < 2);
        if (available.length > 0) {
            const lobby = available[Math.floor(Math.random() * available.length)];
            lobby.players.push({ id: socket.id, name: username, role: 'p2' });
            socket.join(lobby.id);
            lobby.isGameStarted = true;
            io.to(lobby.id).emit('game_start', lobby);
            updateAllLobbyLists();
        } else {
            socket.emit('join_error', 'Nenhum lobby público disponível no momento.');
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
            // Restrição de área de Spawn (P1 spawna na metade de baixo, P2 na de cima)
            if (role === 'p1' && data.y < 300) return;
            if (role === 'p2' && data.y > 300) return;

            lobby.gameState.elixir[role] -= typeConfig.cost;
            lobby.gameState.troops.push({
                id: Math.random().toString(36).substr(2, 9),
                type: data.type,
                x: data.x,
                y: data.y,
                hp: typeConfig.hp,
                maxHp: typeConfig.hp,
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
            io.to(lobbyId).emit('opponent_left', 'Seu oponente abandonou a partida.');
            delete lobbies[lobbyId];
        }
    });
    updateAllLobbyLists();
}

function updateAllLobbyLists() {
    const list = Object.values(lobbies).filter(l => !l.isGameStarted && l.players.length < 2);
    io.emit('update_lobby_list', list);
}

// GAME LOOP PRINCIPAL (30 FPS)
setInterval(() => {
    Object.keys(lobbies).forEach(lobbyId => {
        const lobby = lobbies[lobbyId];
        if (!lobby.isGameStarted) return;

        let state = lobby.gameState;

        // Elixir regenera até o limite de 10
        if (state.elixir.p1 < 10) state.elixir.p1 += 0.04;
        if (state.elixir.p2 < 10) state.elixir.p2 += 0.04;

        // Processamento das tropas
        state.troops.forEach((troop, index) => {
            const targetTowerRole = troop.owner === 'p1' ? 'p2' : 'p1';
            const targetTower = state.towers[targetTowerRole];

            // Alvo padrão é a torre inimiga
            let targetX = targetTower.x;
            let targetY = targetTower.y;

            // IA de desvio das Pontes (Simulando o Clash Royale para não cruzar o rio voando)
            if (troop.owner === 'p1' && troop.y > 280 && troop.y < 340) {
                targetY = 300; // Alinha com a altura do rio/ponte
                targetX = troop.x < 200 ? 80 : 320; // Escolhe a ponte mais próxima (esquerda ou direita)
            } else if (troop.owner === 'p2' && troop.y < 320 && troop.y > 260) {
                targetY = 300;
                targetX = troop.x < 200 ? 80 : 320;
            }

            // Verifica se tem inimigo perto para atacar
            let closestEnemy = null;
            let minDist = Infinity;
            state.troops.forEach(other => {
                if (other.owner !== troop.owner) {
                    let d = Math.hypot(other.x - troop.x, other.y - troop.y);
                    if (d < minDist) { minDist = d; closestEnemy = other; }
                }
            });

            // Se tiver inimigo na visão, foca nele
            if (closestEnemy && minDist < 150) {
                targetX = closestEnemy.x;
                targetY = closestEnemy.y;
            } else {
                minDist = Math.hypot(targetTower.x - troop.x, targetTower.y - troop.y);
            }

            // Distância atual para o alvo focado (Inimigo ou Torre/Ponte)
            let currentTargetDist = Math.hypot(targetX - troop.x, targetY - troop.y);

            // Se estiver no alcance do alvo, ATACA. Caso contrário, ANDA.
            if (closestEnemy && minDist <= troop.range) {
                closestEnemy.hp -= troop.damage / 15; // Dano por frame balanceado
            } else if (!closestEnemy && minDist <= troop.range + 20) {
                targetTower.hp -= troop.damage / 15;
            } else {
                // Movimentação em direção ao alvo
                let angle = Math.atan2(targetY - troop.y, targetX - troop.x);
                troop.x += Math.cos(angle) * troop.speed;
                troop.y += Math.sin(angle) * troop.speed;
            }
        });

        // Remove tropas mortas
        state.troops = state.troops.filter(t => t.hp > 0);

        // Checa Fim de Jogo
        if (state.towers.p1.hp <= 0 || state.towers.p2.hp <= 0) {
            io.to(lobbyId).emit('game_over', state.towers.p1.hp <= 0 ? 'Player 2 (Vermelho)' : 'Player 1 (Azul)');
            delete lobbies[lobbyId];
        } else {
            io.to(lobbyId).emit('game_update', state);
        }
    });
}, 1000 / 30);

const PORT = process.env.PORT || 10000;
http.listen(PORT, () => console.log(`Servidor rodando`));