const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { query, queryOne } = require('../db');
const { requireAuth, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  try {
    const user = await queryOne(
      'SELECT id, username, password, role, full_name, department FROM users WHERE username = ?',
      [username]
    );
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, full_name: user.full_name, department: user.department },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    // Fire-and-forget audit log
    query('INSERT INTO audit_log (id,event_type,details,user_id,created_at) VALUES (?,?,?,?,NOW())',
      [uuidv4(), 'user_login', `User ${user.username} logged in`, user.id]).catch(() => {});

    res.json({ token, user: { id: user.id, username: user.username, role: user.role, full_name: user.full_name, department: user.department } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error during authentication' });
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await queryOne(
      'SELECT id, username, role, full_name, department, idi_stage, created_at FROM users WHERE id = ?',
      [req.user.id]
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/logout
router.post('/logout', requireAuth, (req, res) => {
  res.json({ message: 'Logged out successfully' });
});

module.exports = router;
