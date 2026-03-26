require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const fileUpload = require('express-fileupload');
const fs = require('fs');

const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');
const { requireAuth } = require('./middleware/auth');
const { migrate, seed } = require('./db/migrate');
const { pool } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Security & Middleware ────────────────────────────────────────────────────

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
    }
  }
}));

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : ['http://localhost:3000', 'http://localhost:5173'];

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload({ limits: { fileSize: 10 * 1024 * 1024 }, abortOnLimit: true }));

// ─── Health ───────────────────────────────────────────────────────────────────

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', version: '5.2.0', db: 'connected', timestamp: new Date().toISOString() });
  } catch (e) {
    res.status(503).json({ status: 'error', db: 'disconnected', error: e.message });
  }
});

// ─── Routes ───────────────────────────────────────────────────────────────────

app.use('/api/auth', authRoutes);
app.use('/api', apiRoutes);

// ─── File Upload ──────────────────────────────────────────────────────────────

app.post('/api/upload', requireAuth, async (req, res) => {
  if (!req.files || !Object.keys(req.files).length) {
    return res.status(400).json({ error: 'No files uploaded' });
  }
  // In production, upload to cloud storage (S3/GCS/Azure Blob)
  // For now, store in /tmp (ephemeral, but functional)
  const uploadDir = process.env.UPLOAD_DIR || '/tmp/uploads';
  fs.mkdirSync(uploadDir, { recursive: true });
  const file = req.files.file;
  const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  try {
    await file.mv(path.join(uploadDir, safeName));
    res.json({ message: 'File uploaded', filename: safeName, originalName: file.name, size: file.size });
  } catch (err) {
    res.status(500).json({ error: 'Upload failed: ' + err.message });
  }
});

// ─── Static Files ─────────────────────────────────────────────────────────────

const publicDir = path.join(__dirname, '../public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/health')) {
      res.sendFile(path.join(publicDir, 'index.html'));
    } else {
      res.status(404).json({ error: 'Not found' });
    }
  });
}

// ─── Error Handler ────────────────────────────────────────────────────────────

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
  });
});

// ─── Startup ─────────────────────────────────────────────────────────────────

async function start() {
  try {
    console.log('Running database migrations...');
    await migrate();
    await seed();
    console.log('✓ Database ready');

    app.listen(PORT, () => {
      console.log(`
╔═══════════════════════════════════════════════════════════╗
║     One DSD Consultant Operating System  v5.2             ║
║     Minnesota DHS — Disability Services Division          ║
╠═══════════════════════════════════════════════════════════╣
║  Port:    ${PORT}                                            ║
║  Health:  /health                                         ║
║  DB:      PostgreSQL (${process.env.DATABASE_URL ? '✓ connected' : '✗ missing DATABASE_URL'})               ║
╠═══════════════════════════════════════════════════════════╣
║  Login:   gbanks / equity2026!  (equity_lead)             ║
║           staff1 / password123  (staff)                   ║
╠═══════════════════════════════════════════════════════════╣
║  AI:      ${process.env.ANTHROPIC_API_KEY ? '✓ ANTHROPIC_API_KEY configured' : '✗ Set ANTHROPIC_API_KEY'}    ║
╚═══════════════════════════════════════════════════════════╝
      `);
    });
  } catch (err) {
    console.error('Startup failed:', err.message);
    process.exit(1);
  }
}

start();

module.exports = app;
