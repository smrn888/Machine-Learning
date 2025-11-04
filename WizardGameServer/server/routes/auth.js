// auth.js - Authentication routes for login, register, and session management
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const PlayerModel = require('../models/PlayerModel');

// ===== Configuration =====
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRY = '7d';
const SALT_ROUNDS = 10;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_TIME = 15 * 60 * 1000;
const isDevelopment = process.env.NODE_ENV === 'development';

// ===== Middleware =====

// ✅ FIXED: Authenticate JWT token با پشتیبانی از Development Mode
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
    
    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }
    
    console.log('🔑 [AUTH] Token received:', token.substring(0, 30) + '...');
    
    // ============================================
    // ✅ بررسی توکن‌های Development
    // ============================================
    
    if (isDevelopment) {
        // ✅ توکن‌های Mock را بپذیر
        if (token === 'DEV_TOKEN_BYPASS' || 
            token.startsWith('MOCK_SESSION_') || 
            token.startsWith('MOCK_')) {
            
            console.log('✅ [AUTH] Development token accepted');
            
            // ساخت user ساختگی
            req.user = {
                playerId: token.includes('MOCK_SESSION_') ? 
                         token.replace('MOCK_SESSION_', 'PLAYER_') : 
                         'PLAYER_' + Math.random().toString(36).substr(2, 9),
                username: 'DebugPlayer',
                _id: 'DEV_USER_' + token.slice(-8)
            };
            
            console.log('👤 [AUTH] Mock user created:', req.user.username);
            return next();
        }
    }
    
    // ============================================
    // ✅ احراز هویت عادی برای توکن‌های واقعی
    // ============================================
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            console.error('❌ [AUTH] JWT verification failed:', err.message);
            return res.status(403).json({ error: 'Invalid or expired token' });
        }
        
        console.log('✅ [AUTH] Real user authenticated:', user.username || user.playerId);
        req.user = user;
        next();
    });
}

// ===== Register =====
router.post('/register', async (req, res) => {
    try {
        const { username, email, password, house } = req.body;
        
        // Validation
        if (!username || !email || !password) {
            return res.status(400).json({ 
                error: 'Username, email, and password are required' 
            });
        }
        
        // Username validation
        if (username.length < 3 || username.length > 20) {
            return res.status(400).json({ 
                error: 'Username must be between 3 and 20 characters' 
            });
        }
        
        // Password validation
        if (password.length < 6) {
            return res.status(400).json({ 
                error: 'Password must be at least 6 characters' 
            });
        }
        
        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ 
                error: 'Invalid email format' 
            });
        }
        
        // Check if username already exists
        const existingUsername = await PlayerModel.findByUsername(username);
        if (existingUsername) {
            return res.status(409).json({ 
                error: 'Username already taken' 
            });
        }
        
        // Check if email already exists
        const existingEmail = await PlayerModel.findByEmail(email);
        if (existingEmail) {
            return res.status(409).json({ 
                error: 'Email already registered' 
            });
        }
        
        // Hash password
        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

        // Generate unique player ID
        const playerId = uuidv4();
        
        // Create new player
        const newPlayer = new PlayerModel({
            playerId,
            username,
            email,
            house: house || 'Gryffindor',
            passwordHash,
            quests: { active: [], completed: [] },
            createdAt: new Date(),
            lastLogin: new Date()
        });
        
        await newPlayer.save();
        
        // Generate JWT token
        const token = jwt.sign(
            { 
                playerId: newPlayer.playerId, 
                username: newPlayer.username 
            },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRY }
        );
        
        // Save session token
        newPlayer.currentSessionToken = token;
        newPlayer.sessionExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await newPlayer.save();
        
        console.log(`✅ New player registered: ${username} (${playerId})`);
        
        res.status(201).json({
            success: true,
            message: 'Registration successful',
            token,
            playerId: newPlayer.playerId,
            username: newPlayer.username
        });
        
    } catch (error) {
        console.error('❌ Registration error:', error);
        res.status(500).json({ 
            error: 'Registration failed. Please try again.' 
        });
    }
});

// ===== Login =====
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        // Validation
        if (!username || !password) {
            return res.status(400).json({ 
                error: 'Username and password are required' 
            });
        }
        
        // Find player
        const player = await PlayerModel.findByUsername(username);
        
        if (!player) {
            return res.status(401).json({ 
                error: 'Invalid username or password' 
            });
        }
        
        // Check if account is locked
        if (player.accountLocked) {
            if (player.lockExpiry && player.lockExpiry > Date.now()) {
                const minutesLeft = Math.ceil((player.lockExpiry - Date.now()) / 60000);
                return res.status(423).json({ 
                    error: `Account locked. Try again in ${minutesLeft} minutes.` 
                });
            } else {
                // Unlock account
                player.accountLocked = false;
                player.loginAttempts = 0;
                player.lockExpiry = null;
            }
        }
        
        // Verify password
        const isPasswordValid = await bcrypt.compare(password, player.passwordHash);
        
        if (!isPasswordValid) {
            // Increment failed login attempts
            player.loginAttempts += 1;
            
            if (player.loginAttempts >= MAX_LOGIN_ATTEMPTS) {
                player.accountLocked = true;
                player.lockExpiry = new Date(Date.now() + LOCK_TIME);
                await player.save();
                
                return res.status(423).json({ 
                    error: 'Too many failed attempts. Account locked for 15 minutes.' 
                });
            }
            
            await player.save();
            
            return res.status(401).json({ 
                error: 'Invalid username or password',
                attemptsRemaining: MAX_LOGIN_ATTEMPTS - player.loginAttempts
            });
        }
        
        // Successful login - reset attempts
        player.loginAttempts = 0;
        player.lastLogin = new Date();
        
        // Generate new JWT token
        const token = jwt.sign(
            { 
                playerId: player.playerId, 
                username: player.username 
            },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRY }
        );
        
        // Save session
        player.currentSessionToken = token;
        player.sessionExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await player.save();
        
        console.log(`✅ Player logged in: ${username}`);
        
        res.json({
            success: true,
            message: 'Login successful',
            token,
            playerId: player.playerId,
            username: player.username,
            house: player.house,
            needsSorting: !player.sortingHatData.hasBeenSorted
        });
        
    } catch (error) {
        console.error('❌ Login error:', error);
        res.status(500).json({ 
            error: 'Login failed. Please try again.' 
        });
    }
});

