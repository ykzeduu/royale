# ⚔️ Clash Web

Um jogo web multiplayer 1x1 em tempo real, inspirado no Clash Royale: elixir, cartas, torres e tropas que lutam sozinhas. Feito para você jogar com um amigo, cada um no seu computador/celular, cada um vendo o jogo do seu próprio ponto de vista (sempre com a sua torre embaixo).

## Como funciona (arquitetura)

- **Servidor** (`server.js`): Node.js + Express + Socket.io. É o servidor quem roda toda a simulação do jogo (elixir, movimento das tropas, ataques, torres) e manda o estado atual para os dois jogadores ~20x por segundo. Isso resolve o problema clássico de "cada um vê uma coisa diferente" — os dois clientes só desenham o que o servidor manda, ninguém manda estado próprio.
- **Cliente** (`public/`): HTML + Canvas + JS puro (sem frameworks), então não precisa de build step.
- **Salas**: ao criar uma sala, você recebe um código de 4 letras. Seu amigo entra com esse código e a partida começa automaticamente quando os dois estão na sala.

## Rodando localmente

```bash
npm install
npm start
```

Abra `http://localhost:3000` em duas abas (ou peça pra outra pessoa na mesma rede acessar `http://SEU_IP:3000`) para testar com dois jogadores.

## Subindo pro GitHub

```bash
cd clash-web
git init
git add .
git commit -m "Primeira versão do Clash Web"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/clash-web.git
git push -u origin main
```

(Crie o repositório vazio no GitHub antes, sem README/gitignore, pra evitar conflito.)

## Deploy no Render

