const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { 
    cors: { origin: "*" },
    pingTimeout: 60000,
    pingInterval: 10000
});

app.use(express.static('public'));

let lobbies = {}; 

function generateLobbyId() {
    return Math.random().toString(36).substring(2, 7).toUpperCase();
}

const TROOP_TYPES = {
    gigante: { hp: 500, maxHp: 500, speed: 0.9, damage: 25, cost: 5, range: 22, size: 16 },
    arqueiro: { hp: 110, maxHp: 110, speed: 1.5, damage: 14, cost: 3, range: 95, size: 10 },
    goblin: { hp: 75, maxHp: 75, speed: 2.5, damage: 12, cost: 2, range: 15, size: 8 }
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
                    // P1 - Base Inferior (Azul)
                    p1_king: { hp: 1500, maxHp: 1500, x: 200, y: 540, type: 'king', alive: true },
                    p1_left: { hp: 1000, maxHp: 1000, x: 85, y: 450, type: 'princess', alive: true },
                    p1_right: { hp: 1000, maxHp: 1000, x: 315, y: 450, type: 'princess', alive: true },
                    // P2 - Base Superior (Vermelho)
                    p2_king: { hp: 1500, maxHp: 1500, x: 200, y: 60, type: 'king', alive: true },
                    p2_left: { hp: 1000, maxHp: 1000, x: 85, y: 150, type: 'princess', alive: true },
                    p2_right: { hp: 1000, maxHp: 1000, x: 315, y: 150, type: 'princess', alive: true }
                },
                troops: []
            }
        };
        socket.join(lobbyId);
        socket.emit('lobby_created', lobbies[lobbyId]);
        sendGlobalLobbyUpdate();
    });

    socket.on('join_lobby', ({ lobbyId, username }) => {
        const lobby = lobbies[lobbyId.toUpperCase()];
        if (!lobby) return socket.emit('join_error', 'Lobby não encontrado!');
        if (lobby.players.length >= 2) return socket.emit('join_error', 'Lobby cheio!');

        lobby.players.push({ id: socket.id, name: username, role: 'p2' });
        socket.join(lobby.id);
        lobby.isGameStarted = true;
        
        io.to(lobby.id).emit('game_start', lobby);
        sendGlobalLobbyUpdate();
    });

    socket.on('join_random', (username) => {
        const available = Object.values(lobbies).filter(l => !l.isGameStarted && l.players.length < 2);
        if (available.length > 0) {
            const lobby = available[Math.floor(Math.random() * available.length)];
            lobby.players.push({ id: socket.id, name: username, role: 'p2' });
            socket.join(lobby.id);
            lobby.isGameStarted = true;
            io.to(lobby.id).emit('game_start', lobby);
            sendGlobalLobbyUpdate();
        } else {
            socket.emit('join_error', 'Nenhum oponente esperando.');
        }
    });

    socket.on('spawn_troop', (data) => {
        const lobby = Object.values(lobbies).find(l => l.players.some(p => p.id === socket.id));
        if (!lobby || !lobby.isGameStarted) return;

        const player = lobby.players.find(p => p.id === socket.id);
        const role = player.role;
        const typeConfig = TROOP_TYPES[data.type];

        if (typeConfig && lobby.gameState.elixir[role] >= typeConfig.cost) {
            let spawnX = data.x;
            let spawnY = data.y;

            // CRUCIAL: Se for o Player 2, ele vê a tela invertida. Revertemos a coordenada pro servidor entender!
            if (role === 'p2') {
                spawnX = 400 - spawnX;
                spawnY = 600 - spawnY;
            }

            // Restrições de invocação (Não pode invocar no campo inimigo)
            if (role === 'p1' && spawnY < 310) return; 
            if (role === 'p2' && spawnY > 290) return; 

            lobby.gameState.elixir[role] -= typeConfig.cost;
            lobby.gameState.troops.push({
                id: Math.random().toString(36).substr(2, 9),
                type: data.type,
                x: spawnX,
                y: spawnY,
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

    socket.on('leave_lobby', () => { handleDisconnectOrLeave(socket); });
    socket.on('disconnect', () => { handleDisconnectOrLeave(socket); });
});

function handleDisconnectOrLeave(socket) {
    Object.keys(lobbies).forEach(lobbyId => {
        const lobby = lobbies[lobbyId];
        if (lobby.players.some(p => p.id === socket.id)) {
            socket.leave(lobbyId);
            io.to(lobbyId).emit('opponent_left', 'O oponente saiu ou desconectou.');
            delete lobbies[lobbyId];
        }
    });
    sendGlobalLobbyUpdate();
}

function sendGlobalLobbyUpdate() {
    const list = Object.values(lobbies).filter(l => !l.isGameStarted && l.players.length < 2);
    io.emit('update_lobby_list', list);
}

// LOOP DO JOGO - ENGINE ATUALIZADA
setInterval(() => {
    Object.keys(lobbies).forEach(lobbyId => {
        const lobby = lobbies[lobbyId];
        if (!lobby.isGameStarted) return;

        let state = lobby.gameState;

        // Elixir carregando perfeitamente sincronizado (fiel ao jogo original)
        if (state.elixir.p1 < 10) state.elixir.p1 += 0.012;
        if (state.elixir.p2 < 10) state.elixir.p2 += 0.012;

        state.troops.forEach((troop) => {
            const opp = troop.owner === 'p1' ? 'p2' : 'p1';

            // Alvos vivos
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

            // Roteamento inteligente pelas Pontes (Sem travar em quinas)
            const bridgeX = troop.x < 200 ? 80 : 320;
            if (troop.owner === 'p1' && troop.y > 310) {
                if (Math.abs(troop.x - bridgeX) > 15) { targetX = bridgeX; targetY = 325; }
            } else if (troop.owner === 'p2' && troop.y < 290) {
                if (Math.abs(troop.x - bridgeX) > 15) { targetX = bridgeX; targetY = 275; }
            }

            // Sistema de Visão/Ataque contra tropas inimigas
            let closestEnemy = null;
            let minDistEnemy = Infinity;
            state.troops.forEach(other => {
                if (other.owner !== troop.owner) {
                    let d = Math.hypot(other.x - troop.x, other.y - troop.y);
                    if (d < minDistEnemy) { minDistEnemy = d; closestEnemy = other; }
                }
            });

            let currentDist = 0;
            if (closestEnemy && minDistEnemy < 110) {
                targetX = closestEnemy.x; targetY = closestEnemy.y;
                currentDist = minDistEnemy;
            } else {
                currentDist = Math.hypot(targetX - troop.x, targetY - troop.y);
            }

            // Aplicação de Dano Fluido
            if (closestEnemy && currentDist <= troop.range + closestEnemy.size) {
                closestEnemy.hp -= troop.damage / 30;
            } else if (!closestEnemy && currentDist <= troop.range + 25) {
                primaryTarget.hp -= troop.damage / 30;
                if (primaryTarget.hp <= 0) primaryTarget.alive = false;
            } else {
                let angle = Math.atan2(targetY - troop.y, targetX - troop.x);
                troop.x += Math.cos(angle) * troop.speed;
                troop.y += Math.sin(angle) * troop.speed;
            }
        });

        state.troops = state.troops.filter(t => t.hp > 0);

        if (!state.towers.p1_king.alive) {
            io.to(lobbyId).emit('game_over', 'Jogador Vermelho');
            delete lobbies[lobbyId];
        } else if (!state.towers.p2_king.alive) {
            io.to(lobbyId).emit('game_over', 'Jogador Azul');
            delete lobbies[lobbyId];
        } else {
            io.to(lobbyId).emit('game_update', state);
        }
    });
}, 1000 / 30);

const PORT = process.env.PORT || 10000;
http.listen(PORT, () => console.log('Servidor operacional na porta ' + PORT));