// ===== Logout =====
router.post('/logout', authenticateToken, async (req, res) => {
    try {
        const { playerId } = req.user;
        
        const player = await PlayerModel.findOne({ playerId });
        
        if (player) {
            player.currentSessionToken = null;
            player.sessionExpiry = null;
            await player.save();
        }
        
        console.log(`✅ Player logged out: ${player?.username || playerId}`);
        
        res.json({ 
            success: true, 
            message: 'Logout successful' 
        });
        
    } catch (error) {
        console.error('❌ Logout error:', error);
        res.status(500).json({ 
            error: 'Logout failed' 
        });
    }
});

// ===== Validate Session =====
router.get('/validate', authenticateToken, async (req, res) => {
    try {
        const { playerId } = req.user;
        
        const player = await PlayerModel.findOne({ playerId });
        
        if (!player) {
            return res.status(404).json({ 
                valid: false, 
                error: 'Player not found' 
            });
        }
        
        // Check if session is still valid
        if (player.sessionExpiry && player.sessionExpiry < Date.now()) {
            return res.status(401).json({ 
                valid: false, 
                error: 'Session expired' 
            });
        }
        
        res.json({ 
            valid: true,
            playerId: player.playerId,
            username: player.username,
            house: player.house
        });
        
    } catch (error) {
        console.error('❌ Validation error:', error);
        res.status(500).json({ 
            valid: false, 
            error: 'Validation failed' 
        });
    }
});

// ===== Refresh Token =====
router.post('/refresh', authenticateToken, async (req, res) => {
    try {
        const { playerId } = req.user;
        
        const player = await PlayerModel.findOne({ playerId });
        
        if (!player) {
            return res.status(404).json({ 
                error: 'Player not found' 
            });
        }
        
        // Generate new token
        const newToken = jwt.sign(
            { 
                playerId: player.playerId, 
                username: player.username 
            },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRY }
        );
        
        player.currentSessionToken = newToken;
        player.sessionExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await player.save();
        
        console.log(`✅ Token refreshed for: ${player.username}`);
        
        res.json({ 
            success: true,
            token: newToken 
        });
        
    } catch (error) {
        console.error('❌ Token refresh error:', error);
        res.status(500).json({ 
            error: 'Token refresh failed' 
        });
    }
});

// ===== Change Password =====
router.post('/change-password', authenticateToken, async (req, res) => {
    try {
        const { playerId } = req.user;
        const { currentPassword, newPassword } = req.body;
        
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ 
                error: 'Current and new password required' 
            });
        }
        
        if (newPassword.length < 6) {
            return res.status(400).json({ 
                error: 'New password must be at least 6 characters' 
            });
        }
        
        const player = await PlayerModel.findOne({ playerId });
        
        if (!player) {
            return res.status(404).json({ 
                error: 'Player not found' 
            });
        }
        
        // Verify current password
        const isValid = await bcrypt.compare(currentPassword, player.passwordHash);
        
        if (!isValid) {
            return res.status(401).json({ 
                error: 'Current password is incorrect' 
            });
        }
        
        // Hash new password
        const newPasswordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
        player.passwordHash = newPasswordHash;
        await player.save();
        
        console.log(`✅ Password changed for: ${player.username}`);
        
        res.json({ 
            success: true, 
            message: 'Password changed successfully' 
        });
        
    } catch (error) {
        console.error('❌ Password change error:', error);
        res.status(500).json({ 
            error: 'Password change failed' 
        });
    }
});

// ===== Delete Account =====
router.delete('/delete-account', authenticateToken, async (req, res) => {
    try {
        const { playerId } = req.user;
        const { password } = req.body;
        
        if (!password) {
            return res.status(400).json({ 
                error: 'Password required to delete account' 
            });
        }
        
        const player = await PlayerModel.findOne({ playerId });
        
        if (!player) {
            return res.status(404).json({ 
                error: 'Player not found' 
            });
        }
        
        // Verify password
        const isValid = await bcrypt.compare(password, player.passwordHash);
        
        if (!isValid) {
            return res.status(401).json({ 
                error: 'Incorrect password' 
            });
        }
        
        const username = player.username;
        await PlayerModel.deleteOne({ playerId });
        
        console.log(`✅ Account deleted: ${username}`);
        
        res.json({ 
            success: true, 
            message: 'Account deleted successfully' 
        });
        
    } catch (error) {
        console.error('❌ Account deletion error:', error);
        res.status(500).json({ 
            error: 'Account deletion failed' 
        });
    }
});

// ===== Export =====
module.exports = { router, authenticateToken };