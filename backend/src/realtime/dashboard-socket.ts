import type { Server as HttpServer, IncomingMessage } from 'http';
import { WebSocketServer, type WebSocket } from 'ws';
import { logger } from '../config/logger';
import { verifyAccessToken } from '../utils/jwt';

type DashboardSocketEvent =
  | {
    type: 'dashboard.connected';
    timestamp: string;
  }
  | {
    type: 'dashboard.refresh';
    reason: 'mutation' | 'interval' | 'manual';
    timestamp: string;
  };

const DASHBOARD_SOCKET_PATH = '/ws/dashboard';

let dashboardSocketServer: WebSocketServer | null = null;
let refreshInterval: NodeJS.Timeout | null = null;

function safeSend(socket: WebSocket, payload: DashboardSocketEvent) {
  if (socket.readyState !== socket.OPEN) return;
  socket.send(JSON.stringify(payload));
}

function broadcast(payload: DashboardSocketEvent) {
  if (!dashboardSocketServer) return;
  const serialized = JSON.stringify(payload);
  dashboardSocketServer.clients.forEach((client) => {
    if (client.readyState === client.OPEN) {
      client.send(serialized);
    }
  });
}

function extractToken(request: IncomingMessage): string | null {
  const rawUrl = request.url ?? '';
  const queryStart = rawUrl.indexOf('?');
  if (queryStart === -1) return null;

  const searchParams = new URLSearchParams(rawUrl.slice(queryStart));
  const token = searchParams.get('token');
  return token?.trim() || null;
}

export function startDashboardSocketServer(server: HttpServer) {
  if (dashboardSocketServer) {
    return dashboardSocketServer;
  }

  dashboardSocketServer = new WebSocketServer({
    noServer: true,
  });

  server.on('upgrade', (request, socket, head) => {
    const pathname = request.url ? new URL(request.url, `http://${request.headers.host}`).pathname : '';
    
    if (pathname === DASHBOARD_SOCKET_PATH) {
      dashboardSocketServer?.handleUpgrade(request, socket, head, (ws) => {
        dashboardSocketServer?.emit('connection', ws, request);
      });
    }
  });

  dashboardSocketServer.on('connection', (socket: WebSocket, request: IncomingMessage) => {
    logger.info({ path: request.url, ip: request.socket.remoteAddress }, 'Dashboard WebSocket connected');

    const token = extractToken(request);
    if (!token) {
      logger.warn({ url: request.url }, 'Dashboard WebSocket rejected: missing token');
      socket.close(4001, 'Unauthorized');
      return;
    }

    try {
      verifyAccessToken(token);
      logger.info('Dashboard WebSocket auth succeeded');
    } catch (err) {
      logger.warn({ err }, 'Dashboard WebSocket rejected: invalid or expired token');
      socket.close(4001, 'Unauthorized');
      return;
    }

    safeSend(socket, {
      type: 'dashboard.connected',
      timestamp: new Date().toISOString(),
    });
  });

  refreshInterval = setInterval(() => {
    emitDashboardRefresh('interval');
  }, 20_000);
  refreshInterval.unref?.();

  logger.info({ path: DASHBOARD_SOCKET_PATH }, 'Dashboard websocket server started');

  return dashboardSocketServer;
}

export function emitDashboardRefresh(reason: 'mutation' | 'interval' | 'manual' = 'mutation') {
  broadcast({
    type: 'dashboard.refresh',
    reason,
    timestamp: new Date().toISOString(),
  });
}

export async function stopDashboardSocketServer() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }

  if (!dashboardSocketServer) return;

  await new Promise<void>((resolve) => {
    dashboardSocketServer!.close(() => resolve());
  });
  dashboardSocketServer = null;
}
