require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const authRoutes = require('./routes/auth');
const emailRoutes = require('./routes/emails');
const clickupConfigRoutes = require('./routes/clickup-config');
const configRoutes = require('./routes/config');
const clientAuthRoutes = require('./routes/client-auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'autotask-secret-key-for-development',
  resave: false,
  saveUninitialized: false, // Don't save empty sessions
  cookie: {
    secure: false, // Set to true if using HTTPS in production
    httpOnly: true, // Prevent XSS attacks
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'lax' // CSRF protection
  },
  name: 'autotask.sid' // Custom session name
}));

// Session debugging middleware
app.use((req, res, next) => {
  const sessionId = req.sessionID;
  const hasUser = !!req.session.user;
  const hasTokens = !!req.session.tokens;
  const hasClickUp = !!req.session.clickup;

  console.log(`🔍 Session Debug [${req.method} ${req.path}]:`, {
    sessionId: sessionId ? sessionId.substring(0, 8) + '...' : 'none',
    hasUser,
    hasTokens,
    hasClickUp,
    userAgent: req.get('User-Agent')?.substring(0, 50) + '...'
  });

  next();
});

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Routes
app.use('/auth', authRoutes);
app.use('/emails', emailRoutes);
app.use('/clickup', clickupConfigRoutes);
app.use('/config', configRoutes);
app.use('/client-auth', clientAuthRoutes);

// Home route
app.get('/', (req, res) => {
  res.render('index', {
    user: req.session.user || null,
    emails: req.session.emails || [],
    error: req.query.error || null,
    clickup: req.session.clickup || null,
    clickupAuth: req.query.clickup_auth || null
  });
});

// Settings page route
app.get('/settings', (req, res) => {
  res.render('settings');
});

// Instructions page route
app.get('/instructions', (req, res) => {
  res.render('instructions');
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

// 404 handler
app.use((req, res) => {
  res.status(404).send('Page not found');
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 AutoTask AI server running on http://localhost:${PORT}`);
  console.log('📧 Powered by EdgeTeam × Chipp.ai - Ready to transform emails into tasks!');
});