1. Vá em [render.com](https://render.com) → **New +** → **Web Service**.
2. Conecte seu repositório do GitHub.
3. Configure:
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free está OK para jogar com um amigo.
4. Clique em **Create Web Service**. Em poucos minutos você recebe uma URL tipo `https://clash-web.onrender.com`.
5. Mande essa URL pro seu amigo. Um de vocês clica em **Criar Sala**, manda o código pro outro, e o outro clica em **Entrar**.

⚠️ **Importante sobre o plano gratuito do Render**: o serviço "dorme" depois de um tempo sem uso. O primeiro acesso do dia pode demorar uns 30-50 segundos para "acordar" o servidor — é normal, não é bug. Depois disso funciona normalmente.

## Como jogar

- Cada jogador tem 4 cartas na mão (de um baralho de 8) e um contador de elixir que enche sozinho (mais rápido nos últimos 60 segundos, igual "elixir duplo").
- Toque numa carta pra selecioná-la, depois toque no seu lado do campo (metade mais próxima de você) pra soltar a tropa lá. Feitiços (Bola de Fogo) podem ser jogados em qualquer lugar do mapa.
- As tropas andam sozinhas em direção às torres inimigas, atacando o que estiver no caminho.
- Destrua a torre do rei do adversário pra vencer na hora, ou tenha mais torres destruídas quando o tempo (3 minutos) acabar.

## Cartas disponíveis

| Carta | Custo | Estilo |
|---|---|---|
| Esqueletos 💀 | 1 | 3 unidades fracas e baratas |
| Cavaleiro ⚔️ | 3 | Tanque corpo a corpo |
| Arqueiras 🏹 | 3 | 2 unidades de longo alcance |
| Mosqueteira 🔫 | 4 | Longo alcance, dano alto |
| Mini P.E.K.K.A 🗡️ | 4 | Dano corpo a corpo altíssimo |
| Bola de Fogo 🔥 | 4 | Feitiço de área |
| Gigante 👊 | 5 | Tanque que só ataca torres |
| Bárbaros 🪓 | 5 | 4 unidades médias |

## Modos de jogo

- **Normal**: cada jogador monta seu próprio baralho de 8 cartas (escolhidas entre as 16 disponíveis) antes de criar/entrar na sala.
- **Escolha Rápida**: assim que os dois jogadores entram na sala, rola um "draft" ao vivo — 16 cartas são reveladas em 8 pares. A cada rodada um dos jogadores escolhe 1 das 2 cartas mostradas para o próprio baralho; a outra vai automaticamente para o baralho do adversário. Ao final, os dois baralhos de 8 cartas juntos somam as 16 cartas, sem repetição.

## As 16 cartas

| Carta | Custo | Estilo |
|---|---|---|
| Esqueletos 💀 | 1 | 3 unidades fracas e baratas |
| Goblins 👺 | 2 | 4 unidades rápidas (aguentam 2 hits de torre) |
| Cavaleiro ⚔️ | 3 | Tanque corpo a corpo |
| Arqueiras 🏹 | 3 | 2 unidades de longo alcance |
| Guardas Reais 🛡️ | 3 | 3 unidades resistentes |
| Servos Voadores 🧚 | 3 | 3 unidades voadoras |
| Flechas 🎯 | 3 | Feitiço de área grande, dano menor (bom contra enxames) |
| Mosqueteira 🔫 | 4 | Longo alcance, dano alto |
| Mini P.E.K.K.A 🗡️ | 4 | Dano corpo a corpo altíssimo |
| Bola de Fogo 🔥 | 4 | Feitiço de área, dano alto |
| Jaula de Goblin 🔒 | 4 | Isca: quando destruída, solta um Goblin Brutamontes |
| Dragão 🐉 | 4 | Voador, bafo de fogo em área |
| Corredor 🐗 | 4 | Pula o rio direto (mais devagar que correndo em campo), só ataca construções |
| Caçadores de Dragão 🦅 | 4 | 2 unidades anti-aéreas |
| Bárbaros 🪓 | 5 | 4 unidades médias |
| Bruxa 🧙 | 5 | Longo alcance + invoca 3 esqueletos periodicamente |

## Novidades desta versão

- **Torre do rei corrigida**: agora ela "acorda" assim que qualquer torre do seu lado toma dano (antes só acordava se ela mesma fosse atingida, o que a deixava passiva demais).
- **Jaula de Goblin** agora solta um Goblin Brutamontes (tropa única e resistente) em vez de 4 goblins pequenos.
- **Bruxa** agora invoca 3 esqueletos por vez.
- **Servos Voadores** substituem o Espírito de Gelo como nova carta voadora.
- **Caçadores de Dragão** substituem o Gigante — dupla anti-aérea.
- **Goblins** com mais vida (aguentam 2 hits de torre antes de morrer).
- **Dragão**: o ataque à distância agora usa uma animação própria de bafo de fogo (uma versão menor da Bola de Fogo saindo da boca dele).
- **Corredor** (antes "Hogrider"): ganhou uma animação de pulo ao atravessar o rio, e fica mais lento nesse trecho do que correndo em campo aberto.

- **Lobby de baralho**: agora dá pra escolher entre 16 cartas e montar seu baralho de 8 antes de jogar (modo Normal), ou fazer um draft ao vivo com seu amigo (modo Escolha Rápida).
- **8 cartas novas**: Espírito de Gelo, Goblins, Guardas Reais, Flechas, Jaula de Goblin, Dragão (voador), Hogrider (ignora a ponte) e Bruxa (invoca esqueletos).
- **Alcance corrigido**: Arqueiras, Mosqueteira e Bruxa agora têm alcance menor que o das torres — antes conseguiam atacar de uma distância em que a torre não conseguia revidar; agora sempre rola troca de tiro justa.

- **Contagem regressiva** de 5 segundos antes da partida começar (estilo lançamento de foguete).
- **Prorrogação (morte súbita)**: se o placar de torres estiver empatado quando os 3 minutos acabarem, tem mais 60s de elixir em dobro — a primeira torre destruída nesse período vence na hora. Se ninguém destruir nada, quem tiver mais HP total nas torres vence; se ainda empatar, é empate mesmo.
- **Projéteis visuais**: flechas/tiros de Arqueiras, Mosqueteira e das torres agora "viajam" até o alvo.
- **Bola de Fogo caindo do céu**: o feitiço agora cai visualmente até o ponto onde foi jogado e explode lá.
- **Tropas com animação**: balanço leve ao andar/ficar paradas e um "pulo" no momento do ataque — tudo gerado por código (sem sprites prontos).
- **Texturas processuais**: grama, madeira das pontes e água com ondulação, todas desenhadas via canvas.
- **Velocidade das tropas reduzida em ~10%** para um ritmo mais tranquilo.
- **Tela de vitória com estrelas**: mostra quantas torres você destruiu (0 a 3 estrelas) e quantas o adversário destruiu.

## Personalizando / expandindo

- Novas cartas: edite `public/cards.js` (o mesmo arquivo é usado pelo servidor e pelo cliente).
- Balanceamento de torres/elixir/tempo de partida: `public/constants.js`.
- Toda a lógica de combate e movimento das tropas está em `server.js`, nas funções `tick`, `updateTroop` e `nextWaypoint`.

## Possíveis melhorias futuras

- Reconexão automática se a internet cair no meio da partida.
- Fila de espera / matchmaking em vez de código de sala.
- Tropas voadoras e mais feitiços.
- Efeitos sonoros e animações de ataque.
