import { io, Socket } from 'socket.io-client';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || (typeof window !== 'undefined' ? `http://${window.location.hostname}:3001` : 'http://localhost:3001');

class SocketClient {
    private static instance: Socket | null = null;

    public static getInstance(): Socket {
        if (!SocketClient.instance) {
            SocketClient.instance = io(SOCKET_URL, {
                reconnectionDelayMax: 10000,
                transports: ['websocket'],
            });
        }
        return SocketClient.instance;
    }
}

export const socket = SocketClient.getInstance();
