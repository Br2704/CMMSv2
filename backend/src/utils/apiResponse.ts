export type ApiSuccess<T> = {
  success: true;
  data: T;
  message?: string;
  meta?: Record<string, unknown>;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  }; // Backward compatibility for existing frontend list handlers.
};

export type ApiError = {
  success: false;
  code?: string;
  message: string;
  details?: unknown;
  errors?: unknown; // Backward compatibility with existing clients.
};

export const ok = <T>(
  data: T,
  message = 'OK',
  pagination?: ApiSuccess<T>['pagination'],
  meta?: Record<string, unknown>,
): ApiSuccess<T> => {
  const resolvedMeta = pagination ? { ...(meta ?? {}), pagination } : meta;
  return {
    success: true,
    message,
    data,
    meta: resolvedMeta,
    pagination,
  };
};

export const fail = (message: string, details?: unknown, code?: string): ApiError => {
  const detailsCode =
    !code && details && typeof details === 'object' && 'code' in details && typeof (details as Record<string, unknown>).code === 'string'
      ? ((details as Record<string, unknown>).code as string)
      : undefined;

  return {
    success: false,
    code: code ?? detailsCode ?? (message.toLowerCase().includes('forbidden') ? 'FORBIDDEN' : undefined),
    message,
    details,
    errors: details,
  };
};
