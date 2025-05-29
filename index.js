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

// In-memory store for user data to bypass JWT cookie timing issues
const userDataStore = new Map();
global.userDataStore = userDataStore;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(cookieParser());
app.use(authenticateToken); // JWT authentication middleware

// Production-ready: Minimal debugging for important routes only

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Routes
app.use('/auth', authRoutes);
app.use('/emails', emailRoutes);
app.use('/config', configRoutes);
app.use('/client-auth', clientAuthRoutes);

// API endpoint to get current user state
app.get('/api/user-state', (req, res) => {
  if (!req.isAuthenticated) {
    console.log('🔍 API user-state: Not authenticated');
    return res.json({
      authenticated: false,
      user: null,
      emails: [],
      clickup: null
    });
  }

  // Check in-memory store first, then fall back to JWT token
  const userId = req.user.id || req.user.email;
  const storedData = userDataStore.get(userId);

  const userState = {
    authenticated: true,
    user: {
      email: req.user.email,
      name: req.user.name,
      picture: req.user.picture
    },
    emails: storedData?.emails || req.user.emails || [],
    clickup: storedData?.clickup || req.user.clickup || null
  };

  console.log(`🔍 API user-state: User: ${req.user.email} - Emails: ${userState.emails.length} (${storedData?.emails ? 'from store' : 'from JWT'}) - ClickUp: ${userState.clickup?.configured ? 'configured' : userState.clickup?.access_token ? 'connected' : 'not connected'} (${storedData?.clickup ? 'from store' : 'from JWT'})`);

  // Debug: Log ClickUp data structure
  if (userState.clickup?.access_token) {
    console.log(`🔍 ClickUp Debug - Teams: ${userState.clickup.teams?.length || 0}, Configured: ${userState.clickup.configured}`);
    console.log(`🔍 ClickUp Data Structure (API response):`, JSON.stringify(userState.clickup, null, 2));
  } else {
    console.log(`🔍 ClickUp Data (no access_token):`, JSON.stringify(userState.clickup, null, 2));
  }

  res.json(userState);
});

// Home route
app.get('/', (req, res) => {
  // Minimal logging for home route
  if (req.user?.emails?.length > 0 || req.user?.clickup?.access_token) {
    console.log(`🏠 Home route - User: ${req.user?.email || 'none'} - Emails: ${req.user?.emails?.length || 0} - ClickUp: ${req.user?.clickup?.configured ? 'configured' : req.user?.clickup?.access_token ? 'connected' : 'not connected'}`);
  }

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
