"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoomManager = void 0;
class RoomManager {
    io;
    prisma;
    rooms = new Map();
    constructor(io, prisma) {
        this.io = io;
        this.prisma = prisma;
        this.setupListeners();
    }
    setupListeners() {
        this.io.on('connection', (socket) => {
            console.log('Client connected:', socket.id);
            socket.on('createRoom', (data, callback) => {
                const hostId = this.createRoom(socket, data.roomCode);
                if (callback)
                    callback({ success: true, roomCode: data.roomCode, hostId });
            });
            socket.on('joinRoom', (data, callback) => {
                const result = this.joinRoom(socket, data.roomCode, data.playerName);
                if (callback)
                    callback(result);
            });
            socket.on('reconnectHost', (data, callback) => {
                const result = this.reconnectHost(socket, data.roomCode, data.hostId);
                if (callback)
                    callback(result);
            });
            socket.on('reconnectPlayer', (data, callback) => {
                const result = this.reconnectPlayer(socket, data.roomCode, data.playerId);
                if (callback)
                    callback(result);
            });
            socket.on('submitWager', (data, callback) => {
                const success = this.submitWager(socket, data.roomCode, data.wager);
                if (callback)
                    callback({ success });
            });
            socket.on('submitAnswer', (data, callback) => {
                const success = this.submitAnswer(socket, data.roomCode, data.answer);
                if (callback)
                    callback({ success });
            });
            socket.on('startGame', async (data, callback) => {
                const success = await this.startGame(socket, data.roomCode, data.mode, data.numQuestions, data.selectedCategories);
                if (callback)
                    callback({ success });
            });
            socket.on('returnToLobby', (data, callback) => {
                const success = this.returnToLobby(socket, data.roomCode);
                if (callback)
                    callback({ success });
            });
            socket.on('kickPlayer', (data, callback) => {
                const success = this.kickPlayer(socket, data.roomCode, data.playerId);
                if (callback)
                    callback({ success });
            });
            socket.on('requestCategories', async (callback) => {
                try {
                    const cats = await this.prisma.category.findMany({
                        include: { _count: { select: { Questions: true } } }
                    });
                    const availableCategories = cats.map(c => ({
                        name: c.name,
                        count: c._count.Questions
                    }));
                    if (callback)
                        callback({ success: true, availableCategories });
                }
                catch (e) {
                    console.error("Failed to fetch categories:", e);
                    if (callback)
                        callback({ success: false, availableCategories: [] });
                }
            });
            socket.on('disconnect', () => {
                console.log('Client disconnected:', socket.id);
            });
        });
    }
    createRoom(socket, roomCode) {
        const hostId = Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
        this.rooms.set(roomCode, {
            roomCode,
            state: 'LOBBY',
            players: {},
            currentQuestionId: null,
            hostSocketId: socket.id,
            hostId: hostId,
            correctAnswers: [],
            questionQueue: [],
            currentQuestionIndex: 0,
            mode: 'STANDARD',
            timerState: null,
            currentMultiplier: 2.0,
            currentMinWagerPercentage: 10,
            totalQuestions: 0,
            survivorRound: 0
        });
        socket.join(roomCode);
        console.log(`Room created: ${roomCode} by ${socket.id}`);
        return hostId;
    }
    kickPlayer(socket, roomCode, playerId) {
        const room = this.rooms.get(roomCode);
        if (!room || room.hostSocketId !== socket.id || room.state !== 'LOBBY')
            return false;
        const player = room.players[playerId];
        if (player) {
            this.io.to(player.socketId).emit('kicked');
            delete room.players[playerId];
            this.io.to(roomCode).emit('playerKicked', { playerId });
            return true;
        }
        return false;
    }
    joinRoom(socket, roomCode, playerName) {
        const room = this.rooms.get(roomCode);
        if (!room)
            return { success: false };
        if (room.state !== 'LOBBY') {
            socket.join(roomCode);
            return {
                success: true,
                spectator: true,
                roomState: {
                    state: room.state,
                    players: room.players,
                    currentMultiplier: room.currentMultiplier,
                    currentMinWagerPercentage: room.currentMinWagerPercentage,
                    totalQuestions: room.totalQuestions,
                    survivorRound: room.survivorRound,
                    questionQueue: room.questionQueue,
                    currentQuestionIndex: room.currentQuestionIndex
                }
            };
        }
        const playerId = Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
        const player = {
            id: playerId,
            socketId: socket.id,
            name: playerName,
            score: 1000,
            currentWager: 0,
            isCorrect: null,
            hasWagered: false,
            hasAnswered: false,
            isAllIn: false
        };
        room.players[playerId] = player;
        socket.join(roomCode);
        this.io.to(roomCode).emit('playerJoined', { player });
        return { success: true, playerId };
    }
    reconnectHost(socket, roomCode, hostId) {
        const room = this.rooms.get(roomCode);
        if (!room || room.hostId !== hostId)
            return { success: false };
        room.hostSocketId = socket.id;
        socket.join(roomCode);
        return {
            success: true,
            roomState: {
                state: room.state,
                players: room.players,
                questionQueue: room.questionQueue,
                currentQuestionIndex: room.currentQuestionIndex,
                mode: room.mode,
                currentMultiplier: room.currentMultiplier,
                currentMinWagerPercentage: room.currentMinWagerPercentage,
                totalQuestions: room.totalQuestions,
                survivorRound: room.survivorRound
            }
        };
    }
    reconnectPlayer(socket, roomCode, playerId) {
        const room = this.rooms.get(roomCode);
        if (!room)
            return { success: false };
        const player = room.players[playerId];
        if (!player)
            return { success: false };
        player.socketId = socket.id;
        socket.join(roomCode);
        return {
            success: true,
            roomState: {
                state: room.state,
                players: room.players,
                currentMultiplier: room.currentMultiplier,
                currentMinWagerPercentage: room.currentMinWagerPercentage,
                totalQuestions: room.totalQuestions,
                survivorRound: room.survivorRound
            }
        };
    }
    async startGame(socket, roomCode, mode, numQuestions, selectedCategories = []) {
        const room = this.rooms.get(roomCode);
        if (!room || room.hostSocketId !== socket.id)
            return false;
        // Reset correct answers array on start explicitly just in case
        room.correctAnswers = [];
        // Build Where clause for Categories
        const whereClause = selectedCategories.length > 0
            ? { category: { name: { in: selectedCategories } } }
            : {};
        // Fetch questions from DB
        const questions = await this.prisma.question.findMany({
            where: whereClause,
            include: { category: true, globalStats: true }
        });
        // Shuffle
        const shuffled = questions.sort(() => 0.5 - Math.random());
        room.mode = mode;
        room.survivorRound = 0;
        if (mode === 'SURVIVOR') {
            room.questionQueue = shuffled;
            room.totalQuestions = 0; // Infinity conceptually
        }
        else {
            room.questionQueue = shuffled.slice(0, numQuestions > 0 ? numQuestions : 5);
            room.totalQuestions = numQuestions > 0 ? numQuestions : 5;
        }
        room.currentQuestionIndex = 0;
        void this.startNextQuestion(roomCode);
        return true;
    }
    returnToLobby(socket, roomCode) {
        const room = this.rooms.get(roomCode);
        if (!room || room.hostSocketId !== socket.id)
            return false;
        if (room.timerState)
            clearTimeout(room.timerState);
        room.state = 'LOBBY';
        room.currentQuestionIndex = 0;
        room.correctAnswers = [];
        room.questionQueue = [];
        room.totalQuestions = 0;
        room.survivorRound = 0;
        for (const playerId in room.players) {
            const player = room.players[playerId];
            player.score = 1000;
            player.isCorrect = null;
            player.currentWager = 0;
            player.hasWagered = false;
            player.hasAnswered = false;
            player.isAllIn = false;
        }
        this.io.to(roomCode).emit('stateChanged', {
            newState: 'LOBBY',
            players: room.players
        });
        return true;
    }
    async startNextQuestion(roomCode) {
        const room = this.rooms.get(roomCode);
        if (!room)
            return;
        if (room.timerState)
            clearTimeout(room.timerState);
        // Check active players for survivor mode AND standard mode
        const activePlayers = Object.values(room.players).filter(p => p.score > 0);
        // If NO ONE has a score > 0, end game immediately to prevent empty loops
        if (activePlayers.length === 0) {
            this.endGame(roomCode);
            return;
        }
        const totalPlayers = Object.keys(room.players).length;
        // In multiplayer, if everyone else bankrupts, the last person standing wins instantly
        const isMultiplayerWinner = totalPlayers > 1 && activePlayers.length <= 1;
        if (isMultiplayerWinner || (room.mode === 'SURVIVOR' && activePlayers.length === 0)) {
            this.endGame(roomCode);
            return;
        }
        if (room.currentQuestionIndex >= room.questionQueue.length) {
            if (room.mode === 'SURVIVOR') {
                const questions = await this.prisma.question.findMany({ include: { category: true, globalStats: true } });
                room.questionQueue = questions.sort(() => 0.5 - Math.random());
                room.currentQuestionIndex = 0;
            }
            else {
                this.endGame(roomCode);
                return;
            }
        }
        const question = room.questionQueue[room.currentQuestionIndex];
        room.currentQuestionId = question.id;
        // Volatility Formula Mock
        const multVal = question.globalStats ? Math.max(1.2, 3 - (question.globalStats.totalCorrect / question.globalStats.totalAttempts) * 2) : 2.0;
        const mult = Number(multVal.toFixed(1));
        room.currentMultiplier = mult;
        // Base standard mode minimum percentage wager limit
        room.currentMinWagerPercentage = Math.min(100, Math.max(1, Math.floor(50 / mult)));
        let survivorFloorAmount = 0;
        if (room.mode === 'SURVIVOR') {
            room.survivorRound++;
            // Calculate absolute floor based on current leader
            const leaderScore = Math.max(1, ...activePlayers.map(p => p.score));
            let floorPct = 15;
            if (room.survivorRound >= 10)
                floorPct = 60;
            else if (room.survivorRound >= 7)
                floorPct = 40;
            else if (room.survivorRound >= 4)
                floorPct = 25;
            survivorFloorAmount = Math.floor(leaderScore * (floorPct / 100));
            // Instant Elimination: Squeeze out players who cannot afford the floor
            for (const p of activePlayers) {
                if (p.score < survivorFloorAmount) {
                    p.score = 0; // Bankrupted by the rising tide
                }
            }
        }
        // Re-filter active players after the rising tide elimination sweep
        const survivingPlayers = Object.values(room.players).filter(p => p.score > 0);
        // Check if the floor sweep just ended the game
        if (survivingPlayers.length === 0 || (totalPlayers > 1 && survivingPlayers.length === 1)) {
            this.endGame(roomCode);
            return;
        }
        room.state = 'CATEGORY_REVEAL';
        this.io.to(roomCode).emit('stateChanged', {
            newState: 'CATEGORY_REVEAL',
            currentQuestionIndex: room.currentQuestionIndex,
            totalQuestions: room.totalQuestions,
            survivorRound: room.survivorRound,
            survivorFloorAmount: survivorFloorAmount,
            players: room.players, // Sync the new bankruptcies
            questionData: {
                category: question.category.name,
                multiplier: mult
            }
        });
        // 5s to reveal category
        room.timerState = setTimeout(() => {
            this.advanceToWagerPeriod(roomCode);
        }, 5000);
    }
    advanceToWagerPeriod(roomCode) {
        const room = this.rooms.get(roomCode);
        if (!room)
            return;
        room.state = 'WAGER_PERIOD';
        const endTime = Date.now() + 15000;
        this.io.to(roomCode).emit('stateChanged', { newState: 'WAGER_PERIOD', minWagerPercentage: room.currentMinWagerPercentage, endTime });
        // 15s to wager
        room.timerState = setTimeout(() => {
            this.advanceToQuestionLive(roomCode);
        }, 15000);
    }
    advanceToQuestionLive(roomCode) {
        const room = this.rooms.get(roomCode);
        if (!room)
            return;
        if (room.timerState)
            clearTimeout(room.timerState);
        // Auto-wager for players who failed to submit
        for (const playerId in room.players) {
            const p = room.players[playerId];
            if (p.score > 0 && !p.hasWagered) {
                const minWager = Math.max(1, Math.floor(p.score * (room.currentMinWagerPercentage / 100)));
                p.currentWager = minWager;
                p.hasWagered = true;
                this.io.to(room.hostSocketId).emit('playerWagered', { playerId: p.id, wager: minWager });
            }
        }
        const question = room.questionQueue[room.currentQuestionIndex];
        room.state = 'QUESTION_LIVE';
        // Shuffle options dynamically using the array we seeded
        const shuffledOptions = [...(question.options || [])].sort(() => 0.5 - Math.random());
        const endTime = Date.now() + 15000;
        this.io.to(roomCode).emit('stateChanged', {
            newState: 'QUESTION_LIVE',
            questionText: question.text,
            options: shuffledOptions,
            endTime
        });
        // 15s to answer
        room.timerState = setTimeout(() => {
            this.calculateResults(roomCode);
        }, 15000);
    }
    endGame(roomCode) {
        const room = this.rooms.get(roomCode);
        if (!room)
            return;
        room.state = 'GAME_OVER';
        this.io.to(roomCode).emit('stateChanged', { newState: 'GAME_OVER', players: room.players });
    }
    submitWager(socket, roomCode, wager) {
        const room = this.rooms.get(roomCode);
        if (!room || room.state !== 'WAGER_PERIOD')
            return false;
        const player = Object.values(room.players).find(p => p.socketId === socket.id);
        if (!player)
            return false;
        const minWager = Math.max(1, Math.floor(player.score * (room.currentMinWagerPercentage / 100)));
        // Allow normal wagers up to score, OR exactly score * 2 for ALL-IN
        const isAllIn = wager === player.score * 2;
        if (player.score > 0 && (wager < minWager || (wager > player.score && !isAllIn)))
            return false;
        player.currentWager = wager;
        player.isAllIn = isAllIn;
        player.hasWagered = true;
        this.io.to(room.hostSocketId).emit('playerWagered', { playerId: player.id, wager, isAllIn });
        // Fast forward if everyone active wagered
        const activePlayers = Object.values(room.players).filter(p => p.score > 0);
        if (activePlayers.every(p => p.hasWagered)) {
            this.advanceToQuestionLive(roomCode);
        }
        return true;
    }
    submitAnswer(socket, roomCode, answer) {
        const room = this.rooms.get(roomCode);
        if (!room || room.state !== 'QUESTION_LIVE')
            return false;
        const player = Object.values(room.players).find(p => p.socketId === socket.id);
        if (!player)
            return false;
        const question = room.questionQueue[room.currentQuestionIndex];
        const isCorrect = answer === question.answer;
        player.isCorrect = isCorrect;
        player.hasAnswered = true;
        if (isCorrect && !room.correctAnswers.includes(player.id)) {
            room.correctAnswers.push(player.id);
        }
        this.io.to(room.hostSocketId).emit('playerAnswered', { playerId: player.id });
        // Fast forward if everyone active answered
        const activePlayers = Object.values(room.players).filter(p => p.score > 0);
        if (activePlayers.every(p => p.hasAnswered)) {
            this.calculateResults(roomCode);
        }
        return true;
    }
    calculateResults(roomCode) {
        const room = this.rooms.get(roomCode);
        if (!room)
            return;
        if (room.timerState)
            clearTimeout(room.timerState);
        room.state = 'RESULTS';
        const question = room.questionQueue[room.currentQuestionIndex];
        const options = question.options || [];
        // Auto-answer for players who wagered but failed to select an option
        for (const playerId in room.players) {
            const p = room.players[playerId];
            if (p.score > 0 && p.currentWager > 0 && !p.hasAnswered) {
                const randomOption = options[Math.floor(Math.random() * options.length)];
                p.isCorrect = randomOption === question.answer;
                p.hasAnswered = true;
                if (p.isCorrect && !room.correctAnswers.includes(p.id)) {
                    room.correctAnswers.push(p.id);
                }
                this.io.to(room.hostSocketId).emit('playerAnswered', { playerId: p.id });
            }
        }
        // Slayer Bonus multiplier
        const activePlayers = Object.values(room.players).filter(p => p.score > 0);
        const slayerBonus = (activePlayers.length > 2 && room.correctAnswers.length === 1) ? 2 : 1;
        const volatilityMultiplier = question.globalStats ? Math.max(1.2, 3 - (question.globalStats.totalCorrect / question.globalStats.totalAttempts) * 2) : 2.0;
        for (const playerId in room.players) {
            const player = room.players[playerId];
            if (player.score <= 0)
                continue; // skipped playing
            if (player.isCorrect) {
                // currentWager already contains score*2 if all-in
                player.score += (player.currentWager * volatilityMultiplier * slayerBonus);
            }
            else if (player.isCorrect === false) {
                player.score -= player.currentWager;
            }
            player.score = Math.floor(player.score); // keep clean integers
        }
        const slayerBonusWinner = slayerBonus > 1 ? room.correctAnswers[0] : null;
        this.io.to(roomCode).emit('resultsCalculated', {
            players: room.players,
            slayerBonusApplied: slayerBonus > 1,
            slayerBonusWinner,
            correctAnswer: question.answer
        });
        // Reset state for next round
        room.correctAnswers = [];
        for (const playerId in room.players) {
            room.players[playerId].isCorrect = null;
            room.players[playerId].currentWager = 0;
            room.players[playerId].hasWagered = false;
            room.players[playerId].hasAnswered = false;
            room.players[playerId].isAllIn = false;
        }
        room.currentQuestionIndex++;
        const totalPlayersCount = Object.keys(room.players).length;
        const activePlayersAfter = Object.values(room.players).filter(p => p.score > 0);
        const isMultiplayerWinner = totalPlayersCount > 1 && activePlayersAfter.length <= 1;
        const isSurvivorOver = room.mode === 'SURVIVOR' && (isMultiplayerWinner || activePlayersAfter.length === 0);
        const isStandardOverEarly = room.mode !== 'SURVIVOR' && (isMultiplayerWinner || activePlayersAfter.length === 0);
        const isStandardFinished = room.mode !== 'SURVIVOR' && room.currentQuestionIndex >= room.questionQueue.length;
        const shouldEndGame = isSurvivorOver || isStandardOverEarly || isStandardFinished;
        // Give them 7s to read the results, UNLESS everyone is eliminated, then maybe just jump to GAME_OVER?
        // Actually, 7 seconds to show the final negative delta is fine, but we must *definitely* end the game.
        room.timerState = setTimeout(() => {
            if (shouldEndGame) {
                this.endGame(roomCode);
            }
            else {
                void this.startNextQuestion(roomCode);
            }
        }, 7000);
    }
}
exports.RoomManager = RoomManager;
