// middleware/devAuth.js
// ✅ Middleware برای قبول توکن‌های Development در حالت توسعه

const isDevelopment = process.env.NODE_ENV === 'development';

const devAuthMiddleware = (req, res, next) => {
  // اگر در حالت production هستیم، middleware عادی authentication را اجرا کن
  if (!isDevelopment) {
    return next();
  }

  const token = req.headers.authorization?.replace('Bearer ', '');
  
  // ✅ توکن‌های Development را بپذیر
  if (token === 'DEV_TOKEN_BYPASS' || token?.startsWith('MOCK_SESSION_')) {
    console.log('🔧 [DEV MODE] Bypassing authentication with token:', token);
    
    // ساخت یک user ساختگی برای request
    req.user = {
      _id: 'DEV_USER_123',
      username: 'DebugPlayer',
      email: 'debug@hogwarts.com',
      house: 'Gryffindor'
    };
    
    return next();
  }

  // در غیر این صورت، middleware عادی authentication را اجرا کن
  next();
};

module.exports = devAuthMiddleware;

// ============================================
// استفاده در route ها:
// ============================================

// routes/game.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth'); // middleware عادی
const devAuth = require('../middleware/devAuth'); // middleware جدید

// ✅ استفاده از devAuth قبل از auth
router.post('/player/position', devAuth, auth, async (req, res) => {
  try {
    const { playerId, position } = req.body;
    
    // در حالت Development، از req.user استفاده می‌کنیم
    const userId = req.user._id;
    
    console.log(`📍 Position update from ${req.user.username}:`, position);
    
    // Logic ذخیره position...
    
    res.status(200).json({ 
      success: true, 
      message: 'Position updated',
      dev_mode: process.env.NODE_ENV === 'development'
    });
    
  } catch (error) {
    console.error('❌ Position update error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// تنظیمات .env
// ============================================
/*
# Development
NODE_ENV=development
PORT=3000

# Production
NODE_ENV=production
PORT=3000
JWT_SECRET=your_production_secret_here
*/

module.exports = router;