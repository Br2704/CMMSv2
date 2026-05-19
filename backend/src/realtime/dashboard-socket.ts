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
  if (queryStart !== -1) {
    const searchParams = new URLSearchParams(rawUrl.slice(queryStart));
    const token = searchParams.get('token');
    if (token?.trim()) return token.trim();
  }

  // Support protocol header (Sec-WebSocket-Protocol)
  const protocol = request.headers['sec-websocket-protocol'];
  if (typeof protocol === 'string' && protocol.trim()) {
    // If multiple protocols are provided, the first one is the token
    return protocol.split(',')[0].trim();
  }

  return null;
}

export function startDashboardSocketServer(server: HttpServer) {
  if (dashboardSocketServer) {
    return dashboardSocketServer;
  }

  dashboardSocketServer = new WebSocketServer({
    noServer: true,
  });

  server.on('upgrade', (request, socket, head) => {
    const pathname = request.url ? request.url.split('?')[0] : '';
    
    if (pathname === DASHBOARD_SOCKET_PATH) {
      const token = extractToken(request);
      if (!token) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      dashboardSocketServer?.handleUpgrade(request, socket, head, (ws) => {
        dashboardSocketServer?.emit('connection', ws, request);
      });
    }
  });

  dashboardSocketServer.on('connection', (socket: WebSocket, request: IncomingMessage) => {
    const safeUrl = request.url ? request.url.replace(/[?&]token=[^&]+/, '?token=[REDACTED]') : '(unknown)';
    logger.info({ path: safeUrl, ip: request.socket.remoteAddress }, 'Dashboard WebSocket connected');

    const token = extractToken(request);
    if (!token) {
      logger.warn({ path: safeUrl }, 'Dashboard WebSocket rejected: missing token');
      socket.close(4001, 'Unauthorized');
      return;
    }

    try {
      verifyAccessToken(token);
    } catch (err) {
      logger.warn({ path: safeUrl }, 'Dashboard WebSocket rejected: invalid or expired token');
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
