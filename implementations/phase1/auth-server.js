"use strict";
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const Redis = require('ioredis');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json());

// Database connection
const pool = new Pool({
    host: process.env.DB_HOST || 'tickettoken-postgres',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'tickettoken_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres123'
});

// Redis connection
const redis = new Redis({
    host: process.env.REDIS_HOST || 'tickettoken-redis',
    port: process.env.REDIS_PORT || 6379
});

// JWT Config
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRY = '15m';

// Simple auth service implementation
class AuthService {
    async register(data) {
        const { email, password, firstName, lastName, username } = data;
        
        // Check existing user
        const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
        if (existing.rows.length > 0) {
            throw new Error('User already exists');
        }
        
        // Hash password and create user
        const passwordHash = await bcrypt.hash(password, 10);
        const userId = uuidv4();
        
        const result = await pool.query(
            `INSERT INTO users (id, email, password_hash, username, first_name, last_name, role, is_active, email_verified)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING id, email, username, first_name, last_name, role`,
            [userId, email.toLowerCase(), passwordHash, username || email.split('@')[0], firstName, lastName, 'user', true, false]
        );
        
        const user = result.rows[0];
        const accessToken = jwt.sign({ userId: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
        const refreshToken = jwt.sign({ userId: user.id, type: 'refresh' }, JWT_SECRET, { expiresIn: '7d' });
        
        return { user, tokens: { accessToken, refreshToken } };
    }
    
    async login({ email, password }) {
        const result = await pool.query(
            'SELECT id, email, password_hash, username, first_name, last_name, role, is_active FROM users WHERE email = $1',
            [email.toLowerCase()]
        );
        
        if (result.rows.length === 0) {
            throw new Error('Invalid credentials');
        }
        
        const user = result.rows[0];
        
        if (!user.is_active) {
            throw new Error('Account disabled');
        }
        
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            throw new Error('Invalid credentials');
        }
        
        const accessToken = jwt.sign({ userId: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
        const refreshToken = jwt.sign({ userId: user.id, type: 'refresh' }, JWT_SECRET, { expiresIn: '7d' });
        
        // Store in Redis
        await redis.setex(`session:${accessToken}`, 900, JSON.stringify({ userId: user.id, email: user.email }));
        
        return { 
            user: {
                id: user.id,
                email: user.email,
                username: user.username,
                first_name: user.first_name,
                last_name: user.last_name,
                role: user.role,
                mfa_enabled: false
            }, 
            tokens: { accessToken, refreshToken } 
        };
    }
}

const authService = new AuthService();

// Controller instance
const AuthController = {
    authService,
    
    async register(req, res) {
        try {
            const result = await this.authService.register(req.body);
            res.status(201).json(result);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    },
    
    async login(req, res) {
        try {
            const result = await this.authService.login(req.body);
            res.json(result);
        } catch (error) {
            res.status(401).json({ error: error.message });
        }
    }
};

// Routes
app.post('/api/v1/auth/register', (req, res) => AuthController.register(req, res));
app.post('/api/v1/auth/login', (req, res) => AuthController.login(req, res));

app.post('/api/v1/auth/refresh', async (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'Refresh token required' });
    
    try {
        const decoded = jwt.verify(refreshToken, JWT_SECRET);
        const newAccessToken = jwt.sign(
            { userId: decoded.userId, email: decoded.email, role: decoded.role },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRY }
        );
        res.json({ accessToken: newAccessToken, refreshToken });
    } catch (error) {
        res.status(401).json({ error: 'Invalid refresh token' });
    }
});

app.get('/api/v1/auth/verify', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        res.json({ valid: true, userId: decoded.userId, email: decoded.email, role: decoded.role });
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
});

app.get('/api/v1/auth/me', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const result = await pool.query(
            'SELECT id, email, username, first_name, last_name, role FROM users WHERE id = $1',
            [decoded.userId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        res.json({ user: result.rows[0] });
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
});

// Health check
app.get('/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ 
            status: 'healthy', 
            service: 'auth-service',
            timestamp: new Date().toISOString(),
            database: 'connected',
            redis: redis.status === 'ready' ? 'connected' : 'disconnected'
        });
    } catch (error) {
        res.status(503).json({ status: 'unhealthy', error: error.message });
    }
});

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => {
    console.log(`Auth Service running on port ${PORT}`);
    console.log('Real implementation active with routes:');
    console.log('  POST /api/v1/auth/register');
    console.log('  POST /api/v1/auth/login'); 
    console.log('  POST /api/v1/auth/refresh');
    console.log('  GET  /api/v1/auth/verify');
    console.log('  GET  /api/v1/auth/me');
});

module.exports = app;
