import sql from 'mssql';

let pool: sql.ConnectionPool | undefined;

// Creates the connection once, then reuses it for every request.
export async function getPool(): Promise<sql.ConnectionPool> {
  if (!pool) {
    pool = await new sql.ConnectionPool({
      server: process.env.DB_SERVER ?? 'localhost',
      port: Number(process.env.DB_PORT) || 1433,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      options: { encrypt: true, trustServerCertificate: true },
    }).connect();
  }
  return pool;
}