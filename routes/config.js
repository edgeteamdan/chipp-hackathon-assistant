const express = require('express');
const router = express.Router();

// Get client configuration (returns empty object since we're using client-side storage)
router.get('/client', (req, res) => {
  // Return empty config - all settings are stored client-side
  res.json({
    hasChippKey: false,
    hasGoogleCredentials: false,
    hasClickUpCredentials: false,
    message: 'Configuration is stored locally in your browser'
  });
});

// Get current callback URLs for OAuth setup
router.get('/callback-urls', (req, res) => {
  const protocol = req.get('x-forwarded-proto') || req.protocol;
  const host = req.get('host');
  const baseUrl = `${protocol}://${host}`;

  res.json({
    baseUrl,
    google: {
      redirectUri: `${baseUrl}/client-auth/google/callback`,
      instructions: 'Add this URL to your Google Cloud Console OAuth 2.0 credentials'
    },
    clickup: {
      redirectUri: `${baseUrl}/client-auth/clickup/callback`,
      instructions: 'Add this URL to your ClickUp App settings'
    }
  });
});

// Validate client configuration (receives config from client to validate)
router.post('/validate', (req, res) => {
  const { chippApiKey, googleClientId, googleClientSecret, clickupClientId, clickupClientSecret } = req.body;

  const validation = {
    chipp: {
      valid: !!(chippApiKey && chippApiKey.startsWith('live_')),
      message: chippApiKey ? (chippApiKey.startsWith('live_') ? 'Valid' : 'Should start with "live_"') : 'Required'
    },
    google: {
      valid: !!(googleClientId && googleClientSecret && googleClientId.includes('.apps.googleusercontent.com')),
      message: (googleClientId && googleClientSecret) ?
        (googleClientId.includes('.apps.googleusercontent.com') ? 'Valid' : 'Invalid Client ID format') :
        'Both Client ID and Secret required'
    },
    clickup: {
      valid: !!(clickupClientId && clickupClientSecret),
      message: (clickupClientId && clickupClientSecret) ? 'Valid' : 'Both Client ID and Secret required'
    }
  };

  const allValid = validation.chipp.valid && validation.google.valid && validation.clickup.valid;

  res.json({
    valid: allValid,
    validation,
    message: allValid ? 'All configurations are valid' : 'Some configurations need attention'
  });
});

module.exports = router;
