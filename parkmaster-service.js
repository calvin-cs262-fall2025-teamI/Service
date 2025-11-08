/**
 * Parkmaster REST API Service
 * Calvin University CS262 Team I
 * 
 * This module implements a REST-inspired web service for the Parkmaster
 * parking management system hosted on Azure PostgreSQL.
 * 
 * Features:
 * - User management (admin and client users)
 * - Vehicle registration
 * - Parking lot management
 * - Schedule/reservation management
 * - Issue reporting and tracking
 * 
 * Security:
 * - Uses pg-promise's parameterized queries to prevent SQL injection
 * - Error handling that doesn't expose database details to clients
 * - Environment variables for sensitive configuration
 * 
 * To run locally:
 *   - Create a .env file with database credentials
 *   - Run: npm start
 * 
 * @date: Fall 2025
 */
const bcrypt = require('bcrypt');
const express = require('express');
const pgPromise = require('pg-promise');
const cors = require('cors');
require('dotenv').config();

// Initialize pg-promise
const pgp = pgPromise();

// Database configuration using Azure environment variables
const db = pgp({
    host: process.env.AZURE_POSTGRESQL_HOST,
    port: parseInt(process.env.AZURE_POSTGRESQL_PORT) || 5432,
    database: process.env.AZURE_POSTGRESQL_DATABASE,
    user: process.env.AZURE_POSTGRESQL_USER,
    password: process.env.AZURE_POSTGRESQL_PASSWORD,
    ssl: { rejectUnauthorized: false }
});

// Configure Express server
const app = express();
const port = parseInt(process.env.PORT) || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// ==================== UTILITY FUNCTIONS ====================

/**
 * Standardizes response pattern for database queries
 * Returns data or 404 if data is null
 */
function returnDataOr404(res, data) {
    if (data == null) {
        res.sendStatus(404);
    } else {
        res.send(data);
    }
}

/**
 * Standardizes error responses
 */
function handleError(res, error, next) {
    console.error('Database error:', error);
    if (next) {
        next(error);
    } else {
        res.status(500).json({ 
            status: 'error', 
            message: 'Database operation failed' 
        });
    }
}

// ==================== ROOT ENDPOINT ====================

app.get('/', (req, res) => {
    res.json({
        service: 'Parkmaster API',
        version: '1.0.0',
        status: 'App service is running',
        endpoints: {
            users: '/api/users',
            vehicles: '/api/vehicles',
            parkingLots: '/api/parking-lots',
            schedules: '/api/schedules',
            issues: '/api/issues'
        }
    });
});

