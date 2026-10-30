/** Base class for well-typed application errors with an HTTP status. */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 500,
    public readonly code: string = "APP_ERROR",
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/**
 * Thrown by module stubs whose real behavior (scraping, messaging, AI) is
 * intentionally NOT implemented in this step. Signals "wired, not built yet".
 */
export class NotImplementedError extends AppError {
  constructor(feature: string) {
    super(`Not implemented yet: ${feature}`, 501, "NOT_IMPLEMENTED");
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, "NOT_FOUND");
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required") {
    super(message, 401, "UNAUTHORIZED");
  }
}

export class ValidationError extends AppError {
  constructor(
    message: string,
    public readonly details?: unknown,
  ) {
    super(message, 400, "VALIDATION_ERROR");
  }
}
