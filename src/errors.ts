/**
 * Error classes for AI Memory SDK
 */

export class HebbrixError extends Error {
  statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = "HebbrixError";
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, HebbrixError.prototype);
  }
}

export class AuthenticationError extends HebbrixError {
  constructor(message = "Authentication failed") {
    super(message, 401);
    this.name = "AuthenticationError";
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

export class ValidationError extends HebbrixError {
  errors?: any[];

  constructor(message: string, errors?: any[]) {
    super(message, 422);
    this.name = "ValidationError";
    this.errors = errors;
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class NotFoundError extends HebbrixError {
  constructor(message = "Resource not found") {
    super(message, 404);
    this.name = "NotFoundError";
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

export class RateLimitError extends HebbrixError {
  constructor(message = "Rate limit exceeded") {
    super(message, 429);
    this.name = "RateLimitError";
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }
}

export class ServerError extends HebbrixError {
  constructor(message = "Internal server error") {
    super(message, 500);
    this.name = "ServerError";
    Object.setPrototypeOf(this, ServerError.prototype);
  }
}
