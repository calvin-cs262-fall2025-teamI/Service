-- ==================== PARKMASTER DATABASE SCHEMA ====================
-- Calvin University - CS262 Fall 2025 - Team I
-- 
-- This file is for reference only. Use setup-database.js to create tables.
-- ====================================================================

-- ==================== TABLES ====================

-- Parking lots table
CREATE TABLE IF NOT EXISTS parking_lots (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    location VARCHAR(255),
    level VARCHAR(50),
    capacity INTEGER,
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
    password_hash TEXT NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'user')),
    department VARCHAR(100),
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    avatar TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Spots table
CREATE TABLE IF NOT EXISTS spots (
    id SERIAL PRIMARY KEY,
    parking_lot_id INTEGER REFERENCES parking_lots(id) ON DELETE CASCADE,
    spot_number VARCHAR(50) NOT NULL,
    row_number INTEGER,
    col_number INTEGER,
    status VARCHAR(50) DEFAULT 'available' CHECK (status IN ('available', 'occupied', 'reserved', 'disabled')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_spot_per_lot UNIQUE (parking_lot_id, spot_number)
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
    vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
    parking_lot_id INTEGER REFERENCES parking_lots(id) ON DELETE SET NULL,
    spot_id INTEGER REFERENCES spots(id) ON DELETE SET NULL,
    spot_number VARCHAR(50),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    date DATE NOT NULL,
    is_recurring BOOLEAN DEFAULT false,
    recurring_days JSONB,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'completed', 'cancelled')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Issues table
CREATE TABLE IF NOT EXISTS issues (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    spot_id INTEGER REFERENCES spots(id) ON DELETE SET NULL,
    user_name VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    spot_number VARCHAR(50),
    status VARCHAR(50) DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==================== INDEXES ====================

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

CREATE INDEX IF NOT EXISTS idx_parking_lots_location ON parking_lots(location);
CREATE INDEX IF NOT EXISTS idx_parking_lots_level ON parking_lots(level);

CREATE INDEX IF NOT EXISTS idx_spots_parking_lot_id ON spots(parking_lot_id);
CREATE INDEX IF NOT EXISTS idx_spots_status ON spots(status);
CREATE INDEX IF NOT EXISTS idx_spots_spot_number ON spots(spot_number);

CREATE INDEX IF NOT EXISTS idx_vehicles_user_id ON vehicles(user_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_license_plate ON vehicles(license_plate);

CREATE INDEX IF NOT EXISTS idx_schedules_user_id ON schedules(user_id);
CREATE INDEX IF NOT EXISTS idx_schedules_vehicle_id ON schedules(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_schedules_parking_lot_id ON schedules(parking_lot_id);
CREATE INDEX IF NOT EXISTS idx_schedules_spot_id ON schedules(spot_id);
CREATE INDEX IF NOT EXISTS idx_schedules_date ON schedules(date);
CREATE INDEX IF NOT EXISTS idx_schedules_status ON schedules(status);

CREATE INDEX IF NOT EXISTS idx_issues_user_id ON issues(user_id);
CREATE INDEX IF NOT EXISTS idx_issues_spot_id ON issues(spot_id);
CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status);
CREATE INDEX IF NOT EXISTS idx_issues_is_read ON issues(is_read);
CREATE INDEX IF NOT EXISTS idx_issues_created ON issues(created_at DESC);

-- ==================== TRIGGERS ====================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers to tables
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

DROP TRIGGER IF EXISTS update_spots_updated_at ON spots;
CREATE TRIGGER update_spots_updated_at 
    BEFORE UPDATE ON spots 
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

-- ==================== SAMPLE DATA ====================

-- Insert admin user (with hashed password: 'admin123')
INSERT INTO users (name, email, phone, password_hash, role, department, status)
VALUES ('Admin User', 'admin@calvin.edu', '+1-616-555-0100', '$2b$10$rKZrF8qVzKJx8J9kZ8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8', 'admin', 'IT', 'active')
ON CONFLICT (email) DO NOTHING;

-- Insert sample users (with hashed password: 'user123')
INSERT INTO users (name, email, phone, password_hash, role, department, status)
VALUES 
    ('Max Wu', 'max.wu@calvin.edu', '+1-616-555-1234', '$2b$10$rKZrF8qVzKJx8J9kZ8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8', 'user', 'Operations', 'active'),
    ('Simon T', 'simon.t@calvin.edu', '+1-616-555-2345', '$2b$10$rKZrF8qVzKJx8J9kZ8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8', 'user', 'Finance', 'active'),
    ('Genevieve', 'genevieve@calvin.edu', '+1-616-555-3456', '$2b$10$rKZrF8qVzKJx8J9kZ8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8', 'admin', 'IT', 'active')
ON CONFLICT (email) DO NOTHING;

-- Insert sample parking lots
INSERT INTO parking_lots (name, location, level, capacity, rows, cols, spaces, merged_aisles)
VALUES 
    ('North Lot', 'North Campus', 'Ground', 40, 4, 10, '[]'::jsonb, '[]'::jsonb),
    ('South Lot', 'South Campus', 'Ground', 24, 3, 8, '[]'::jsonb, '[]'::jsonb),
    ('East Lot', 'East Campus', 'Ground', 60, 5, 12, '[]'::jsonb, '[]'::jsonb)
ON CONFLICT DO NOTHING;

-- Insert sample spots for North Lot (assuming lot_id = 1)
INSERT INTO spots (parking_lot_id, spot_number, row_number, col_number, status)
SELECT 1, 'A' || generate_series, (generate_series - 1) / 10, (generate_series - 1) % 10, 'available'
FROM generate_series(1, 40)
ON CONFLICT DO NOTHING;

-- Insert sample vehicles
INSERT INTO vehicles (user_id, make, model, year, color, license_plate)
SELECT u.id, 'Toyota', 'Camry', '2020', 'Blue', 'ABC' || u.id || '123'
FROM users u WHERE u.role = 'user'
ON CONFLICT (license_plate) DO NOTHING;