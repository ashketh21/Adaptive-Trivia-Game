import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { RoomManager } from './RoomManager'; // restart
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const app = express();
const server = http.createServer(app);

// Allow CORS for the Next.js apps
const io = new Server(server, {
    cors: {
        origin: process.env.ALLOWED_ORIGIN || '*',
        methods: ['GET', 'POST']
    }
});

// Initialize Room Manager
const roomManager = new RoomManager(io, prisma);

app.get('/health', (req, res) => {
    res.send('Backend Server is running');
});

const PORT = process.env.PORT || 3001;
server.listen(PORT as number, '0.0.0.0', () => {
    console.log(`Socket.IO Server listening on 0.0.0.0:${PORT}`);
});
