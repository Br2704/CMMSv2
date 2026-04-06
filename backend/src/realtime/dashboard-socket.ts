import type { Server as HttpServer } from 'http';
import type { IncomingMessage } from 'http';
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

function extractDashboardSocketToken(request: IncomingMessage) {
  const authHeader = request.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }

  const rawUrl = request.url ?? '';
  try {
    const parsed = new URL(rawUrl, 'http://localhost');
    const token = parsed.searchParams.get('token');
    return token?.trim() || null;
  } catch {
    return null;
  }
}

function isDashboardSocketAuthorized(request: IncomingMessage) {
  const token = extractDashboardSocketToken(request);
  if (!token) {
    return false;
  }

  try {
    verifyAccessToken(token);
    return true;
  } catch {
    return false;
  }
}

export function startDashboardSocketServer(server: HttpServer) {
  if (dashboardSocketServer) {
    return dashboardSocketServer;
  }

  dashboardSocketServer = new WebSocketServer({
    server,
    path: DASHBOARD_SOCKET_PATH,
  });

  dashboardSocketServer.on('connection', (socket, request) => {
    if (!isDashboardSocketAuthorized(request)) {
      socket.close(1008, 'Unauthorized');
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
