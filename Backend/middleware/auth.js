import jwt from 'jsonwebtoken';

/**
 * JWT Authentication Middleware
 * Validates JWT token and attaches user data to request
 */
export const authenticateToken = (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Format: "Bearer TOKEN"

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access token is required'
      });
    }

    // Verify token
    jwt.verify(token, process.env.AUTH_SECRET, (err, decoded) => {
      if (err) {
        return res.status(403).json({
          success: false,
          message: 'Invalid or expired token'
        });
      }

      // Attach user data to request
      req.user = decoded;
      next();
    });

  } catch (error) {
    console.error('Authentication middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentication error'
    });
  }
};

/**
 * Role-Based Authorization Middleware
 * Checks if user has required role
 */
export const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to access this resource'
      });
    }

    next();
  };
};

/**
 * Company Access Middleware
 * Ensures user can only access their company's data
 */
export const checkCompanyAccess = (req, res, next) => {
  try {
    const requestedCompanyId = req.params.companyId || req.body.companyId || req.query.companyId;
    const userCompanyId = req.user.companyId;
    const userRole = req.user.role;

    // Super admin can access all companies
    if (userRole === 'super_admin') {
      return next();
    }

    // Check if user is accessing their own company
    if (requestedCompanyId && requestedCompanyId !== userCompanyId) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this company'
      });
    }

    next();

  } catch (error) {
    console.error('Company access middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authorization error'
    });
  }
};