// Health check endpoint
app.get('/health', async (req, res) => {
    try {
        const testData = await db.any('SELECT * FROM test_table');
        res.json({ 
            status: 'healthy', 
            database: 'connected',
            testTableCount: testData.length,
            testTableData: testData,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(503).json({ 
            status: 'unhealthy', 
            database: 'disconnected',
            error: error.message 
        });
    }
});

// ==================== USER ENDPOINTS ====================

// Login
app.post('/api/login', (req, res, next) => {
    const { email, password } = req.body;
    db.oneOrNone('SELECT * FROM users WHERE email=${email}', { email: email.toLowerCase() })
        .then(user => {
            if (!user) {
                return res.status(401).json({ status: 'error', message: 'Invalid email or password' });
            }
            // Compare passwords
            return bcrypt.compare(password, user.password_hash)
                .then(isMatch => {
                    if (!isMatch) {
                        return res.status(401).json({ status: 'error', message: 'Invalid email or password' });
                    }
                    // Successful login
                    res.json({ status: 'success', user: { id: user.id, email: user.email, role: user.role } });
                });
        })
        .catch(error => handleError(res, error, next));
});

// Get all users
app.get('/api/users', (req, res, next) => {
    db.manyOrNone('SELECT id, name, email, phone, role, department, status, avatar, created_at FROM users ORDER BY name')
        .then(data => res.send(data))
        .catch(error => handleError(res, error, next));
});

// Get user by ID
app.get('/api/users/:id', (req, res, next) => {
    db.oneOrNone('SELECT id, name, email, phone, role, department, status, avatar, created_at FROM users WHERE id=${id}', 
        req.params)
        .then(data => returnDataOr404(res, data))
        .catch(error => handleError(res, error, next));
});

// Get user by email
app.get('/api/users/email/:email', (req, res, next) => {
    db.oneOrNone('SELECT id, name, email, phone, role, department, status, avatar, created_at FROM users WHERE email=${email}', 
        req.params)
        .then(data => returnDataOr404(res, data))
        .catch(error => handleError(res, error, next));
});

// Create new user - FIXED VERSION
app.post('/api/users', async (req, res, next) => {
    try {
        // Validate required fields
        const { name, email, phone, password, role, department, status } = req.body;
        
        if (!name || !email || !role || !password) {
            return res.status(400).json({ 
                status: 'error', 
                message: 'Missing required fields: name, email, password, and role are required' 
            });
        }

        // Check if email already exists
        const existingUser = await db.oneOrNone('SELECT id FROM users WHERE email = $1', [email]);
        if (existingUser) {
            return res.status(409).json({ 
                status: 'error', 
                message: 'A user with this email already exists' 
            });
        }

        // Hash the password
        const passwordHash = await bcrypt.hash(password, 10);

        // Insert the new user and return the full user object
        const newUser = await db.one(
            `INSERT INTO users(name, email, phone, password_hash, role, department, status, avatar) 
             VALUES ($/name/, $/email/, $/phone/, $/password_hash/, $/role/, $/department/, $/status/, $/avatar/) 
             RETURNING id, name, email, phone, role, department, status, avatar, created_at`,
            {
                name,
                email: email.toLowerCase(), // Normalize email
                phone: phone || null,
                password_hash: passwordHash,
                role,
                department: department || 'General',
                status: status || 'active',
                avatar: req.body.avatar || null
            }
        );

        res.status(201).json(newUser);
    } catch (error) {
        console.error('Error creating user:', error);
        handleError(res, error, next);
    }
});

// Update user
app.put('/api/users/:id', (req, res, next) => {
    db.oneOrNone(
        `UPDATE users 
         SET name=$/body.name/, email=$/body.email/, phone=$/body.phone/, 
             role=$/body.role/, department=$/body.department/, 
             status=$/body.status/, avatar=$/body.avatar/ 
         WHERE id=$/id/ 
         RETURNING id, name, email, phone, role, department, status, avatar`,
        { id: req.params.id, body: req.body }
    )
        .then(data => returnDataOr404(res, data))
        .catch(error => handleError(res, error, next));
});

// Delete user (soft delete - set status to inactive)
app.delete('/api/users/:id', (req, res, next) => {
    db.oneOrNone(
        'UPDATE users SET status=${"inactive"} WHERE id=${id} RETURNING id',
        req.params
    )
        .then(data => returnDataOr404(res, data))
        .catch(error => handleError(res, error, next));
});

// ==================== VEHICLE ENDPOINTS ====================

// Get all vehicles
app.get('/api/vehicles', (req, res, next) => {
    db.manyOrNone('SELECT * FROM vehicles ORDER BY created_at DESC')
        .then(data => res.send(data))
        .catch(error => handleError(res, error, next));
});

// Get vehicles by user ID
app.get('/api/vehicles/user/:userId', (req, res, next) => {
    db.manyOrNone('SELECT * FROM vehicles WHERE user_id=${userId}', req.params)
        .then(data => res.send(data))
        .catch(error => handleError(res, error, next));
});

// Get vehicle by ID
app.get('/api/vehicles/:id', (req, res, next) => {
    db.oneOrNone('SELECT * FROM vehicles WHERE id=${id}', req.params)
        .then(data => returnDataOr404(res, data))
        .catch(error => handleError(res, error, next));
});

// Create new vehicle
app.post('/api/vehicles', (req, res, next) => {
    db.one(
        'INSERT INTO vehicles(user_id, make, model, year, color, license_plate) VALUES (${user_id}, ${make}, ${model}, ${year}, ${color}, ${license_plate}) RETURNING id',
        req.body
    )
        .then(data => res.status(201).send(data))
        .catch(error => handleError(res, error, next));
});

// Update vehicle
app.put('/api/vehicles/:id', (req, res, next) => {
    db.oneOrNone(
        'UPDATE vehicles SET make=${body.make}, model=${body.model}, year=${body.year}, color=${body.color}, license_plate=${body.license_plate} WHERE id=${id} RETURNING id',
        { id: req.params.id, body: req.body }
    )
        .then(data => returnDataOr404(res, data))
        .catch(error => handleError(res, error, next));
});

// Delete vehicle
app.delete('/api/vehicles/:id', (req, res, next) => {
    db.oneOrNone('DELETE FROM vehicles WHERE id=${id} RETURNING id', req.params)
        .then(data => returnDataOr404(res, data))
        .catch(error => handleError(res, error, next));
});

// ==================== PARKING LOT ENDPOINTS ====================

// Get all parking lots
app.get('/api/parking-lots', (req, res, next) => {
    db.manyOrNone('SELECT * FROM parking_lots ORDER BY name')
        .then(data => res.send(data))
        .catch(error => handleError(res, error, next));
});

// Get parking lot by ID
app.get('/api/parking-lots/:id', (req, res, next) => {
    db.oneOrNone('SELECT * FROM parking_lots WHERE id=${id}', req.params)
        .then(data => returnDataOr404(res, data))
        .catch(error => handleError(res, error, next));
});

// Create new parking lot
app.post('/api/parking-lots', (req, res, next) => {
    db.one(
        'INSERT INTO parking_lots(name, rows, cols, spaces, merged_aisles) VALUES (${name}, ${rows}, ${cols}, ${spaces}, ${merged_aisles}) RETURNING id',
        req.body
    )
        .then(data => res.status(201).send(data))
        .catch(error => handleError(res, error, next));
});

// Update parking lot
app.put('/api/parking-lots/:id', (req, res, next) => {
    db.oneOrNone(
        'UPDATE parking_lots SET name=${body.name}, rows=${body.rows}, cols=${body.cols}, spaces=${body.spaces}, merged_aisles=${body.merged_aisles} WHERE id=${id} RETURNING id',
        { id: req.params.id, body: req.body }
    )
        .then(data => returnDataOr404(res, data))
        .catch(error => handleError(res, error, next));
});

// Delete parking lot
app.delete('/api/parking-lots/:id', (req, res, next) => {
    db.oneOrNone('DELETE FROM parking_lots WHERE id=${id} RETURNING id', req.params)
        .then(data => returnDataOr404(res, data))
        .catch(error => handleError(res, error, next));
});

// ==================== SCHEDULE ENDPOINTS ====================

// Get all schedules
app.get('/api/schedules', (req, res, next) => {
    db.manyOrNone('SELECT * FROM schedules ORDER BY date DESC, start_time DESC')
        .then(data => res.send(data))
        .catch(error => handleError(res, error, next));
});

// Get schedules by user ID
app.get('/api/schedules/user/:userId', (req, res, next) => {
    db.manyOrNone(
        'SELECT * FROM schedules WHERE user_id=${userId} ORDER BY date DESC, start_time DESC',
        req.params
    )
        .then(data => res.send(data))
        .catch(error => handleError(res, error, next));
});

// Get schedules by parking lot ID
app.get('/api/schedules/lot/:lotId', (req, res, next) => {
    db.manyOrNone(
        'SELECT * FROM schedules WHERE parking_lot_id=${lotId} ORDER BY date DESC, start_time DESC',
        req.params
    )
        .then(data => res.send(data))
        .catch(error => handleError(res, error, next));
});

// Get schedule by ID
app.get('/api/schedules/:id', (req, res, next) => {
    db.oneOrNone('SELECT * FROM schedules WHERE id=${id}', req.params)
        .then(data => returnDataOr404(res, data))
        .catch(error => handleError(res, error, next));
});

// Create new schedule
app.post('/api/schedules', (req, res, next) => {
    db.one(
        'INSERT INTO schedules(user_id, parking_lot_id, spot_number, start_time, end_time, date, is_recurring, recurring_days, location, parking_lot, status) VALUES (${user_id}, ${parking_lot_id}, ${spot_number}, ${start_time}, ${end_time}, ${date}, ${is_recurring}, ${recurring_days}, ${location}, ${parking_lot}, ${status}) RETURNING id',
        req.body
    )
        .then(data => res.status(201).send(data))
        .catch(error => handleError(res, error, next));
});

// Update schedule
app.put('/api/schedules/:id', (req, res, next) => {
    db.oneOrNone(
        'UPDATE schedules SET user_id=${body.user_id}, parking_lot_id=${body.parking_lot_id}, spot_number=${body.spot_number}, start_time=${body.start_time}, end_time=${body.end_time}, date=${body.date}, is_recurring=${body.is_recurring}, recurring_days=${body.recurring_days}, location=${body.location}, parking_lot=${body.parking_lot}, status=${body.status} WHERE id=${id} RETURNING id',
        { id: req.params.id, body: req.body }
    )
        .then(data => returnDataOr404(res, data))
        .catch(error => handleError(res, error, next));
});

// Delete schedule
app.delete('/api/schedules/:id', (req, res, next) => {
    db.oneOrNone('DELETE FROM schedules WHERE id=${id} RETURNING id', req.params)
        .then(data => returnDataOr404(res, data))
        .catch(error => handleError(res, error, next));
});

// ==================== ISSUE ENDPOINTS ====================

// Get all issues
app.get('/api/issues', (req, res, next) => {
    db.manyOrNone('SELECT * FROM issues ORDER BY created_at DESC')
        .then(data => res.send(data))
        .catch(error => handleError(res, error, next));
});

// Get unread issues
app.get('/api/issues/unread', (req, res, next) => {
    db.manyOrNone('SELECT * FROM issues WHERE is_read=false ORDER BY created_at DESC')
        .then(data => res.send(data))
        .catch(error => handleError(res, error, next));
});

// Get issues by status
app.get('/api/issues/status/:status', (req, res, next) => {
    db.manyOrNone('SELECT * FROM issues WHERE status=${status} ORDER BY created_at DESC', req.params)
        .then(data => res.send(data))
        .catch(error => handleError(res, error, next));
});

// Get issue by ID
app.get('/api/issues/:id', (req, res, next) => {
    db.oneOrNone('SELECT * FROM issues WHERE id=${id}', req.params)
        .then(data => returnDataOr404(res, data))
        .catch(error => handleError(res, error, next));
});

// Create new issue
app.post('/api/issues', (req, res, next) => {
    db.one(
        'INSERT INTO issues(user_id, user_name, message, spot_number, status, is_read) VALUES (${user_id}, ${user_name}, ${message}, ${spot_number}, ${status}, ${is_read}) RETURNING id',
        req.body
    )
        .then(data => res.status(201).send(data))
        .catch(error => handleError(res, error, next));
});

// Update issue
app.put('/api/issues/:id', (req, res, next) => {
    db.oneOrNone(
        'UPDATE issues SET status=${body.status}, is_read=${body.is_read}, resolved_at=${body.resolved_at} WHERE id=${id} RETURNING id',
        { id: req.params.id, body: req.body }
    )
        .then(data => returnDataOr404(res, data))
        .catch(error => handleError(res, error, next));
});

// Mark issue as read
app.patch('/api/issues/:id/read', (req, res, next) => {
    db.oneOrNone('UPDATE issues SET is_read=true WHERE id=${id} RETURNING id', req.params)
        .then(data => returnDataOr404(res, data))
        .catch(error => handleError(res, error, next));
});

// Delete issue
app.delete('/api/issues/:id', (req, res, next) => {
    db.oneOrNone('DELETE FROM issues WHERE id=${id} RETURNING id', req.params)
        .then(data => returnDataOr404(res, data))
        .catch(error => handleError(res, error, next));
});

// ==================== ERROR HANDLING ====================

// 404 handler for undefined routes
app.use((req, res) => {
    res.status(404).json({ 
        status: 'error', 
        message: 'Endpoint not found',
        path: req.path 
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ 
        status: 'error', 
        message: 'Internal server error' 
    });
});

// ==================== START SERVER ====================

app.listen(port, () => {
    console.log('=================================');
    console.log('🚗 Parkmaster API Server');
    console.log('=================================');
    console.log(`📍 Port: ${port}`);
    console.log(`🗄️  Database: ${process.env.AZURE_POSTGRESQL_DATABASE}`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log('=================================');
    console.log('✅ Server is running!');
    console.log(`🔗 Local: http://localhost:${port}`);
    console.log('=================================');
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, closing server gracefully...');
    pgp.end();
    process.exit(0);
});