import { Server, Socket } from 'socket.io';
import { PrismaClient } from '@prisma/client';

export type RoomState = 'LOBBY' | 'CATEGORY_REVEAL' | 'WAGER_PERIOD' | 'QUESTION_LIVE' | 'RESULTS' | 'GAME_OVER';

export interface Player {
    id: string;
    socketId: string;
    name: string;
    score: number;
    currentWager: number;
    isCorrect: boolean | null;
    hasWagered: boolean;
    hasAnswered: boolean;
}

export interface Room {
    roomCode: string;
    state: RoomState;
    players: Record<string, Player>;
    currentQuestionId: string | null;
    hostSocketId: string;
    hostId: string;
    correctAnswers: string[];
    questionQueue: any[];
    currentQuestionIndex: number;
    mode: 'STANDARD' | 'SURVIVOR';
    timerState: NodeJS.Timeout | null;
    currentMultiplier: number;
    currentMinWagerPercentage: number;
}

export class RoomManager {
    private io: Server;
    private prisma: PrismaClient;
    public rooms: Map<string, Room> = new Map();

    constructor(io: Server, prisma: PrismaClient) {
        this.io = io;
        this.prisma = prisma;
        this.setupListeners();
    }

    private setupListeners() {
        this.io.on('connection', (socket: Socket) => {
            console.log('Client connected:', socket.id);

            socket.on('createRoom', (data: { roomCode: string }, callback) => {
                const hostId = this.createRoom(socket, data.roomCode);
                if (callback) callback({ success: true, roomCode: data.roomCode, hostId });
            });

            socket.on('joinRoom', (data: { roomCode: string; playerName: string }, callback) => {
                const result = this.joinRoom(socket, data.roomCode, data.playerName);
                if (callback) callback(result);
            });

            socket.on('reconnectHost', (data: { roomCode: string; hostId: string }, callback) => {
                const result = this.reconnectHost(socket, data.roomCode, data.hostId);
                if (callback) callback(result);
            });

            socket.on('reconnectPlayer', (data: { roomCode: string; playerId: string }, callback) => {
                const result = this.reconnectPlayer(socket, data.roomCode, data.playerId);
                if (callback) callback(result);
            });

            socket.on('submitWager', (data: { roomCode: string; wager: number }, callback) => {
                const success = this.submitWager(socket, data.roomCode, data.wager);
                if (callback) callback({ success });
            });

            socket.on('submitAnswer', (data: { roomCode: string; answer: string; isCorrect: boolean }, callback) => {
                const success = this.submitAnswer(socket, data.roomCode, data.answer);
                if (callback) callback({ success });
            });

            socket.on('startGame', async (data: { roomCode: string; mode: 'STANDARD' | 'SURVIVOR'; numQuestions: number }, callback) => {
                const success = await this.startGame(socket, data.roomCode, data.mode, data.numQuestions);
                if (callback) callback({ success });
            });

            socket.on('returnToLobby', (data: { roomCode: string }, callback) => {
                const success = this.returnToLobby(socket, data.roomCode);
                if (callback) callback({ success });
            });

            socket.on('disconnect', () => {
                console.log('Client disconnected:', socket.id);
            });
        });
    }

