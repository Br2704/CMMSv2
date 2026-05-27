import { createServer, request as httpRequest } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";

const port = Number(process.env.PORT || 80);
const distDir = join(process.cwd(), "dist");
const apiTarget = new URL(process.env.API_PROXY_TARGET || "http://backend:3001");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function sendFile(res, filePath) {
  const contentType = mimeTypes[extname(filePath).toLowerCase()] || "application/octet-stream";
  res.setHeader("Content-Type", contentType);
  createReadStream(filePath).pipe(res);
}

function serveIndex(res) {
  sendFile(res, join(distDir, "index.html"));
}

function proxyApiRequest(req, res) {
  const upstream = httpRequest(
    {
      protocol: apiTarget.protocol,
      hostname: apiTarget.hostname,
      port: apiTarget.port || (apiTarget.protocol === "https:" ? 443 : 80),
      method: req.method,
      path: req.url,
      headers: {
        ...req.headers,
        host: apiTarget.host,
      },
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    },
  );

  upstream.on("error", () => {
    if (!res.headersSent) {
      res.statusCode = 503;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
    }
    res.end(JSON.stringify({ success: false, message: "Backend service is unavailable" }));
  });

  req.pipe(upstream);
}

function proxyWebSocketUpgrade(req, socket, head) {
  const upstream = httpRequest(
    {
      protocol: apiTarget.protocol,
      hostname: apiTarget.hostname,
      port: apiTarget.port || (apiTarget.protocol === "https:" ? 443 : 80),
      path: req.url,
      headers: {
        ...req.headers,
        host: apiTarget.host,
      },
    },
  );

  upstream.on("upgrade", (upstreamRes, upstreamSocket, upstreamHead) => {
    const headers = [
      `HTTP/1.1 ${upstreamRes.statusCode || 101} Switching Protocols`,
      ...Object.entries(upstreamRes.headers).flatMap(([key, value]) => {
        if (typeof value === "undefined") return [];
        if (Array.isArray(value)) return [`${key}: ${value.join(", ")}`];
        return [`${key}: ${value}`];
      }),
      "",
      "",
    ].join("\r\n");

    socket.write(headers);
    if (upstreamHead && upstreamHead.length > 0) {
      socket.write(upstreamHead);
    }
    if (head && head.length > 0) {
      upstreamSocket.write(head);
    }

    upstreamSocket.pipe(socket).pipe(upstreamSocket);
  });

  upstream.on("error", () => {
    try {
      socket.destroy();
    } catch {
      // ignore
    }
  });

  upstream.end();
}

const server = createServer();
server.on("request", (req, res) => {
  const url = new URL(req.url || "/", "http://localhost");

  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    proxyApiRequest(req, res);
    return;
  }

  let relativePath = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
  if (!relativePath || relativePath === ".") {
    serveIndex(res);
    return;
  }

  const filePath = join(distDir, relativePath);
  if (existsSync(filePath) && statSync(filePath).isFile()) {
    sendFile(res, filePath);
    return;
  }

  if (!extname(relativePath)) {
    serveIndex(res);
    return;
  }

  res.statusCode = 404;
  res.end("Not Found");
});

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url || "/", "http://localhost");
  if (url.pathname.startsWith("/ws/")) {
    proxyWebSocketUpgrade(req, socket, head);
    return;
  }

  socket.destroy();
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Frontend server listening on ${port}`);
});