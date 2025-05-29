const express = require('express');
const { google } = require('googleapis');
const axios = require('axios');
const { generateToken, requireAuth } = require('../utils/jwt');
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
      prompt: 'select_account', // Force account selection screen
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

    // Create JWT token with user data and credentials
    const tokenPayload = {
      id: userInfo.data.id,
      email: userInfo.data.email,
      name: userInfo.data.name,
      picture: userInfo.data.picture,
      tokens: tokens,
      clientCredentials: {
        googleClientId,
        googleClientSecret
      }
    };

    const jwtToken = generateToken(tokenPayload);

    // Set JWT token as HTTP-only cookie
    res.cookie('authToken', jwtToken, {
      httpOnly: true,
      secure: false, // Set to true in production with HTTPS
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });

    console.log(`✅ User authenticated with client credentials: ${userInfo.data.email}`);
    console.log(`🔒 JWT token generated and set as cookie`);
    res.redirect('/');
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

  if (!req.isAuthenticated) {
    return res.status(401).json({ error: 'Google authentication required first' });
  }

  try {
    // Build redirect URI dynamically based on current request
    const protocol = req.get('x-forwarded-proto') || req.protocol;
    const host = req.get('host');
    const redirectUri = `${protocol}://${host}/client-auth/clickup/callback?popup=true`;

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

  if (!req.isAuthenticated) {
    return res.redirect('/?error=auth_required');
  }

  if (!code) {
    return res.redirect('/?error=clickup_no_code');
  }

  try {
    // Get client credentials from JWT token
    const clickupClientId = req.user.pendingClickUpAuth?.clientId;
    const clickupClientSecret = req.user.pendingClickUpAuth?.clientSecret;

    if (!clickupClientId || !clickupClientSecret) {
      throw new Error('ClickUp credentials not found in token');
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

    // Update JWT token with ClickUp data
    const updatedPayload = {
      ...req.user,
      clickup: {
        access_token,
        teams,
        configured: false
      }
    };

    // Clear pending auth
    delete updatedPayload.pendingClickUpAuth;

    const newJwtToken = generateToken(updatedPayload);

    // Update JWT token cookie
    res.cookie('authToken', newJwtToken, {
      httpOnly: true,
      secure: false, // Set to true in production with HTTPS
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });

    console.log('✅ ClickUp authentication successful with client credentials');
    console.log(`🔒 JWT token updated with ClickUp data`);

    // Also store in memory to bypass JWT cookie timing issues
    const userId = req.user.id || req.user.email;
    if (global.userDataStore) {
      const existingData = global.userDataStore.get(userId) || {};
      const clickupData = {
        access_token,
        teams,
        configured: false
      };
      global.userDataStore.set(userId, {
        ...existingData,
        clickup: clickupData
      });
      console.log(`💾 Stored ClickUp data in memory for user: ${userId} - Teams: ${teams?.length || 0}, Access Token: ${!!access_token}`);
    }

    // Check if this is a popup request (has a specific header or query param)
    const isPopup = req.query.popup === 'true' || req.headers['x-popup-request'] === 'true';

    if (isPopup) {
      // Return a simple HTML page that communicates with the parent window
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>ClickUp Authentication</title>
        </head>
        <body>
          <script>
            // Send success message to parent window
            if (window.opener) {
              window.opener.postMessage({
                type: 'clickup-auth-success',
                clickup: {
                  access_token: true,
                  teams: ${JSON.stringify(teams)},
                  configured: false
                }
              }, window.location.origin);
              window.close();
            } else {
              // Fallback: redirect to main page with success message
              window.location.href = '/?clickup_auth=success';
            }
          </script>
          <p>ClickUp authentication successful! This window should close automatically.</p>
        </body>
        </html>
      `);
    } else {
      // Return JSON response for direct API calls
      res.json({
        success: true,
        message: 'ClickUp authentication successful',
        clickup: {
          access_token: !!access_token,
          teams: teams,
          configured: false
        },
        // Include the new JWT token in the response for immediate use
        newToken: newJwtToken
      });
    }

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

  if (!req.isAuthenticated) {
    return res.status(401).json({ error: 'Google authentication required first' });
  }

  // Update JWT token with pending ClickUp credentials
  const updatedPayload = {
    ...req.user,
    pendingClickUpAuth: {
      clientId: clickupClientId,
      clientSecret: clickupClientSecret
    }
  };

  const newJwtToken = generateToken(updatedPayload);

  // Update JWT token cookie
  res.cookie('authToken', newJwtToken, {
    httpOnly: true,
    secure: false, // Set to true in production with HTTPS
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  });

  console.log(`🔒 ClickUp credentials prepared and JWT token updated`);
  res.json({ success: true, message: 'ClickUp credentials prepared for OAuth' });
});

// Middleware to check if user is authenticated (using JWT)
const isAuthenticated = (req, res, next) => {
  if (!req.isAuthenticated) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
};

// ClickUp workspace management routes
router.get('/clickup/workspaces', isAuthenticated, async (req, res) => {
  console.log('🌐 Workspaces endpoint called');

  // Check in-memory store first, then fall back to JWT token
  const userId = req.user.id || req.user.email;
  const storedData = global.userDataStore?.get(userId);
  const clickupData = storedData?.clickup || req.user.clickup;

  console.log(`🔍 ClickUp data source: ${storedData?.clickup ? 'from store' : 'from JWT'}`);
  console.log(`🔍 ClickUp access_token exists: ${!!clickupData?.access_token}`);

  if (!clickupData?.access_token) {
    console.log('❌ ClickUp not authenticated - no access token found');
    return res.status(401).json({ error: 'ClickUp not authenticated' });
  }

  try {
    const { access_token, teams } = clickupData;
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

  console.log('⚙️ Configure endpoint called');

  // Check in-memory store first, then fall back to JWT token
  const userId = req.user.id || req.user.email;
  const storedData = global.userDataStore?.get(userId);
  const clickupData = storedData?.clickup || req.user.clickup;

  console.log(`🔍 ClickUp data source: ${storedData?.clickup ? 'from store' : 'from JWT'}`);
  console.log(`🔍 ClickUp access_token exists: ${!!clickupData?.access_token}`);

  // Handle reset configuration
  if (reset) {
    console.log('🔄 Resetting ClickUp configuration...');

    if (clickupData) {
      const updatedPayload = {
        ...req.user,
        clickup: {
          ...clickupData,
          configured: false,
          defaultList: null
        }
      };

      const newJwtToken = generateToken(updatedPayload);
      res.cookie('authToken', newJwtToken, {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000
      });

      // Also update in-memory store
      if (global.userDataStore && storedData) {
        global.userDataStore.set(userId, {
          ...storedData,
          clickup: {
            ...clickupData,
            configured: false,
            defaultList: null
          }
        });
        console.log(`💾 Reset ClickUp configuration in memory store for user: ${userId}`);
      }

      console.log('✅ ClickUp configuration reset successfully');
      return res.json({
        success: true,
        message: 'Configuration reset',
        newToken: newJwtToken
      });
    }

    console.log('🔄 ClickUp configuration reset (no data to update)');
    return res.json({ success: true, message: 'Configuration reset' });
  }

  if (!listId) {
    return res.status(400).json({ error: 'List ID is required' });
  }

  if (!clickupData?.access_token) {
    console.log('❌ ClickUp not authenticated - no access token found');
    return res.status(401).json({ error: 'ClickUp not authenticated' });
  }

  try {
    // Update JWT token with configuration
    const updatedPayload = {
      ...req.user,
      clickup: {
        ...clickupData,
        configured: true,
        defaultList: {
          id: listId,
          name: listName,
          spaceName,
          teamName
        }
      }
    };

    const newJwtToken = generateToken(updatedPayload);

    // Update JWT token cookie
    res.cookie('authToken', newJwtToken, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000
    });

    console.log(`✅ ClickUp configured - Default list: ${listName} (${listId})`);
    console.log(`🔒 ClickUp configuration saved in JWT token`);

    // Also store in memory to bypass JWT cookie timing issues
    const userId = req.user.id || req.user.email;
    if (global.userDataStore) {
      const existingData = global.userDataStore.get(userId) || {};
      global.userDataStore.set(userId, {
        ...existingData,
        clickup: updatedPayload.clickup
      });
      console.log(`💾 Stored ClickUp configuration in memory for user: ${userId}`);
    }

    res.json({
      success: true,
      message: 'ClickUp configuration saved',
      defaultList: updatedPayload.clickup.defaultList,
      // Include the new JWT token in the response for immediate use
      newToken: newJwtToken
    });

  } catch (error) {
    console.error('❌ Error configuring ClickUp:', error);
    res.status(500).json({ error: 'Failed to save configuration' });
  }
});

module.exports = router;
