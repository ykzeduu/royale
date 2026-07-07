const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: "*" } });

app.use(express.static('public'));

// Banco de dados em memória para os lobbies
let lobbies = {}; 

// Função auxiliar para gerar ID do Lobby (Ex: U83J4)
function generateLobbyId() {
    return Math.random().toString(36).substring(2, 7).toUpperCase();
}

io.on('connection', (socket) => {
    console.log(`Conectado: ${socket.id}`);

    // Envia a lista de lobbies disponíveis assim que o cliente conecta
    socket.emit('update_lobby_list', Object.values(lobbies).filter(l => !l.isGameStarted && l.players.length < 2));

    // 1. CRIAR LOBBY
    socket.on('create_lobby', (username) => {
        const lobbyId = generateLobbyId();
        lobbies[lobbyId] = {
            id: lobbyId,
            creator: username,
            players: [{ id: socket.id, name: username, role: 'p1' }],
            isGameStarted: false,
            gameState: { elixir: { p1: 0, p2: 0 }, troops: [] }
        };

        socket.join(lobbyId);
        socket.emit('lobby_created', lobbies[lobbyId]);
        updateAllLobbyLists();
    });

    // 2. ENTRAR EM LOBBY (Por ID ou clicando na lista)
    socket.on('join_lobby', ({ lobbyId, username }) => {
        const lobby = lobbies[lobbyId.toUpperCase()];

        if (!lobby) {
            return socket.emit('join_error', 'Lobby não encontrado!');
        }
        if (lobby.players.length >= 2) {
            return socket.emit('join_error', 'Lobby está cheio!');
        }

        lobby.players.push({ id: socket.id, name: username, role: 'p2' });
        socket.join(lobby.id);
        
        // Avisa a sala que o jogo vai começar
        lobby.isGameStarted = true;
        io.to(lobby.id).emit('game_start', lobby);
        
        updateAllLobbyLists();
    });

    // 3. ENTRAR EM LOBBY ALEATÓRIO
    socket.on('join_random', (username) => {
        const availableLobbies = Object.values(lobbies).filter(l => !l.isGameStarted && l.players.length < 2);
        
        if (availableLobbies.length > 0) {
            const randomLobby = availableLobbies[Math.floor(Math.random() * availableLobbies.length)];
            randomLobby.players.push({ id: socket.id, name: username, role: 'p2' });
            socket.join(randomLobby.id);
            randomLobby.isGameStarted = true;
            io.to(randomLobby.id).emit('game_start', randomLobby);
            updateAllLobbyLists();
        } else {
            socket.emit('join_error', 'Nenhum lobby público disponível no momento. Crie um!');
        }
    });

    // 4. ABANDONAR / SAIR DO LOBBY OU PARTIDA
    socket.on('leave_lobby', () => {
        handleDisconnectOrLeave(socket);
    });

    // 5. ENVIAR TROPA (Lógica do jogo adaptada por sala)
    socket.on('spawn_troop', (data) => {
        const lobby = Object.values(lobbies).find(l => l.players.some(p => p.id === socket.id));
        if (!lobby || !lobby.isGameStarted) return;

        const player = lobby.players.find(p => p.id === socket.id);
        const role = player.role;

        if (lobby.gameState.elixir[role] >= 3) {
            lobby.gameState.elixir[role] -= 3;
            lobby.gameState.troops.push({
                id: Math.random().toString(36).substr(2, 9),
                x: data.x,
                y: data.y,
                owner: role
            });
        }
    });

    socket.on('disconnect', () => {
        handleDisconnectOrLeave(socket);
    });
});

// Remove jogador e limpa a sala
function handleDisconnectOrLeave(socket) {
    Object.keys(lobbies).forEach(lobbyId => {
        const lobby = lobbies[lobbyId];
        const playerIndex = lobby.players.findIndex(p => p.id === socket.id);

        if (playerIndex !== -1) {
            socket.leave(lobbyId);
            // Se o jogo já tinha começado ou o criador saiu, cancela tudo e avisa o outro
            io.to(lobbyId).emit('opponent_left', 'O outro jogador abandonou a sessão.');
            delete lobbies[lobbyId];
        }
    });
    updateAllLobbyLists();
}

function updateAllLobbyLists() {
    const list = Object.values(lobbies).filter(l => !l.isGameStarted && l.players.length < 2);
    io.emit('update_lobby_list', list);
}

// Loop dos jogos ativos (30 FPS)
setInterval(() => {
    Object.keys(lobbies).forEach(lobbyId => {
        const lobby = lobbies[lobbyId];
        if (!lobby.isGameStarted) return;

        let state = lobby.gameState;
        if (state.elixir.p1 < 10) state.elixir.p1 += 0.03;
        if (state.elixir.p2 < 10) state.elixir.p2 += 0.03;

        state.troops.forEach(troop => {
            if (troop.owner === 'p1') troop.y -= 2;
            else troop.y += 2;
        });

        io.to(lobbyId).emit('game_update', state);
    });
}, 1000 / 30);

const PORT = process.env.PORT || 10000;
http.listen(PORT, () => console.log(`Rodando na porta ${PORT}`));