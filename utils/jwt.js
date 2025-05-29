const jwt = require('jsonwebtoken');

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

  return jwt.sign(cleanPayload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
    issuer: 'autotask-ai'
  });
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
 * Middleware to verify JWT token and attach user data to request
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function authenticateToken(req, res, next) {
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
    console.log(`🔐 JWT Auth successful for: ${decoded.email}`);
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
  requireAuth
};
