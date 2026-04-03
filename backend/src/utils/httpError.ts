export class HttpError extends Error {
  statusCode: number;
  details?: unknown;

  constructor(statusCode: number, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function badRequest(message: string, details?: unknown): never {
  throw new HttpError(400, message, details);
}

export function unauthorized(message = 'Unauthorized'): never {
  throw new HttpError(401, message);
}

export function forbidden(message = 'Forbidden'): never {
  throw new HttpError(403, message);
}

export function notFound(message = 'Not found'): never {
  throw new HttpError(404, message);
}

export function conflict(message: string, details?: unknown): never {
  throw new HttpError(409, message, details);
}
