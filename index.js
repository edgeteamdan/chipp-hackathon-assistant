require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const authRoutes = require('./routes/auth');
const emailRoutes = require('./routes/emails');
const clickupConfigRoutes = require('./routes/clickup-config');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'autotask-secret',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // Set to true if using HTTPS
}));

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Routes
app.use('/auth', authRoutes);
app.use('/emails', emailRoutes);
app.use('/clickup', clickupConfigRoutes);

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
