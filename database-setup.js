/**
 * Database Setup Script
 * Parkmaster - Calvin University CS262 Team I
 * 
 * This script creates all necessary database tables, indexes, and sample data.
 * Run with: npm run setup
 */

const { Pool } = require('pg');
require('dotenv').config();

// Build connection string from Azure environment variables or DATABASE_URL
const connectionString = process.env.DATABASE_URL || 
  `postgresql://${process.env.AZURE_POSTGRESQL_USER}@${process.env.AZURE_POSTGRESQL_HOST.split('.')[0]}:${process.env.AZURE_POSTGRESQL_PASSWORD}@${process.env.AZURE_POSTGRESQL_HOST}:${process.env.AZURE_POSTGRESQL_PORT || 5432}/${process.env.AZURE_POSTGRESQL_DATABASE}?ssl=true&sslmode=require`;

console.log('🔧 Setting up Parkmaster database...');
console.log('📍 Host:', process.env.AZURE_POSTGRESQL_HOST);
console.log('📍 Database:', process.env.AZURE_POSTGRESQL_DATABASE);

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

const setupSQL = `
-- ==================== CREATE TABLES ====================
-- Parkmaster Database Schema for Calvin University
-- Team I - CS262 Fall 2025

-- Parking lots table
CREATE TABLE IF NOT EXISTS parking_lots (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    rows INTEGER NOT NULL,
    cols INTEGER NOT NULL,
    spaces JSONB,
    merged_aisles JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(50),
    role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'client')),
    department VARCHAR(100),
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    avatar TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Vehicles table
CREATE TABLE IF NOT EXISTS vehicles (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    make VARCHAR(100) NOT NULL,
    model VARCHAR(100) NOT NULL,
    year VARCHAR(4) NOT NULL,
    color VARCHAR(50),
    license_plate VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_license_plate UNIQUE (license_plate)
);

-- Schedules table
CREATE TABLE IF NOT EXISTS schedules (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    parking_lot_id INTEGER REFERENCES parking_lots(id) ON DELETE SET NULL,
    spot_number VARCHAR(50),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    date DATE NOT NULL,
    is_recurring BOOLEAN DEFAULT false,
    recurring_days JSONB,
    location VARCHAR(255),
    parking_lot VARCHAR(100),
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'completed', 'cancelled')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Issues table
CREATE TABLE IF NOT EXISTS issues (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    user_name VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    spot_number VARCHAR(50),
    status VARCHAR(50) DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==================== CREATE INDEXES ====================

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_vehicles_user_id ON vehicles(user_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_license_plate ON vehicles(license_plate);
CREATE INDEX IF NOT EXISTS idx_schedules_user_id ON schedules(user_id);
CREATE INDEX IF NOT EXISTS idx_schedules_parking_lot_id ON schedules(parking_lot_id);
CREATE INDEX IF NOT EXISTS idx_schedules_date ON schedules(date);
CREATE INDEX IF NOT EXISTS idx_schedules_status ON schedules(status);
CREATE INDEX IF NOT EXISTS idx_schedules_spot ON schedules(spot_number);
CREATE INDEX IF NOT EXISTS idx_issues_user_id ON issues(user_id);
CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status);
CREATE INDEX IF NOT EXISTS idx_issues_is_read ON issues(is_read);
CREATE INDEX IF NOT EXISTS idx_issues_created ON issues(created_at DESC);

-- ==================== INSERT SAMPLE DATA ====================

INSERT INTO users (name, email, phone, role, department, status)
VALUES ('Admin User', 'admin@calvin.edu', '+1-616-555-0100', 'admin', 'IT', 'active')
ON CONFLICT (email) DO NOTHING;

INSERT INTO users (name, email, phone, role, department, status)
VALUES 
    ('John Smith', 'john.smith@calvin.edu', '+1-616-555-1234', 'client', 'Operations', 'active'),
    ('Sarah Johnson', 'sarah.j@calvin.edu', '+1-616-555-2345', 'client', 'Finance', 'active'),
    ('Mike Davis', 'mike.davis@calvin.edu', '+1-616-555-3456', 'client', 'IT', 'active')
ON CONFLICT (email) DO NOTHING;

INSERT INTO parking_lots (name, rows, cols, spaces, merged_aisles)
VALUES 
    ('North Lot', 4, 10, '[]'::jsonb, '[]'::jsonb),
    ('South Lot', 3, 8, '[]'::jsonb, '[]'::jsonb),
    ('East Lot', 5, 12, '[]'::jsonb, '[]'::jsonb);

-- ==================== CREATE FUNCTIONS ====================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON users 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_parking_lots_updated_at ON parking_lots;
CREATE TRIGGER update_parking_lots_updated_at 
    BEFORE UPDATE ON parking_lots 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_schedules_updated_at ON schedules;
CREATE TRIGGER update_schedules_updated_at 
    BEFORE UPDATE ON schedules 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_issues_updated_at ON issues;
CREATE TRIGGER update_issues_updated_at 
    BEFORE UPDATE ON issues 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();
`;

async function setupDatabase() {
  try {
    console.log('🔌 Connecting to database...');
    const client = await pool.connect();
    console.log('✅ Connected successfully!');
    
    console.log('📝 Running setup SQL...');
    await client.query(setupSQL);
    console.log('✅ All tables created successfully!');
    
    // Verify tables
    const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    console.log('📊 Tables created:');
    result.rows.forEach(row => console.log('  ✓', row.table_name));
    
    // Check data
    const userCount = await client.query('SELECT COUNT(*) FROM users');
    const lotCount = await client.query('SELECT COUNT(*) FROM parking_lots');
    
    console.log('📊 Sample data:');
    console.log('  ✓', userCount.rows[0].count, 'users');
    console.log('  ✓', lotCount.rows[0].count, 'parking lots');
    
    console.log('🎉 Database setup complete!');
    client.release();
    
  } catch (error) {
    console.error('❌ Error setting up database:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

setupDatabase()
  .then(() => {
    console.log('✅ Setup finished successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Setup failed:', error);
    process.exit(1);
  });