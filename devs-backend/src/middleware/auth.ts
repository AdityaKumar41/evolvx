import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { AppError } from '../middleware/errorHandler';

interface JWTDecoded {
  id: string;
  githubId: string;
  walletAddress?: string;
  role: string;
  iat?: number;
  exp?: number;
}

export interface AuthRequest extends Request {
  user?: {
    id: string;
    githubId: string;
    walletAddress?: string;
    role: string;
  };
}

export const authenticate = (req: AuthRequest, _res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    const tokenFromQuery = req.query.token as string | undefined;

    // Try to get token from header first, then from query parameter
    let token: string | undefined;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (tokenFromQuery) {
      token = tokenFromQuery;
    }

    if (!token) {
      throw new AppError('No token provided', 401);
    }

    const decoded = jwt.verify(token, config.auth.jwtSecret) as JWTDecoded;

    req.user = {
      id: decoded.id,
      githubId: decoded.githubId,
      walletAddress: decoded.walletAddress,
      role: decoded.role,
    };

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return next(new AppError('Invalid token', 401));
    }
    next(error);
  }
};

export const authorize = (...roles: string[]) => {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError('Unauthorized', 401));
    }

    if (!roles.includes(req.user.role)) {
      return next(new AppError('Forbidden: Insufficient permissions', 403));
    }

    next();
  };
};

/**
 * Verify JWT token and return decoded payload
 * Used by WebSocket authentication
 */
export function verifyJWT(
  token: string
): { userId: string; githubUsername: string; role: string } | null {
  try {
    const decoded = jwt.verify(token, config.auth.jwtSecret) as JWTDecoded;
    return {
      userId: decoded.id,
      githubUsername: decoded.githubId,
      role: decoded.role,
    };
  } catch (error) {
    return null;
  }
}
