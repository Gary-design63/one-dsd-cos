require('dotenv').config();
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' || (process.env.DATABASE_URL || '').includes('supabase')
    ? { rejectUnauthorized: false }
    : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('PostgreSQL pool error:', err.message);
});

function toPostgres(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

async function query(sql, params = []) {
  const pgSql = toPostgres(sql);
  try {
    const { rows } = await pool.query(pgSql, params);
    return rows;
  } catch (err) {
    console.error('DB query error:', err.message);
    console.error('SQL:', pgSql.substring(0, 200));
    throw err;
  }
}

async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

module.exports = { pool, query, queryOne };
