const jwt = require('jsonwebtoken');
const { google } = require('googleapis');

const JWT_SECRET = process.env.JWT_SECRET || 'autotask-jwt-secret-key-for-development';
const JWT_EXPIRES_IN = '24h';

/**
 * Generate a JWT token with user data
 * @param {Object} payload - User data to encode in token
 * @returns {string} JWT token
 */
function generateToken(payload) {
  // Remove JWT-specific properties to avoid conflicts
  const cleanPayload = { ...payload };
  delete cleanPayload.iat; // issued at
  delete cleanPayload.exp; // expiration
  delete cleanPayload.iss; // issuer
  delete cleanPayload.aud; // audience
  delete cleanPayload.sub; // subject
  delete cleanPayload.jti; // JWT ID

  try {
    const token = jwt.sign(cleanPayload, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
      issuer: 'autotask-ai'
    });
    return token;
  } catch (error) {
    console.error('❌ JWT token generation failed:', error);
    throw error;
  }
}

/**
 * Verify and decode a JWT token
 * @param {string} token - JWT token to verify
 * @returns {Object|null} Decoded payload or null if invalid
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    console.error('❌ JWT verification failed:', error.message);
    return null;
  }
}

/**
 * Extract JWT token from request cookies
 * @param {Object} req - Express request object
 * @returns {string|null} JWT token or null if not found
 */
function extractTokenFromRequest(req) {
  // Try to get token from cookies first
  if (req.cookies && req.cookies.authToken) {
    return req.cookies.authToken;
  }

  // Fallback to Authorization header
  const authHeader = req.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  return null;
}

/**
 * Refresh Google access token if expired
 * @param {Object} tokens - Google tokens object
 * @returns {Object} Updated tokens object
 */
async function refreshGoogleTokenIfNeeded(tokens) {
  if (!tokens || !tokens.expiry_date) {
    return tokens;
  }

  // Check if token expires within the next 5 minutes
  const fiveMinutesFromNow = Date.now() + (5 * 60 * 1000);
  if (tokens.expiry_date > fiveMinutesFromNow) {
    return tokens; // Token is still valid
  }

  try {
    console.log('🔄 Refreshing Google access token...');
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    oauth2Client.setCredentials(tokens);
    const { credentials } = await oauth2Client.refreshAccessToken();

    const updatedTokens = {
      access_token: credentials.access_token,
      refresh_token: credentials.refresh_token || tokens.refresh_token,
      expiry_date: credentials.expiry_date,
      scope: tokens.scope,
      token_type: tokens.token_type
    };

    console.log('✅ Google access token refreshed successfully');
    return updatedTokens;
  } catch (error) {
    console.error('❌ Failed to refresh Google token:', error.message);
    return tokens; // Return original tokens if refresh fails
  }
}

/**
 * Middleware to verify JWT token and attach user data to request
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
async function authenticateToken(req, res, next) {
  const token = extractTokenFromRequest(req);

  if (!token) {
    req.user = null;
    req.isAuthenticated = false;
    return next();
  }

  const decoded = verifyToken(token);
  if (decoded) {
    req.user = decoded;
    req.isAuthenticated = true;

    // Refresh Google tokens if needed
    if (decoded.tokens) {
      try {
        const refreshedTokens = await refreshGoogleTokenIfNeeded(decoded.tokens);

        // If tokens were refreshed, update the JWT token
        if (refreshedTokens !== decoded.tokens) {
          const updatedPayload = { ...decoded, tokens: refreshedTokens };
          const newToken = generateToken(updatedPayload);

          // Set the updated token as a cookie
          res.cookie('authToken', newToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
          });

          // Update the user object with refreshed tokens
          req.user = updatedPayload;
          console.log('🔄 JWT token updated with refreshed Google tokens');
        }
      } catch (error) {
        console.error('❌ Error during token refresh:', error);
        // Continue with existing tokens if refresh fails
      }
    }

    // Only log auth for important routes
    if (req.path === '/' || req.path.includes('/emails/') || req.path.includes('/clickup/')) {
      console.log(`🔐 JWT Auth successful for: ${decoded.email}`);
    }
  } else {
    req.user = null;
    req.isAuthenticated = false;
    console.log('❌ JWT Auth failed: Invalid token');
  }

  next();
}

/**
 * Middleware to require authentication
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function requireAuth(req, res, next) {
  if (!req.isAuthenticated) {
    return res.status(401).json({
      error: 'Not authenticated',
      details: 'Valid JWT token required. Please login again.'
    });
  }
  next();
}

module.exports = {
  generateToken,
  verifyToken,
  extractTokenFromRequest,
  authenticateToken,
  requireAuth,
  refreshGoogleTokenIfNeeded
};