    createRoom(socket: Socket, roomCode: string): string {
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
            currentMinWagerPercentage: 10
        });
        socket.join(roomCode);
        console.log(`Room created: ${roomCode} by ${socket.id}`);
        return hostId;
    }

    joinRoom(socket: Socket, roomCode: string, playerName: string): { success: boolean, playerId?: string } {
        const room = this.rooms.get(roomCode);
        if (!room) return { success: false };

        const playerId = Math.random().toString(36).substring(2, 10) + Date.now().toString(36);

        const player: Player = {
            id: playerId,
            socketId: socket.id,
            name: playerName,
            score: 1000,
            currentWager: 0,
            isCorrect: null,
            hasWagered: false,
            hasAnswered: false
        };

        room.players[playerId] = player;
        socket.join(roomCode);

        this.io.to(roomCode).emit('playerJoined', { player });
        return { success: true, playerId };
    }

    reconnectHost(socket: Socket, roomCode: string, hostId: string): { success: boolean, roomState?: any } {
        const room = this.rooms.get(roomCode);
        if (!room || room.hostId !== hostId) return { success: false };

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
                currentMinWagerPercentage: room.currentMinWagerPercentage
            }
        };
    }

    reconnectPlayer(socket: Socket, roomCode: string, playerId: string): { success: boolean, roomState?: any } {
        const room = this.rooms.get(roomCode);
        if (!room) return { success: false };

        const player = room.players[playerId];
        if (!player) return { success: false };

        player.socketId = socket.id;
        socket.join(roomCode);

        return {
            success: true,
            roomState: {
                state: room.state,
                players: room.players,
                currentMultiplier: room.currentMultiplier,
                currentMinWagerPercentage: room.currentMinWagerPercentage
            }
        };
    }

    async startGame(socket: Socket, roomCode: string, mode: 'STANDARD' | 'SURVIVOR', numQuestions: number): Promise<boolean> {
        const room = this.rooms.get(roomCode);
        if (!room || room.hostSocketId !== socket.id) return false;

        // Reset correct answers array on start explicitly just in case
        room.correctAnswers = [];

        // Fetch questions from DB
        const questions = await this.prisma.question.findMany({
            include: { category: true, globalStats: true }
        });

        // Shuffle
        const shuffled = questions.sort(() => 0.5 - Math.random());
        room.questionQueue = shuffled.slice(0, numQuestions > 0 ? numQuestions : 5);
        room.currentQuestionIndex = 0;
        room.mode = mode;

        this.startNextQuestion(roomCode);
        return true;
    }

    returnToLobby(socket: Socket, roomCode: string): boolean {
        const room = this.rooms.get(roomCode);
        if (!room || room.hostSocketId !== socket.id) return false;

        if (room.timerState) clearTimeout(room.timerState);

        room.state = 'LOBBY';
        room.currentQuestionIndex = 0;
        room.correctAnswers = [];
        room.questionQueue = [];

        for (const playerId in room.players) {
            const player = room.players[playerId];
            player.score = 1000;
            player.isCorrect = null;
            player.currentWager = 0;
            player.hasWagered = false;
            player.hasAnswered = false;
        }

        this.io.to(roomCode).emit('stateChanged', {
            newState: 'LOBBY',
            players: room.players
        });
        return true;
    }

    startNextQuestion(roomCode: string) {
        const room = this.rooms.get(roomCode);
        if (!room) return;

        if (room.timerState) clearTimeout(room.timerState);

        // Check active players for survivor mode
        const activePlayers = Object.values(room.players).filter(p => p.score > 0);
        if (room.mode === 'SURVIVOR' && activePlayers.length <= 1) {
            this.endGame(roomCode);
            return;
        }

        if (room.currentQuestionIndex >= room.questionQueue.length) {
            this.endGame(roomCode);
            return;
        }

        const question = room.questionQueue[room.currentQuestionIndex];
        room.currentQuestionId = question.id;

        // Volatility Formula Mock
        const multVal = question.globalStats ? Math.max(1.2, 3 - (question.globalStats.totalCorrect / question.globalStats.totalAttempts) * 2) : 2.0;
        const mult = Number(multVal.toFixed(1));

        room.currentMultiplier = mult;
        // Formula: 50 / multiplier. E.g. at 2.0x, min wager is 25%. At 1.2x, min wager is 41%. At 3.0x, min wager is 16%.
        room.currentMinWagerPercentage = Math.min(100, Math.max(1, Math.floor(50 / mult)));

        room.state = 'CATEGORY_REVEAL';
        this.io.to(roomCode).emit('stateChanged', {
            newState: 'CATEGORY_REVEAL',
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

    advanceToWagerPeriod(roomCode: string) {
        const room = this.rooms.get(roomCode);
        if (!room) return;

        room.state = 'WAGER_PERIOD';
        const endTime = Date.now() + 15000;
        this.io.to(roomCode).emit('stateChanged', { newState: 'WAGER_PERIOD', minWagerPercentage: room.currentMinWagerPercentage, endTime });

        // 15s to wager
        room.timerState = setTimeout(() => {
            this.advanceToQuestionLive(roomCode);
        }, 15000);
    }

    advanceToQuestionLive(roomCode: string) {
        const room = this.rooms.get(roomCode);
        if (!room) return;

        if (room.timerState) clearTimeout(room.timerState);

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

    endGame(roomCode: string) {
        const room = this.rooms.get(roomCode);
        if (!room) return;

        room.state = 'GAME_OVER';
        this.io.to(roomCode).emit('stateChanged', { newState: 'GAME_OVER', players: room.players });
    }

    submitWager(socket: Socket, roomCode: string, wager: number): boolean {
        const room = this.rooms.get(roomCode);
        if (!room || room.state !== 'WAGER_PERIOD') return false;

        const player = Object.values(room.players).find(p => p.socketId === socket.id);
        if (!player) return false;

        const minWager = Math.max(1, Math.floor(player.score * (room.currentMinWagerPercentage / 100)));
        if (player.score > 0 && (wager < minWager || wager > player.score)) return false;

        player.currentWager = wager;
        player.hasWagered = true;
        this.io.to(room.hostSocketId).emit('playerWagered', { playerId: player.id, wager });

        // Fast forward if everyone active wagered
        const activePlayers = Object.values(room.players).filter(p => p.score > 0);
        if (activePlayers.every(p => p.hasWagered)) {
            this.advanceToQuestionLive(roomCode);
        }

        return true;
    }

    submitAnswer(socket: Socket, roomCode: string, answer: string): boolean {
        const room = this.rooms.get(roomCode);
        if (!room || room.state !== 'QUESTION_LIVE') return false;

        const player = Object.values(room.players).find(p => p.socketId === socket.id);
        if (!player) return false;

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

    calculateResults(roomCode: string) {
        const room = this.rooms.get(roomCode);
        if (!room) return;

        if (room.timerState) clearTimeout(room.timerState);
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
            if (player.score <= 0) continue; // skipped playing

            if (player.isCorrect) {
                player.score += (player.currentWager * volatilityMultiplier * slayerBonus);
            } else if (player.isCorrect === false) {
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
        }

        room.currentQuestionIndex++;

        const activePlayersAfter = Object.values(room.players).filter(p => p.score > 0);
        const shouldEndGame = Object.keys(room.players).length > 1 && activePlayersAfter.length <= 1;

        // 7s to show results, then next question or game over
        room.timerState = setTimeout(() => {
            if (shouldEndGame || room.currentQuestionIndex >= room.questionQueue.length) {
                this.endGame(roomCode);
            } else {
                this.startNextQuestion(roomCode);
            }
        }, 7000);
    }
}
