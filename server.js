const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: { origin: "*" } // Permite conexões de fora (essencial para o Render)
});

// Serve os arquivos da pasta 'public' (onde vai ficar nosso jogo)
app.use(express.static('public'));

let players = [];
let gameState = {
    elixir: { p1: 0, p2: 0 },
    troops: [] // Guardará as tropas em campo: { id, x, y, owner }
};

io.on('connection', (socket) => {
    console.log(`Usuário conectado: ${socket.id}`);

    // Limite de 2 jogadores para o teste
    if (players.length < 2) {
        players.push(socket.id);
        socket.emit('player_assignment', players.length); // Diz se é Player 1 ou 2
    } else {
        socket.emit('spectator');
    }

    // Quando um jogador joga uma carta
    socket.on('spawn_troop', (data) => {
        const playerIndex = players.indexOf(socket.id);
        const role = playerIndex === 0 ? 'p1' : 'p2';

        // Valida se tem elixir (custo fixo de 3 para o teste)
        if (gameState.elixir[role] >= 3) {
            gameState.elixir[role] -= 3;
            
            gameState.troops.push({
                id: Math.random().toString(36).substr(2, 9),
                x: data.x,
                y: data.y,
                owner: role
            });
        }
    });

    socket.on('disconnect', () => {
        players = players.filter(id => id !== socket.id);
        console.log(`Usuário desconectado: ${socket.id}`);
    });
});

// Game Loop: Atualiza o estado do jogo 30 vezes por segundo (30 FPS)
setInterval(() => {
    // Regenera elixir até o limite de 10
    if (gameState.elixir.p1 < 10) gameState.elixir.p1 += 0.03;
    if (gameState.elixir.p2 < 10) gameState.elixir.p2 += 0.03;

    // Movimenta as tropas na vertical (simulando avanço para a torre)
    gameState.troops.forEach(troop => {
        if (troop.owner === 'p1') {
            troop.y -= 2; // P1 avança para cima
        } else {
            troop.y += 2; // P2 avança para baixo
        }
    });

    // Envia o estado atualizado para todo mundo
    io.emit('game_update', gameState);
}, 1000 / 30);

// Substitua a linha antiga por esta:
const PORT = process.env.PORT || 10000; // O Render costuma usar a 10000 por padrão
http.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});