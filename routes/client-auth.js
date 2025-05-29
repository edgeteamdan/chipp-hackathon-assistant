const express = require('express');
const { google } = require('googleapis');
const axios = require('axios');
const router = express.Router();

// Generate Google OAuth URL with client-provided credentials
router.post('/google/url', (req, res) => {
  const { googleClientId, googleClientSecret } = req.body;

  if (!googleClientId || !googleClientSecret) {
    return res.status(400).json({ error: 'Google credentials required' });
  }

  try {
    // Build redirect URI dynamically based on current request
    const protocol = req.get('x-forwarded-proto') || req.protocol; // Handle Vercel proxy
    const host = req.get('host');
    const redirectUri = `${protocol}://${host}/client-auth/google/callback`;

    console.log(`🔗 Google OAuth redirect URI: ${redirectUri}`);

    const oauth2Client = new google.auth.OAuth2(
      googleClientId,
      googleClientSecret,
      redirectUri
    );

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/userinfo.profile',
        'https://www.googleapis.com/auth/userinfo.email'
      ],
      state: JSON.stringify({ googleClientId, googleClientSecret })
    });

    res.json({ authUrl });
  } catch (error) {
    console.error('Error generating Google auth URL:', error);
    res.status(500).json({ error: 'Failed to generate auth URL' });
  }
});

// Handle Google OAuth callback with client credentials
router.get('/google/callback', async (req, res) => {
  const { code, state } = req.query;

  if (!code || !state) {
    return res.redirect('/?error=auth_failed');
  }

  try {
    const { googleClientId, googleClientSecret } = JSON.parse(state);

    // Build redirect URI dynamically (same as in URL generation)
    const protocol = req.get('x-forwarded-proto') || req.protocol;
    const host = req.get('host');
    const redirectUri = `${protocol}://${host}/client-auth/google/callback`;

    const oauth2Client = new google.auth.OAuth2(
      googleClientId,
      googleClientSecret,
      redirectUri
    );

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Get user info
    const oauth2 = google.oauth2({
      auth: oauth2Client,
      version: 'v2'
    });

    const userInfo = await oauth2.userinfo.get();

    // Store in session with client credentials
    req.session.tokens = tokens;
    req.session.user = {
      id: userInfo.data.id,
      email: userInfo.data.email,
      name: userInfo.data.name,
      picture: userInfo.data.picture
    };
    req.session.clientCredentials = {
      googleClientId,
      googleClientSecret
    };

    // Explicitly save session to ensure persistence
    req.session.save((err) => {
      if (err) {
        console.error('❌ Error saving session:', err);
        return res.redirect('/?error=session_save_failed');
      }

      console.log(`✅ User authenticated with client credentials: ${userInfo.data.email}`);
      console.log(`🔒 Session saved with ID: ${req.sessionID}`);
      res.redirect('/');
    });
  } catch (error) {
    console.error('❌ Error during client authentication:', error);
    res.redirect('/?error=auth_failed');
  }
});

// Generate ClickUp OAuth URL with client-provided credentials
router.post('/clickup/url', (req, res) => {
  const { clickupClientId } = req.body;

  if (!clickupClientId) {
    return res.status(400).json({ error: 'ClickUp Client ID required' });
  }

  if (!req.session.user) {
    return res.status(401).json({ error: 'Google authentication required first' });
  }

  try {
    // Build redirect URI dynamically based on current request
    const protocol = req.get('x-forwarded-proto') || req.protocol;
    const host = req.get('host');
    const redirectUri = `${protocol}://${host}/client-auth/clickup/callback`;

    console.log(`🔗 ClickUp OAuth redirect URI: ${redirectUri}`);

    const authUrl = `https://app.clickup.com/api?client_id=${clickupClientId}&redirect_uri=${encodeURIComponent(redirectUri)}`;

    res.json({ authUrl });
  } catch (error) {
    console.error('Error generating ClickUp auth URL:', error);
    res.status(500).json({ error: 'Failed to generate auth URL' });
  }
});

