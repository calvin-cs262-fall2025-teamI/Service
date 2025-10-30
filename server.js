/**
 * Parkmaster API Server
 * Calvin University - CS262 Fall 2025 - Team I
 * 
 * Backend service for parking lot management system
 */

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;

// Build connection string from Azure environment variables or DATABASE_URL
const connectionString = process.env.DATABASE_URL || 
  `postgresql://${process.env.AZURE_POSTGRESQL_USER}@${process.env.AZURE_POSTGRESQL_HOST.split('.')[0]}:${process.env.AZURE_POSTGRESQL_PASSWORD}@${process.env.AZURE_POSTGRESQL_HOST}:${process.env.AZURE_POSTGRESQL_PORT || 5432}/${process.env.AZURE_POSTGRESQL_DATABASE}?ssl=true&sslmode=require`;

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Test database connection on startup
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Database connection error:', err.message);
  } else {
    console.log('✅ Successfully connected to PostgreSQL');
    console.log('📍 Database:', process.env.AZURE_POSTGRESQL_DATABASE || 'Unknown');
    release();
  }
});

// ==================== ROOT & HEALTH ENDPOINTS ====================

app.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    const tables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    
    res.json({ 
      message: '🚀 Parkmaster API - Calvin University',
      version: '1.0.0',
      status: 'healthy',
      database: 'connected',
      timestamp: result.rows[0].now,
      tables: tables.rows.map(r => r.table_name),
      endpoints: {
        health: '/api/health',
        parkingLots: '/api/parking-lots',
        users: '/api/users',
        schedules: '/api/schedules',
        issues: '/api/issues'
      }
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'error',
      message: 'Database connection failed',
      error: error.message 
    });
  }
});

app.get('/api/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() as timestamp, version() as db_version');
    res.json({ 
      status: 'healthy',
      database: 'connected',
      timestamp: result.rows[0].timestamp,
      version: result.rows[0].db_version
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'unhealthy',
      database: 'disconnected',
      error: error.message 
    });
  }
});

// ==================== PARKING LOTS ENDPOINTS ====================

app.get('/api/parking-lots', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM parking_lots ORDER BY created_at DESC');
    res.json({ 
      success: true,
      count: result.rows.length,
      data: result.rows 
    });
  } catch (error) {
    console.error('Error fetching parking lots:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch parking lots', 
      details: error.message 
    });
  }
});

app.get('/api/parking-lots/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM parking_lots WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'Parking lot not found' 
      });
    }
    
    res.json({ 
      success: true,
      data: result.rows[0] 
    });
  } catch (error) {
    console.error('Error fetching parking lot:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch parking lot', 
      details: error.message 
    });
  }
});

