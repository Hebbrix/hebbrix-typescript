/**
 * Error classes for AI Memory SDK
 */

export class HebbrixError extends Error {
  statusCode?: number;
  code?: string;
  requestId?: string;
  details?: Record<string, any>;

  constructor(
    message: string,
    statusCode?: number,
    options: {
      code?: string;
      requestId?: string;
      details?: Record<string, any>;
    } = {},
  ) {
    super(message);
    this.name = "HebbrixError";
    this.statusCode = statusCode;
    this.code = options.code;
    this.requestId = options.requestId;
    this.details = options.details;
    Object.setPrototypeOf(this, HebbrixError.prototype);
  }
}

export class EntitlementError extends HebbrixError {
  constructor(
    message: string,
    statusCode: number,
    options: {
      code?: string;
      requestId?: string;
      details?: Record<string, any>;
    } = {},
  ) {
    super(message, statusCode, options);
    this.name = "EntitlementError";
    Object.setPrototypeOf(this, EntitlementError.prototype);
  }
}

export interface IndexingWaitErrorOptions {
  idempotencyKey?: string;
  cause?: unknown;
}

/** Base class for readiness failures after the API has accepted a durable write. */
export class IndexingWaitError extends Error {
  receipt: Record<string, any>;
  memoryIds: string[];
  jobId?: string;
  statusUrl?: string;
  requestId?: string;
  outboxEventId?: string;
  indexingEventId?: string;
  eventId?: string;
  idempotencyReplay?: boolean;
  idempotencyKey?: string;
  retryAfter?: string;
  recovery: Record<string, unknown>;
  cause?: unknown;

  constructor(
    message: string,
    receipt: Record<string, any>,
    options: IndexingWaitErrorOptions = {},
  ) {
    super(message);
    this.name = "IndexingWaitError";
    this.receipt = { ...receipt };
    this.memoryIds = [
      ...new Set(
        [
          ...(receipt.memory_ids || []),
          receipt.memory_id,
          receipt.id,
          ...(receipt.results || []).map(
            (row: Record<string, any>) => row.memory_id || row.id,
          ),
        ].filter(Boolean),
      ),
    ] as string[];
    this.jobId = receipt.job_id;
    this.statusUrl =
      receipt.status_url ||
      (this.memoryIds.length === 1
        ? `/v1/memories/${encodeURIComponent(this.memoryIds[0])}`
        : this.jobId
          ? `/v1/memory-jobs/${encodeURIComponent(this.jobId)}`
          : undefined);
    this.requestId = receipt.request_id;
    this.outboxEventId = receipt.outbox_event_id;
    this.indexingEventId = receipt.indexing_event_id || this.outboxEventId;
    this.eventId = receipt.event_id || this.indexingEventId;
    this.idempotencyReplay = receipt.idempotency_replay;
    this.idempotencyKey = options.idempotencyKey || receipt.idempotency_key;
    this.retryAfter = receipt.retry_after;
    this.recovery = Object.fromEntries(
      Object.entries({
        memory_ids: this.memoryIds,
        job_id: this.jobId,
        status_url: this.statusUrl,
        request_id: this.requestId,
        outbox_event_id: this.outboxEventId,
        indexing_event_id: this.indexingEventId,
        event_id: this.eventId,
        idempotency_key: this.idempotencyKey,
        idempotency_replay: this.idempotencyReplay,
        retry_after: this.retryAfter,
      }).filter(([, value]) => value !== undefined && value !== null),
    );
    this.cause = options.cause;
    Object.setPrototypeOf(this, IndexingWaitError.prototype);
  }
}

export class IndexingTimeoutError extends IndexingWaitError {
  constructor(
    message: string,
    receipt: Record<string, any>,
    options: IndexingWaitErrorOptions = {},
  ) {
    super(message, receipt, options);
    this.name = "IndexingTimeoutError";
    Object.setPrototypeOf(this, IndexingTimeoutError.prototype);
  }
}

export class IndexingAbortedError extends IndexingWaitError {
  constructor(
    message: string,
    receipt: Record<string, any>,
    options: IndexingWaitErrorOptions = {},
  ) {
    super(message, receipt, options);
    this.name = "IndexingAbortedError";
    Object.setPrototypeOf(this, IndexingAbortedError.prototype);
  }
}

export class IndexingTerminalError extends IndexingWaitError {
  processingStatus: string;

  constructor(
    message: string,
    receipt: Record<string, any>,
    processingStatus: string,
    options: IndexingWaitErrorOptions = {},
  ) {
    super(message, receipt, options);
    this.name = "IndexingTerminalError";
    this.processingStatus = processingStatus;
    Object.setPrototypeOf(this, IndexingTerminalError.prototype);
  }
}

export class AuthenticationError extends HebbrixError {
  constructor(
    message = "Authentication failed",
    options: {
      code?: string;
      requestId?: string;
      details?: Record<string, any>;
    } = {},
  ) {
    super(message, 401, options);
    this.name = "AuthenticationError";
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

export class ValidationError extends HebbrixError {
  errors?: any[];

  constructor(
    message: string,
    errors?: any[],
    options: {
      code?: string;
      requestId?: string;
      details?: Record<string, any>;
    } = {},
  ) {
    super(message, 422, options);
    this.name = "ValidationError";
    this.errors = errors;
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class NotFoundError extends HebbrixError {
  constructor(
    message = "Resource not found",
    options: {
      code?: string;
      requestId?: string;
      details?: Record<string, any>;
    } = {},
  ) {
    super(message, 404, options);
    this.name = "NotFoundError";
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

export class RateLimitError extends HebbrixError {
  constructor(
    message = "Rate limit exceeded",
    options: {
      code?: string;
      requestId?: string;
      details?: Record<string, any>;
    } = {},
  ) {
    super(message, 429, options);
    this.name = "RateLimitError";
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }
}

export class ServerError extends HebbrixError {
  constructor(
    message = "Internal server error",
    options: {
      code?: string;
      requestId?: string;
      details?: Record<string, any>;
    } = {},
  ) {
    super(message, 500, options);
    this.name = "ServerError";
    Object.setPrototypeOf(this, ServerError.prototype);
  }
}
