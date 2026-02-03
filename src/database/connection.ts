import { Pool } from 'pg';
import { config } from '../config';

// Use a Pool so .connect() returns a client with .query and .release
const pool = new Pool({
  host: config.database.host,
  port: config.database.port,
  database: config.database.name,
  user: config.database.user,
  password: config.database.password,
  max: 10,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
});

pool.connect()
  .then((client) => {
    client.release();
    console.log('✅ Connected to PostgreSQL database (pool)');
  })
  .catch((err) => {
    console.error('❌ PostgreSQL connection error:', err);
    console.error('Ensure PostgreSQL is running and DB credentials in .env are correct (DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME)');
  });

export { pool as db };
