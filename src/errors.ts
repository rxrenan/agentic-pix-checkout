export class AppError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, message: string, httpStatus = 400) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export function errorBody(error: AppError, extra?: Record<string, unknown>) {
  return {
    error: {
      code: error.code,
      message: error.message,
      ...extra,
    },
  };
}