// Handle ClickUp OAuth callback with client credentials
router.get('/clickup/callback', async (req, res) => {
  const { code } = req.query;

  if (!req.session.user) {
    return res.redirect('/?error=auth_required');
  }

  if (!code) {
    return res.redirect('/?error=clickup_no_code');
  }

  try {
    // Get client credentials from session or request
    const clickupClientId = req.session.pendingClickUpAuth?.clientId;
    const clickupClientSecret = req.session.pendingClickUpAuth?.clientSecret;

    if (!clickupClientId || !clickupClientSecret) {
      throw new Error('ClickUp credentials not found in session');
    }

    // Exchange code for access token
    const tokenResponse = await axios.post('https://api.clickup.com/api/v2/oauth/token', {
      client_id: clickupClientId,
      client_secret: clickupClientSecret,
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

    // Get user's teams/workspaces
    const teamsResponse = await axios.get('https://api.clickup.com/api/v2/team', {
      headers: {
        'Authorization': access_token,
        'Content-Type': 'application/json'
      }
    });

    const teams = teamsResponse.data.teams || [];

    // Store ClickUp data in session
    req.session.clickup = {
      access_token,
      teams,
      configured: false
    };

    // Clear pending auth
    delete req.session.pendingClickUpAuth;

    // Explicitly save session to ensure persistence
    req.session.save((err) => {
      if (err) {
        console.error('❌ Error saving ClickUp session:', err);
        return res.redirect('/?error=clickup_session_save_failed');
      }

      console.log('✅ ClickUp authentication successful with client credentials');
      console.log(`🔒 ClickUp session saved with ID: ${req.sessionID}`);
      res.redirect('/?clickup_auth=success');
    });

  } catch (error) {
    console.error('❌ Error during ClickUp client authentication:', error);
    res.redirect('/?error=clickup_auth_failed');
  }
});

// Store ClickUp credentials temporarily for OAuth flow
router.post('/clickup/prepare', (req, res) => {
  const { clickupClientId, clickupClientSecret } = req.body;

  if (!clickupClientId || !clickupClientSecret) {
    return res.status(400).json({ error: 'ClickUp credentials required' });
  }

  if (!req.session.user) {
    return res.status(401).json({ error: 'Google authentication required first' });
  }

  // Store credentials temporarily for the OAuth flow
  req.session.pendingClickUpAuth = {
    clientId: clickupClientId,
    clientSecret: clickupClientSecret
  };

  // Explicitly save session to ensure persistence
  req.session.save((err) => {
    if (err) {
      console.error('❌ Error saving ClickUp preparation session:', err);
      return res.status(500).json({ error: 'Failed to save session' });
    }

    console.log(`🔒 ClickUp credentials prepared and session saved with ID: ${req.sessionID}`);
    res.json({ success: true, message: 'ClickUp credentials prepared for OAuth' });
  });
});

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
};

// ClickUp workspace management routes
router.get('/clickup/workspaces', isAuthenticated, async (req, res) => {
  if (!req.session.clickup?.access_token) {
    return res.status(401).json({ error: 'ClickUp not authenticated' });
  }

  try {
    const { access_token, teams } = req.session.clickup;
    const workspaces = [];

    // Get spaces and lists for each team
    for (const team of teams) {
      console.log(`📂 Getting spaces for team: ${team.name}`);

      const spacesResponse = await axios.get(`https://api.clickup.com/api/v2/team/${team.id}/space`, {
        headers: {
          'Authorization': access_token,
          'Content-Type': 'application/json'
        }
      });

      const spaces = spacesResponse.data.spaces || [];

      for (const space of spaces) {
        console.log(`📁 Getting lists for space: ${space.name}`);

        const listsResponse = await axios.get(`https://api.clickup.com/api/v2/space/${space.id}/list`, {
          headers: {
            'Authorization': access_token,
            'Content-Type': 'application/json'
          }
        });

        const lists = listsResponse.data.lists || [];

        workspaces.push({
          team: {
            id: team.id,
            name: team.name
          },
          space: {
            id: space.id,
            name: space.name
          },
          lists: lists.map(list => ({
            id: list.id,
            name: list.name
          }))
        });
      }
    }

    console.log(`✅ Retrieved ${workspaces.length} workspaces with lists`);
    res.json({ workspaces });

  } catch (error) {
    console.error('❌ Error fetching ClickUp workspaces:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch workspaces' });
  }
});

// Configure default list for task creation
router.post('/clickup/configure', isAuthenticated, async (req, res) => {
  const { listId, listName, spaceName, teamName, reset } = req.body;

  // Handle reset configuration
  if (reset) {
    if (req.session.clickup) {
      req.session.clickup.configured = false;
      req.session.clickup.defaultList = null;
    }
    console.log('🔄 ClickUp configuration reset');
    return res.json({ success: true, message: 'Configuration reset' });
  }

  if (!listId) {
    return res.status(400).json({ error: 'List ID is required' });
  }

  if (!req.session.clickup?.access_token) {
    return res.status(401).json({ error: 'ClickUp not authenticated' });
  }

  try {
    // Update session with configuration
    req.session.clickup.configured = true;
    req.session.clickup.defaultList = {
      id: listId,
      name: listName,
      spaceName,
      teamName
    };

    // Explicitly save session to ensure persistence
    req.session.save((err) => {
      if (err) {
        console.error('❌ Error saving ClickUp configuration session:', err);
        return res.status(500).json({ error: 'Failed to save session' });
      }

      console.log(`✅ ClickUp configured - Default list: ${listName} (${listId})`);
      console.log(`🔒 ClickUp configuration session saved with ID: ${req.sessionID}`);
      res.json({
        success: true,
        message: 'ClickUp configuration saved',
        defaultList: req.session.clickup.defaultList
      });
    });

  } catch (error) {
    console.error('❌ Error configuring ClickUp:', error);
    res.status(500).json({ error: 'Failed to save configuration' });
  }
});

module.exports = router;
