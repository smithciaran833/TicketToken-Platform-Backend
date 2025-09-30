const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const app = express();
const router = express.Router();

const pool = new Pool({
    host: 'tickettoken-postgres',
    port: 5432,
    database: 'tickettoken_db',
    user: 'postgres',
    password: 'postgres123'
});

const JWT_SECRET = 'your-secret-key-change-in-production';

// Add our auth endpoints
router.post('/register', async (req, res) => {
    try {
        const { email, password } = req.body;
        const hash = await bcrypt.hash(password, 10);
        const result = await pool.query(
            'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
            [email, hash]
        );
        const token = jwt.sign({ userId: result.rows[0].id }, JWT_SECRET);
        res.json({ user: result.rows[0], token });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid' });
        
        const valid = await bcrypt.compare(password, result.rows[0].password_hash);
        if (!valid) return res.status(401).json({ error: 'Invalid' });
        
        const token = jwt.sign({ userId: result.rows[0].id }, JWT_SECRET);
        res.json({ user: { id: result.rows[0].id, email }, token });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.use(express.json());
app.use('/api/v1/auth', router);
app.get('/health', (req, res) => res.json({ status: 'healthy', service: 'auth-addon' }));

app.listen(3033, () => console.log('Auth addon on port 3033'));
