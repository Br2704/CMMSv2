export interface ParsedQrContent {
  token?: string;
  machineId?: string;
  raw: string;
}

function extractTokenFromPath(pathname: string): string | undefined {
  const parts = pathname.split("/").filter(Boolean);
  const scanIndex = parts.findIndex((part) => part === "scan");
  if (scanIndex >= 0 && parts[scanIndex + 1]) {
    return decodeURIComponent(parts[scanIndex + 1]);
  }
  return undefined;
}

export function parseQrContent(content: string): ParsedQrContent {
  const trimmed = content.trim();

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed) as { token?: string };
      if (parsed.token && /^[A-Za-z0-9_-]{16,128}$/.test(parsed.token)) {
        return { token: parsed.token, raw: content };
      }
    } catch {
      // Fall through to URL/token parsing.
    }
  }

  if (/^[A-Za-z0-9_-]{16,128}$/.test(trimmed)) {
    return { token: trimmed, raw: content };
  }

  try {
    const parsed = new URL(trimmed);
    const path = parsed.pathname;
    const token = extractTokenFromPath(path);
    if (token) {
      return { token, raw: content };
    }

    const parts = path.split("/").filter(Boolean);
    const machineIndex = parts.findIndex((part) => part === "machine");
    if (machineIndex >= 0 && parts[machineIndex + 1]) {
      return { machineId: decodeURIComponent(parts[machineIndex + 1]), raw: content };
    }
  } catch {
    // Keep fallback below.
  }

  return { raw: content };
}
