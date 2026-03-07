"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const RoomManager_1 = require("./RoomManager"); // restart
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
// Allow CORS for the Next.js apps
const io = new socket_io_1.Server(server, {
    cors: {
        origin: process.env.ALLOWED_ORIGIN || '*',
        methods: ['GET', 'POST']
    }
});
// Initialize Room Manager
const roomManager = new RoomManager_1.RoomManager(io, prisma);
app.get('/health', (req, res) => {
    res.send('Backend Server is running');
});
const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Socket.IO Server listening on 0.0.0.0:${PORT}`);
});
