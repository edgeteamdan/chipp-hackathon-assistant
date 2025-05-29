const express = require('express');
const { google } = require('googleapis');
const axios = require('axios');
const router = express.Router();

// OAuth2 setup
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.REDIRECT_URI
);

// Google login
router.get('/google', (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email'
    ]
  });
  res.redirect(authUrl);
});

// Google callback
router.get('/google/callback', async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.redirect('/?error=no_code');
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Get user info
    const oauth2 = google.oauth2({
      auth: oauth2Client,
      version: 'v2'
    });

    const userInfo = await oauth2.userinfo.get();

    // Store in session
    req.session.tokens = tokens;
    req.session.user = {
      id: userInfo.data.id,
      email: userInfo.data.email,
      name: userInfo.data.name,
      picture: userInfo.data.picture
    };

    console.log(`✅ User authenticated: ${userInfo.data.email}`);
    res.redirect('/');
  } catch (error) {
    console.error('❌ Error during authentication:', error);
    res.redirect('/?error=auth_failed');
  }
});

// Logout
router.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
    }
    res.redirect('/');
  });
});

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
};

// ClickUp OAuth - Start authorization
router.get('/clickup', isAuthenticated, (req, res) => {
  const clientId = process.env.CLICKUP_CLIENT_ID;
  const redirectUri = process.env.CLICKUP_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return res.status(500).json({ error: 'ClickUp OAuth not configured' });
  }

  const authUrl = `https://app.clickup.com/api?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}`;

  console.log('🔗 Redirecting to ClickUp OAuth:', authUrl);
  res.redirect(authUrl);
});

// ClickUp OAuth - Handle callback
router.get('/clickup/callback', async (req, res) => {
  const { code } = req.query;

  // Check if user is authenticated (required for ClickUp integration)
  if (!req.session.user) {
    console.error('❌ User not authenticated for ClickUp callback');
    return res.redirect('/?error=auth_required');
  }

  if (!code) {
    console.error('❌ No authorization code received from ClickUp');
    return res.redirect('/?error=clickup_no_code');
  }

  try {
    console.log('🔄 Exchanging ClickUp authorization code for access token...');

    // Exchange code for access token
    const tokenResponse = await axios.post('https://api.clickup.com/api/v2/oauth/token', {
      client_id: process.env.CLICKUP_CLIENT_ID,
      client_secret: process.env.CLICKUP_CLIENT_SECRET,
      code: code
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const { access_token } = tokenResponse.data;

    if (!access_token) {
      throw new Error('No access token received from ClickUp');
    }

    console.log('✅ ClickUp access token received');

    // Get user's teams/workspaces
    const teamsResponse = await axios.get('https://api.clickup.com/api/v2/team', {
      headers: {
        'Authorization': access_token,
        'Content-Type': 'application/json'
      }
    });

    const teams = teamsResponse.data.teams || [];
    console.log(`📋 Found ${teams.length} ClickUp teams`);

    // Store ClickUp data in session
    req.session.clickup = {
      access_token,
      teams,
      configured: false
    };

    console.log('✅ ClickUp authentication successful');
    res.redirect('/?clickup_auth=success');

  } catch (error) {
    console.error('❌ Error during ClickUp authentication:', error.response?.data || error.message);
    res.redirect('/?error=clickup_auth_failed');
  }
});

module.exports = router;
