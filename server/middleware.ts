import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import sql from 'mssql';
import { getPool } from './db.js';

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

// Use this AFTER requireAuth. It looks up the user's role in the database on
// every request, so an agent who is demoted loses access immediately.
export async function requireAgent(
  _req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.Int, res.locals.userId)
      .query('SELECT role FROM users WHERE id = @id');

    if (result.recordset[0]?.role !== 'agent') {
      res.status(403).json({ error: 'Agents only' });
      return;
    }
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not check permissions' });
  }
}