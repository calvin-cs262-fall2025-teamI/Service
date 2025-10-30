/* Run with npm run cleanup */
const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL || 
  `postgresql://${process.env.AZURE_POSTGRESQL_USER}@${process.env.AZURE_POSTGRESQL_HOST.split('.')[0]}:${process.env.AZURE_POSTGRESQL_PASSWORD}@${process.env.AZURE_POSTGRESQL_HOST}:${process.env.AZURE_POSTGRESQL_PORT || 5432}/${process.env.AZURE_POSTGRESQL_DATABASE}?ssl=true&sslmode=require`;

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

const cleanupSQL = `
-- Delete all data (keeps tables)
DELETE FROM issues;
DELETE FROM schedules;
DELETE FROM vehicles;
DELETE FROM users;
DELETE FROM parking_lots;

-- Reset sequences
ALTER SEQUENCE users_id_seq RESTART WITH 1;
ALTER SEQUENCE vehicles_id_seq RESTART WITH 1;
ALTER SEQUENCE parking_lots_id_seq RESTART WITH 1;
ALTER SEQUENCE schedules_id_seq RESTART WITH 1;
ALTER SEQUENCE issues_id_seq RESTART WITH 1;
`;

async function cleanup() {
  try {
    console.log('🧹 Cleaning up database...');
    const client = await pool.connect();
    
    await client.query(cleanupSQL);
    console.log('✅ All mock data deleted!');
    
    client.release();
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

cleanup();