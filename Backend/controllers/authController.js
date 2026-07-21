import { db } from '../config/db.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

/**
 * Login Controller
 */
export const login = async (req, res) => {
  try {
    const { email, password, companyId } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    let users;
    let user;

    /* =========================
       SUPER ADMIN LOGIN
    ========================= */
    if (email.includes('superadmin')) {
      [users] = await db.query(
        `SELECT * FROM users 
         WHERE email = ? 
         AND role = 'super_admin' 
         AND isActive = TRUE`,
        [email]
      );

      if (users.length === 0) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }

      user = users[0];
    }

    /* =========================
       NORMAL USER LOGIN
    ========================= */
    else {
      if (!companyId) {
        return res.status(400).json({
          success: false,
          message: 'Company selection is required'
        });
      }

      [users] = await db.query(
        `SELECT * FROM users 
         WHERE email = ? 
         AND companyId = ? 
         AND isActive = TRUE`,
        [email, companyId]
      );

      if (users.length === 0) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials or access denied'
        });
      }

      user = users[0];
    }

    /* =========================
       PASSWORD CHECK (FIXED)
    ========================= */
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    /* =========================
       JWT TOKEN
    ========================= */
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
        companyId: user.companyId
      },
      process.env.AUTH_SECRET,
      { expiresIn: '24h' }
    );

    return res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          companyId: user.companyId
        },
        token
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during login',
      error: process.env.NODE_ENV === 'dev' ? error.message : undefined
    });
  }
};

/**
 * Get All Active Companies
 */
export const getCompanies = async (req, res) => {
  try {
    const [companies] = await db.query(
      `SELECT id, name, city, state 
       FROM companies 
       WHERE isActive = TRUE 
       ORDER BY name ASC`
    );

    return res.json({
      success: true,
      data: companies
    });
  } catch (error) {
    console.error('Get companies error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error fetching companies'
    });
  }
};

/**
 * Verify JWT Token
 */
export const verifyToken = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }

    const decoded = jwt.verify(token, process.env.AUTH_SECRET);

    const [users] = await db.query(
      `SELECT id, email, role, companyId 
       FROM users 
       WHERE id = ? AND isActive = TRUE`,
      [decoded.userId]
    );

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }

    return res.json({
      success: true,
      data: {
        user: users[0]
      }
    });

  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
};

/**
 * Get User Profile
 */
export const getUserProfile = async (req, res) => {
  try {
    const userId = req.user.userId;

    const [users] = await db.query(
      `
      SELECT 
        u.id, u.email, u.role, u.companyId, u.isActive,
        c.name AS companyName,
        e.employeeNo, e.name AS employeeName, e.mobile,
        e.departmentId, e.designationId
      FROM users u
      LEFT JOIN companies c ON u.companyId = c.id
      LEFT JOIN employees e ON u.id = e.userId
      WHERE u.id = ? AND u.isActive = TRUE
      `,
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    return res.json({
      success: true,
      data: users[0]
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Server error fetching user profile'
    });
  }
};

/**
 * Logout
 */
export const logout = async (req, res) => {


  return res.json({
    success: true,
    message: "Logout successful"
  })
};