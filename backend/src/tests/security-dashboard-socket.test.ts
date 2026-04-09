import { createServer, type Server } from 'http';
import WebSocket from 'ws';
import { app } from '../app';
import { startDashboardSocketServer, stopDashboardSocketServer } from '../realtime/dashboard-socket';
import { signAccessToken } from '../utils/jwt';

describe('dashboard websocket hardening', () => {
    let server: Server;
    let baseWsUrl = '';

    beforeAll(async () => {
        server = createServer(app);
        startDashboardSocketServer(server);

        await new Promise<void>((resolve) => {
            server.listen(0, () => resolve());
        });

        const address = server.address();
        if (!address || typeof address === 'string') {
            throw new Error('Unable to resolve websocket test server address');
        }
        baseWsUrl = `ws://127.0.0.1:${address.port}`;
    });

    afterAll(async () => {
        await stopDashboardSocketServer();
        await new Promise<void>((resolve) => {
            server.close(() => resolve());
        });
    });

    it('rejects connections without an access token', async () => {
        await new Promise<void>((resolve, reject) => {
            const socket = new WebSocket(`${baseWsUrl}/ws/dashboard`);

            socket.on('close', (code) => {
                try {
                    expect(code).toBe(1008);
                    resolve();
                } catch (error) {
                    reject(error);
                }
            });

            socket.on('message', () => {
                reject(new Error('Unauthenticated socket should not receive events'));
            });

            socket.on('error', () => {
                // Server can close quickly before full open; close event performs the assertion.
            });
        });
    });

    it('accepts a valid access token and emits connected event', async () => {
        const token = signAccessToken({
            sub: 'test-user-id',
            email: 'security.tester@example.com',
            roles: ['ADMIN'],
            plantIds: [],
            accessAllPlants: true,
            mfaVerified: true,
        });

        await new Promise<void>((resolve, reject) => {
            const socket = new WebSocket(`${baseWsUrl}/ws/dashboard?token=${encodeURIComponent(token)}`);

            socket.on('message', (message) => {
                try {
                    const payload = JSON.parse(message.toString()) as { type?: string };
                    expect(payload.type).toBe('dashboard.connected');
                    socket.close();
                    resolve();
                } catch (error) {
                    reject(error);
                }
            });

            socket.on('error', (error) => {
                reject(error);
            });
        });
    });
});
