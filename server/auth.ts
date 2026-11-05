import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import sql from 'mssql';
import { getPool } from './db.js';

export const authRouter = Router();

function signToken(userId: number, email: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not set');
  return jwt.sign({ sub: String(userId), email }, secret, { expiresIn: '7d' });
}

authRouter.post('/register', async (req, res) => {
  const { email, password } = req.body ?? {};

  if (
    typeof email !== 'string' ||
    !email.includes('@') ||
    typeof password !== 'string' ||
    password.length < 8
  ) {
    res.status(400).json({
      error: 'A valid email and a password of at least 8 characters are required',
    });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const pool = await getPool();
    const result = await pool
      .request()
      .input('email', sql.NVarChar(255), normalizedEmail)
      .input('hash', sql.NVarChar(255), passwordHash)
      .query(
        'INSERT INTO users (email, password_hash) OUTPUT INSERTED.id VALUES (@email, @hash)'
      );
    const userId: number = result.recordset[0].id;
    res.status(201).json({ token: signToken(userId, normalizedEmail) });
  } catch (err) {
    // SQL Server error numbers 2627 / 2601 mean the email already exists
    const code = (err as { number?: number }).number;
    if (code === 2627 || code === 2601) {
      res.status(409).json({ error: 'Email is already registered' });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

authRouter.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};

  if (typeof email !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .input('email', sql.NVarChar(255), normalizedEmail)
      .query('SELECT id, password_hash FROM users WHERE email = @email');

    const user = result.recordset[0];
    const passwordOk = user
      ? await bcrypt.compare(password, user.password_hash)
      : false;

    if (!user || !passwordOk) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    res.json({ token: signToken(user.id, normalizedEmail) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});