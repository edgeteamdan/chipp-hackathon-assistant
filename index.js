require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const { authenticateToken } = require('./utils/jwt');
const authRoutes = require('./routes/auth');
const emailRoutes = require('./routes/emails');
const configRoutes = require('./routes/config');
const clientAuthRoutes = require('./routes/client-auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(cookieParser());
app.use(authenticateToken); // JWT authentication middleware

// JWT debugging middleware
app.use((req, res, next) => {
  const cookieHeader = req.get('Cookie');
  const hasAuthCookie = cookieHeader ? cookieHeader.includes('authToken') : false;

  console.log(`🔍 JWT Debug [${req.method} ${req.path}]:`, {
    isAuthenticated: req.isAuthenticated,
    userEmail: req.user?.email || 'none',
    hasAuthCookie,
    cookieCount: cookieHeader ? cookieHeader.split(';').length : 0,
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
app.use('/config', configRoutes);
app.use('/client-auth', clientAuthRoutes);

// Home route
app.get('/', (req, res) => {
  console.log('🏠 Home route - User data:', {
    hasUser: !!req.user,
    userEmail: req.user?.email,
    hasEmails: !!req.user?.emails,
    emailCount: req.user?.emails?.length || 0,
    userKeys: req.user ? Object.keys(req.user) : []
  });

  res.render('index', {
    user: req.user || null,
    emails: req.user?.emails || [],
    error: req.query.error || null,
    clickup: req.user?.clickup || null,
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
