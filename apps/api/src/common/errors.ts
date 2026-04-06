export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(404, `${resource} not found`);
  }
}

export class ForbiddenError extends AppError {
  constructor() {
    super(403, 'Forbidden');
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, message);
  }
}

export class UnauthorizedError extends AppError {
  constructor() {
    super(401, 'Unauthorized');
  }
}

export class ValidationError extends AppError {
  constructor(public fieldErrors: Record<string, string[]>) {
    super(400, 'Validation failed');
  }
}

export class QuotaExceededError extends AppError {
  constructor(message: string) {
    super(400, message);
  }
}