app.post('/api/parking-lots', async (req, res) => {
  try {
    const { name, rows, cols, spaces, mergedAisles } = req.body;
    
    if (!name || !rows || !cols) {
      return res.status(400).json({ 
        success: false,
        error: 'Name, rows, and cols are required' 
      });
    }
    
    const query = `
      INSERT INTO parking_lots (name, rows, cols, spaces, merged_aisles)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    
    const result = await pool.query(query, [
      name,
      rows,
      cols,
      JSON.stringify(spaces || []),
      JSON.stringify(mergedAisles || [])
    ]);
    
    console.log('✅ Parking lot created:', name);
    
    res.status(201).json({
      success: true,
      message: 'Parking lot created successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating parking lot:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to create parking lot', 
      details: error.message 
    });
  }
});

app.put('/api/parking-lots/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, rows, cols, spaces, mergedAisles } = req.body;
    
    const query = `
      UPDATE parking_lots 
      SET name = $1, rows = $2, cols = $3, spaces = $4, merged_aisles = $5, updated_at = CURRENT_TIMESTAMP
      WHERE id = $6
      RETURNING *
    `;
    
    const result = await pool.query(query, [
      name,
      rows,
      cols,
      JSON.stringify(spaces),
      JSON.stringify(mergedAisles),
      id
    ]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'Parking lot not found' 
      });
    }
    
    res.json({
      success: true,
      message: 'Parking lot updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating parking lot:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to update parking lot', 
      details: error.message 
    });
  }
});

app.delete('/api/parking-lots/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM parking_lots WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'Parking lot not found' 
      });
    }
    
    res.json({
      success: true,
      message: 'Parking lot deleted successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error deleting parking lot:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to delete parking lot', 
      details: error.message 
    });
  }
});

// ==================== USERS ENDPOINTS ====================

app.get('/api/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users ORDER BY created_at DESC');
    res.json({ 
      success: true,
      count: result.rows.length,
      data: result.rows 
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch users', 
      details: error.message 
    });
  }
});

app.get('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }
    
    res.json({ 
      success: true,
      data: result.rows[0] 
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch user', 
      details: error.message 
    });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const { name, email, phone, role, department, avatar } = req.body;
    
    if (!name || !email || !role) {
      return res.status(400).json({ 
        success: false,
        error: 'Name, email, and role are required' 
      });
    }
    
    const query = `
      INSERT INTO users (name, email, phone, role, department, avatar, status)
      VALUES ($1, $2, $3, $4, $5, $6, 'active')
      RETURNING *
    `;
    
    const result = await pool.query(query, [name, email, phone, role, department, avatar]);
    console.log('✅ User created:', email);
    
    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to create user', 
      details: error.message 
    });
  }
});

app.put('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, role, department, avatar, status } = req.body;
    
    const query = `
      UPDATE users 
      SET name = $1, email = $2, phone = $3, role = $4, department = $5, avatar = $6, status = $7, updated_at = CURRENT_TIMESTAMP
      WHERE id = $8
      RETURNING *
    `;
    
    const result = await pool.query(query, [name, email, phone, role, department, avatar, status, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }
    
    res.json({
      success: true,
      message: 'User updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to update user', 
      details: error.message 
    });
  }
});

// ==================== SCHEDULES ENDPOINTS ====================

app.get('/api/schedules', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM schedules ORDER BY date DESC, start_time DESC');
    res.json({ 
      success: true,
      count: result.rows.length,
      data: result.rows 
    });
  } catch (error) {
    console.error('Error fetching schedules:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch schedules', 
      details: error.message 
    });
  }
});

app.post('/api/schedules', async (req, res) => {
  try {
    const { 
      user_id, parking_lot_id, spot_number, start_time, end_time, 
      date, location, parking_lot, is_recurring, recurring_days 
    } = req.body;
    
    const query = `
      INSERT INTO schedules (
        user_id, parking_lot_id, spot_number, start_time, end_time,
        date, location, parking_lot, is_recurring, recurring_days, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending')
      RETURNING *
    `;
    
    const result = await pool.query(query, [
      user_id, parking_lot_id, spot_number, start_time, end_time,
      date, location, parking_lot, is_recurring, 
      recurring_days ? JSON.stringify(recurring_days) : null
    ]);
    
    console.log('✅ Schedule created for spot:', spot_number);
    
    res.status(201).json({
      success: true,
      message: 'Schedule created successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating schedule:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to create schedule', 
      details: error.message 
    });
  }
});

// ==================== ISSUES ENDPOINTS ====================

app.get('/api/issues', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM issues ORDER BY created_at DESC');
    res.json({ 
      success: true,
      count: result.rows.length,
      data: result.rows 
    });
  } catch (error) {
    console.error('Error fetching issues:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch issues', 
      details: error.message 
    });
  }
});

app.post('/api/issues', async (req, res) => {
  try {
    const { user_name, message, spot_number } = req.body;
    
    if (!message) {
      return res.status(400).json({ 
        success: false,
        error: 'Message is required' 
      });
    }
    
    const query = `
      INSERT INTO issues (user_name, message, spot_number, status, is_read)
      VALUES ($1, $2, $3, 'open', false)
      RETURNING *
    `;
    
    const result = await pool.query(query, [user_name, message, spot_number]);
    console.log('✅ Issue reported by:', user_name);
    
    res.status(201).json({
      success: true,
      message: 'Issue reported successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating issue:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to report issue', 
      details: error.message 
    });
  }
});

app.patch('/api/issues/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { is_read, status } = req.body;
    
    let query = 'UPDATE issues SET ';
    const updates = [];
    const values = [];
    let paramCount = 1;
    
    if (is_read !== undefined) {
      updates.push(`is_read = $${paramCount++}`);
      values.push(is_read);
    }
    
    if (status) {
      updates.push(`status = $${paramCount++}`);
      values.push(status);
      
      if (status === 'resolved') {
        updates.push(`resolved_at = NOW()`);
      }
    }
    
    updates.push(`updated_at = NOW()`);
    query += updates.join(', ');
    query += ` WHERE id = $${paramCount} RETURNING *`;
    values.push(id);
    
    const result = await pool.query(query, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'Issue not found' 
      });
    }
    
    res.json({
      success: true,
      message: 'Issue updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating issue:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to update issue', 
      details: error.message 
    });
  }
});

app.delete('/api/issues/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM issues WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'Issue not found' 
      });
    }
    
    res.json({
      success: true,
      message: 'Issue deleted successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error deleting issue:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to delete issue', 
      details: error.message 
    });
  }
});

// ==================== ERROR HANDLING ====================

app.use((req, res) => {
  res.status(404).json({ 
    success: false,
    error: 'Route not found',
    path: req.path,
    method: req.method
  });
});

app.use((err, req, res, next) => {
  console.error('❌ Server error:', err);
  res.status(500).json({ 
    success: false,
    error: 'Internal server error',
    message: err.message 
  });
});

app.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log('🚀 Parkmaster API - Calvin University');
  console.log('   CS262 Fall 2025 - Team I');
  console.log('='.repeat(50));
  console.log(`📍 Port: ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🗄️  Database: PostgreSQL (Azure)`);
  console.log(`⏰ Started: ${new Date().toISOString()}`);
  console.log('='.repeat(50));
});