// utils/encryption.js - Encryption and security utilities
const crypto = require('crypto');
const bcrypt = require('bcrypt');

// ===== Configuration =====
const ALGORITHM = 'aes-256-gcm';
const SALT_ROUNDS = 10;
const TOKEN_LENGTH = 32;
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

class Encryption {
    
    // ===== Password Hashing =====
    
    /**
     * Hash a password using bcrypt
     */
    static async hashPassword(password) {
        try {
            const hash = await bcrypt.hash(password, SALT_ROUNDS);
            return {
                success: true,
                hash: hash
            };
        } catch (error) {
            console.error('❌ Error hashing password:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * Compare password with hash
     */
    static async comparePassword(password, hash) {
        try {
            const isMatch = await bcrypt.compare(password, hash);
            return {
                success: true,
                isMatch: isMatch
            };
        } catch (error) {
            console.error('❌ Error comparing password:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    // ===== Data Encryption/Decryption =====
    
    /**
     * Encrypt data using AES-256-GCM
     */
    static encrypt(data, secretKey) {
        try {
            // Create key from secret
            const key = crypto.scryptSync(secretKey, 'salt', 32);
            
            // Generate random IV
            const iv = crypto.randomBytes(IV_LENGTH);
            
            // Create cipher
            const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
            
            // Convert data to string if needed
            const dataString = typeof data === 'string' ? data : JSON.stringify(data);
            
            // Encrypt
            let encrypted = cipher.update(dataString, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            
            // Get auth tag
            const authTag = cipher.getAuthTag();
            
            // Combine IV + authTag + encrypted data
            const result = iv.toString('hex') + authTag.toString('hex') + encrypted;
            
            return {
                success: true,
                encrypted: result
            };
            
        } catch (error) {
            console.error('❌ Error encrypting data:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * Decrypt data using AES-256-GCM
     */
    static decrypt(encryptedData, secretKey) {
        try {
            // Create key from secret
            const key = crypto.scryptSync(secretKey, 'salt', 32);
            
            // Extract IV, authTag, and encrypted data
            const iv = Buffer.from(encryptedData.slice(0, IV_LENGTH * 2), 'hex');
            const authTag = Buffer.from(encryptedData.slice(IV_LENGTH * 2, (IV_LENGTH + TAG_LENGTH) * 2), 'hex');
            const encrypted = encryptedData.slice((IV_LENGTH + TAG_LENGTH) * 2);
            
            // Create decipher
            const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
            decipher.setAuthTag(authTag);
            
            // Decrypt
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            // Try to parse as JSON
            try {
                const parsed = JSON.parse(decrypted);
                return {
                    success: true,
                    decrypted: parsed
                };
            } catch {
                return {
                    success: true,
                    decrypted: decrypted
                };
            }
            
        } catch (error) {
            console.error('❌ Error decrypting data:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    // ===== Token Generation =====
    
    /**
     * Generate random secure token
     */
    static generateToken(length = TOKEN_LENGTH) {
        return crypto.randomBytes(length).toString('hex');
    }
    
    /**
     * Generate UUID v4
     */
    static generateUUID() {
        return crypto.randomUUID();
    }
    
    /**
     * Generate session token
     */
    static generateSessionToken() {
        const timestamp = Date.now();
        const randomPart = this.generateToken(16);
        return `${timestamp}_${randomPart}`;
    }
    
    // ===== Hashing =====
    
    /**
     * Create SHA256 hash
     */
    static hash(data) {
        const hash = crypto.createHash('sha256');
        hash.update(typeof data === 'string' ? data : JSON.stringify(data));
        return hash.digest('hex');
    }
    
    /**
     * Create HMAC signature
     */
    static createHMAC(data, secret) {
        const hmac = crypto.createHmac('sha256', secret);
        hmac.update(typeof data === 'string' ? data : JSON.stringify(data));
        return hmac.digest('hex');
    }
    
    /**
     * Verify HMAC signature
     */
    static verifyHMAC(data, signature, secret) {
        const expectedSignature = this.createHMAC(data, secret);
        return crypto.timingSafeEqual(
            Buffer.from(signature, 'hex'),
            Buffer.from(expectedSignature, 'hex')
        );
    }
    
    // ===== Input Sanitization =====
    
    /**
     * Sanitize user input (prevent XSS)
     */
    static sanitizeInput(input) {
        if (typeof input !== 'string') {
            return input;
        }
        
        return input
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;')
            .replace(/\//g, '&#x2F;');
    }
    
    /**
     * Sanitize object recursively
     */
    static sanitizeObject(obj) {
        if (typeof obj !== 'object' || obj === null) {
            return this.sanitizeInput(obj);
        }
        
        const sanitized = Array.isArray(obj) ? [] : {};
        
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                sanitized[key] = this.sanitizeObject(obj[key]);
            }
        }
        
        return sanitized;
    }
    
    // ===== Validation =====
    
    /**
     * Validate email format
     */
    static validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }
    
    /**
     * Validate password strength
     */
    static validatePassword(password) {
        const minLength = 6;
        const hasUpperCase = /[A-Z]/.test(password);
        const hasLowerCase = /[a-z]/.test(password);
        const hasNumber = /[0-9]/.test(password);
        const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
        
        const strength = {
            length: password.length >= minLength,
            hasUpperCase: hasUpperCase,
            hasLowerCase: hasLowerCase,
            hasNumber: hasNumber,
            hasSpecial: hasSpecial,
            score: 0
        };
        
        if (strength.length) strength.score += 1;
        if (strength.hasUpperCase) strength.score += 1;
        if (strength.hasLowerCase) strength.score += 1;
        if (strength.hasNumber) strength.score += 1;
        if (strength.hasSpecial) strength.score += 1;
        
        return {
            valid: strength.length && strength.score >= 3,
            strength: strength,
            message: this.getPasswordStrengthMessage(strength.score)
        };
    }
    
    static getPasswordStrengthMessage(score) {
        switch (score) {
            case 0:
            case 1:
                return 'Very Weak';
            case 2:
                return 'Weak';
            case 3:
                return 'Fair';
            case 4:
                return 'Strong';
            case 5:
                return 'Very Strong';
            default:
                return 'Unknown';
        }
    }
    
    /**
     * Validate username
     */
    static validateUsername(username) {
        const minLength = 3;
        const maxLength = 20;
        const usernameRegex = /^[a-zA-Z0-9_]+$/;
        
        if (username.length < minLength) {
            return {
                valid: false,
                error: `Username must be at least ${minLength} characters`
            };
        }
        
        if (username.length > maxLength) {
            return {
                valid: false,
                error: `Username must be at most ${maxLength} characters`
            };
        }
        
        if (!usernameRegex.test(username)) {
            return {
                valid: false,
                error: 'Username can only contain letters, numbers, and underscores'
            };
        }
        
        return {
            valid: true
        };
    }
    
    // ===== Rate Limiting Helpers =====
    
    /**
     * Generate rate limit key
     */
    static generateRateLimitKey(ip, endpoint) {
        return this.hash(`${ip}_${endpoint}`);
    }
    
    /**
     * Check if IP is suspicious
     */
    static isSuspiciousIP(ip) {
        // Add logic to check against blacklist
        // For now, just basic validation
        const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
        const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
        
        return !(ipv4Regex.test(ip) || ipv6Regex.test(ip));
    }
    
    // ===== JWT Helpers =====
    
    /**
     * Create JWT payload hash (for validation)
     */
    static createJWTHash(payload, secret) {
        return this.createHMAC(payload, secret);
    }
    
    // ===== API Key Management =====
    
    /**
     * Generate API key
     */
    static generateAPIKey(prefix = 'wg') {
        const timestamp = Date.now().toString(36);
        const random = this.generateToken(16);
        return `${prefix}_${timestamp}_${random}`;
    }
    
    /**
     * Validate API key format
     */
    static validateAPIKeyFormat(apiKey) {
        const apiKeyRegex = /^[a-z]+_[a-z0-9]+_[a-f0-9]+$/;
        return apiKeyRegex.test(apiKey);
    }
    
    // ===== Data Obfuscation =====
    
    /**
     * Obfuscate email for display
     */
    static obfuscateEmail(email) {
        const [username, domain] = email.split('@');
        
        if (username.length <= 2) {
            return `${username[0]}***@${domain}`;
        }
        
        return `${username.slice(0, 2)}***@${domain}`;
    }
    
    /**
     * Obfuscate player ID
     */
    static obfuscatePlayerId(playerId) {
        if (playerId.length <= 8) {
            return `${playerId.slice(0, 4)}****`;
        }
        
        return `${playerId.slice(0, 4)}****${playerId.slice(-4)}`;
    }
    
    // ===== Random Generation =====
    
    /**
     * Generate random integer between min and max
     */
    static randomInt(min, max) {
        const range = max - min + 1;
        const bytesNeeded = Math.ceil(Math.log2(range) / 8);
        const randomBytes = crypto.randomBytes(bytesNeeded);
        const randomValue = randomBytes.readUIntBE(0, bytesNeeded);
        return min + (randomValue % range);
    }
    
    /**
     * Generate random string
     */
    static randomString(length, charset = 'alphanumeric') {
        const charsets = {
            numeric: '0123456789',
            alpha: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
            alphanumeric: '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
            hex: '0123456789abcdef'
        };
        
        const chars = charsets[charset] || charsets.alphanumeric;
        let result = '';
        
        for (let i = 0; i < length; i++) {
            result += chars[this.randomInt(0, chars.length - 1)];
        }
        
        return result;
    }
    
    // ===== Timing Safe Comparison =====
    
    /**
     * Compare two strings in constant time (prevent timing attacks)
     */
    static timingSafeEqual(a, b) {
        try {
            return crypto.timingSafeEqual(
                Buffer.from(a),
                Buffer.from(b)
            );
        } catch {
            return false;
        }
    }
    
    // ===== Checksum =====
    
    /**
     * Calculate CRC32 checksum
     */
    static crc32(data) {
        const crc32Table = this.makeCRC32Table();
        let crc = 0xFFFFFFFF;
        
        const str = typeof data === 'string' ? data : JSON.stringify(data);
        
        for (let i = 0; i < str.length; i++) {
            crc = (crc >>> 8) ^ crc32Table[(crc ^ str.charCodeAt(i)) & 0xFF];
        }
        
        return (crc ^ 0xFFFFFFFF) >>> 0;
    }
    
    static makeCRC32Table() {
        let c;
        const crcTable = [];
        
        for (let n = 0; n < 256; n++) {
            c = n;
            for (let k = 0; k < 8; k++) {
                c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
            }
            crcTable[n] = c;
        }
        
        return crcTable;
    }
    
    // ===== Secure Data Wipe =====
    
    /**
     * Securely wipe sensitive data from memory
     */
    static wipeData(data) {
        if (Buffer.isBuffer(data)) {
            crypto.randomFillSync(data);
        }
        
        // For objects/strings, best we can do is overwrite
        if (typeof data === 'object' && data !== null) {
            for (const key in data) {
                if (data.hasOwnProperty(key)) {
                    data[key] = null;
                }
            }
        }
    }
}

module.exports = Encryption;