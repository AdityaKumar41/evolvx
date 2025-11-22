import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (err: any, req: Request, res: Response, _next: NextFunction) => {
  // eslint-disable-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  logger.error('Error:', {
    statusCode,
    message,
    stack: err.stack,
    url: req.url,
    method: req.method,
  });

  res.status(statusCode).json({
    error: {
      message,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    },
  });
};

// More flexible asyncHandler that works with any request type
export const asyncHandler = (fn: (req: any, res: Response, next: NextFunction) => Promise<any>) => {
  // eslint-disable-line @typescript-eslint/no-explicit-any
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
