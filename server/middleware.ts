import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Checks the "Authorization: Bearer <token>" header on a request.
// If the token is valid, it stores the user's id for the route to use.
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Login required' });
    return;
  }

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET is not set');

    const payload = jwt.verify(header.slice(7), secret);
    if (typeof payload === 'string' || !payload.sub) {
      throw new Error('Invalid token payload');
    }

    res.locals.userId = Number(payload.sub);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}