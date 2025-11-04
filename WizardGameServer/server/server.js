// server.js - Main server file for Wizard Game Backend
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const http = require('http');
const socketIO = require('socket.io');
require('dotenv').config();

// ===== Import Routes =====
const { router: authRoutes, authenticateToken } = require('./routes/auth');
const gameRoutes = require('./routes/game');
const shopRoutes = require('./routes/shop');
const PlayerModel = require('./models/PlayerModel');

// ===== Configuration =====
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/wizardgame';
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

// ===== Initialize Express =====
const app = express();
const server = http.createServer(app);

// ===== Initialize Socket.IO =====
const io = socketIO(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
        credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000
});

// ===== Global Real-Time State =====
const activePlayers = new Map(); // playerId -> socket.id
const playerSockets = new Map(); // socket.id -> playerData
const recentSpells = [];
const MAX_SPELL_HISTORY = 50;
const SPELL_TIMEOUT = 5000;

// ✅ Share State with Routes (NEW)
app.set('io', io);
app.set('activePlayers', activePlayers);
app.set('playerSockets', playerSockets);

// ===== Middleware =====

// Security
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));

// CORS
app.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.options('*', cors());

// Body Parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
} else {
    app.use(morgan('combined'));
}

// Rate Limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false
});

app.use('/api/', limiter);

// Stricter limit for auth routes
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: 'Too many authentication attempts, please try again later.'
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// ===== MongoDB Connection =====
mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('✅ Connected to MongoDB');
    console.log(`📊 Database: ${mongoose.connection.db.databaseName}`);
  })
  .catch((error) => {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  });
  
mongoose.connection.on('error', (error) => {
    console.error('❌ MongoDB error:', error);
});

mongoose.connection.on('disconnected', () => {
    console.warn('⚠️ MongoDB disconnected');
});

mongoose.connection.on('reconnected', () => {
    console.log('✅ MongoDB reconnected');
});

// ===== Routes =====

// Health check
app.get('/api/health', (req, res) => {
    console.log('🏥 Health check requested');
    res.json({ 
        status: 'ok',
        timestamp: new Date(),
        uptime: process.uptime(),
        mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    });
});

// Ping endpoint
app.get('/api/ping', (req, res) => {
    res.json({ 
        pong: true,
        timestamp: Date.now()
    });
});

// Server info
app.get('/api/info', (req, res) => {
    try {
        const onlinePlayers = io && io.engine ? io.engine.clientsCount : 0;
        
        res.json({
            version: '1.0.0',
            name: 'Wizard Game Server',
            onlinePlayers: onlinePlayers,
            maintenanceMode: false,
            message: 'Welcome to Hogwarts!'
        });
    } catch (error) {
        console.error('❌ Info route error:', error);
        res.json({
            version: '1.0.0',
            name: 'Wizard Game Server',
            onlinePlayers: 0,
            maintenanceMode: false,
            message: 'Welcome to Hogwarts!'
        });
    }
});

// Fix house endpoint
app.post('/api/fix-house', async (req, res) => {
    try {
        const { playerId, house } = req.body;
        
        const result = await PlayerModel.updateOne(
            { playerId },
            { $set: { house } }
        );
        
        res.json({ success: true, result });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/shop', shopRoutes);


// ✅ FIXED: Direct player routes (without /game prefix)
// app.use('/api/player', gameRoutes);

// ===== DEBUGGING ENDPOINTS =====

// Debug: Check all available endpoints
app.get('/api/debug/routes', (req, res) => {
    const routes = [];
    
    app._router.stack.forEach((middleware) => {
        if (middleware.route) {
            routes.push({
                path: middleware.route.path,
                methods: Object.keys(middleware.route.methods)
            });
        } else if (middleware.name === 'router') {
            middleware.handle.stack.forEach((handler) => {
                if (handler.route) {
                    routes.push({
                        path: handler.route.path,
                        methods: Object.keys(handler.route.methods)
                    });
                }
            });
        }
    });
    
    res.json({
        totalRoutes: routes.length,
        routes: routes.sort((a, b) => a.path.localeCompare(b.path))
    });
});

// Debug: Player lookup test
app.get('/api/debug/player/:playerId', async (req, res) => {
    try {
        const { playerId } = req.params;
        
        console.log(`🔍 DEBUG: Looking for player ${playerId}`);
        
        const player = await PlayerModel.findOne({ playerId });
        
        if (!player) {
            console.log(`❌ DEBUG: Player NOT found in database`);
            return res.json({
                found: false,
                playerId: playerId,
                message: 'Player not found in database'
            });
        }
        
        console.log(`✅ DEBUG: Player found: ${player.username}`);
        
        res.json({
            found: true,
            playerId: player.playerId,
            username: player.username,
            house: player.house,
            xpLevel: player.xpLevel,
            galleons: player.galleons,
            databaseStatus: 'OK'
        });
        
    } catch (error) {
        console.error(`❌ DEBUG Error:`, error);
        res.status(500).json({
            error: error.message,
            stack: error.stack
        });
    }
});

// Debug: Active players in Socket.IO
app.get('/api/debug/active-players', (req, res) => {
    const activePlayers = req.app.get('activePlayers') || new Map();
    const playerSockets = req.app.get('playerSockets') || new Map();
    
    const players = Array.from(playerSockets.values()).map(p => ({
        playerId: p.playerId,
        username: p.username,
        house: p.house,
        socketId: Array.from(activePlayers.entries()).find(([pid]) => pid === p.playerId)?.[1]
    }));
    
    res.json({
        activeCount: players.length,
        players: players,
        timestamp: new Date()
    });
});

// Debug: MongoDB Connection
app.get('/api/debug/db-status', async (req, res) => {
    try {
        const status = mongoose.connection.readyState;
        const statusMap = {
            0: 'disconnected',
            1: 'connected',
            2: 'connecting',
            3: 'disconnecting'
        };
        
        const dbName = mongoose.connection.db?.databaseName || 'unknown';
        
        // Try a simple query
        let playerCount = 0;
        let error = null;
        
        try {
            playerCount = await PlayerModel.countDocuments();
        } catch (e) {
            error = e.message;
        }
        
        res.json({
            status: statusMap[status],
            statusCode: status,
            database: dbName,
            totalPlayers: playerCount,
            mongoUri: process.env.MONGODB_URI?.substring(0, 20) + '...',
            error: error || null
        });
        
    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

// Debug: Test direct endpoint
app.post('/api/debug/test-get-player', authenticateToken, async (req, res) => {
    try {
        const { playerId } = req.body;
        
        console.log(`🧪 TEST: Simulating /api/game/player/${playerId}`);
        
        const player = await PlayerModel.findOne({ playerId });
        
        if (!player) {
            console.log(`❌ TEST FAILED: Player not found`);
            return res.status(404).json({
                error: 'Player not found',
                playerId,
                tested: true
            });
        }
        
        console.log(`✅ TEST PASSED: Player ${player.username} found`);
        
        res.json({
            success: true,
            playerId: player.playerId,
            username: player.username,
            house: player.house,
            xp: player.xp,
            xpLevel: player.xpLevel,
            galleons: player.galleons
        });
        
    } catch (error) {
        console.error(`❌ TEST ERROR:`, error);
        res.status(500).json({
            error: error.message,
            tested: true
        });
    }
});

console.log('✅ Debug endpoints loaded:');
console.log('  - GET /api/debug/routes');
console.log('  - GET /api/debug/player/:playerId');
console.log('  - GET /api/debug/active-players');
console.log('  - GET /api/debug/db-status');
console.log('  - POST /api/debug/test-get-player (requires auth)');

// دریافت تمام بازیکنان فعال
app.get('/api/game/player/active', (req, res) => {
    try {
        const playerSockets = req.app.get('playerSockets') || new Map();
        const activePlayers = req.app.get('activePlayers') || new Map();
        
        const players = Array.from(playerSockets.values()).map(p => ({
            playerId: p.playerId,
            username: p.username,
            house: p.house,
            position: p.position,
            health: p.health,
            maxHealth: p.maxHealth,
            zoneId: p.zoneId || 'main'
        }));
        
        res.json({ players: players });
        
    } catch (error) {
        console.error('❌ Error fetching active players:', error);
        res.status(500).json({ error: error.message });
    }
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ 
        error: 'Endpoint not found',
        path: req.path,
        method: req.method
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('❌ Error:', err.stack);
    
    res.status(err.status || 500).json({
        error: process.env.NODE_ENV === 'development' 
            ? err.message 
            : 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

// ===== WebSocket / Socket.IO =====

io.on('connection', (socket) => {
    console.log(`🔌 Client connected: ${socket.id}`);
    


    // Player join
    socket.on('player:join', (data) => {
        const { playerId, username, house, position } = data;
        
        console.log(`📥 [player:join] Received:`, { playerId, username, house, position });
        
        // ✅ ذخیره در Map
        activePlayers.set(playerId, socket.id);
        playerSockets.set(socket.id, {
            playerId,
            username,
            house,
            position: position || { x: 0, y: 0 },
            health: 100,
            maxHealth: 100
        });
        
        console.log(`👤 Player joined: ${username} (${house}) - PlayerId: ${playerId}`);
        console.log(`📊 Total active players: ${activePlayers.size}`);
        
        // ✅ CRITICAL: ارسال لیست بازیکنان فعلی به بازیکن جدید
        const currentPlayers = Array.from(playerSockets.values())
            .filter(p => p.playerId !== playerId)
            .map(p => ({
                playerId: p.playerId,
                username: p.username,
                house: p.house,
                position: p.position
            }));
        
        console.log(`📤 [players:list] Sending ${currentPlayers.length} existing players to ${username}`);
        socket.emit('players:list', { players: currentPlayers }); // ✅ باید object باشه
        
        // ✅ CRITICAL: اعلام بازیکن جدید به همه
        const joinedData = {
            playerId,
            username,
            house,
            position: position || { x: 0, y: 0 }
        };
        
        console.log(`📢 [player:joined] Broadcasting to all clients:`, joinedData);
        socket.broadcast.emit('player:joined', joinedData);
        
        console.log(`✅ Player ${username} successfully joined and announced`);
    });
    
    // Player movement
    socket.on('player:move', (data) => {
        const playerData = playerSockets.get(socket.id);
        if (playerData) {
            playerData.position = data.position;
            
            const moveData = {
                playerId: playerData.playerId,
                username: playerData.username,
                house: playerData.house,
                position: data.position,
                health: playerData.health,
                maxHealth: playerData.maxHealth
            };
            
            console.log(`🚶 [player:move] ${playerData.username} moved to (${data.position.x}, ${data.position.y})`);
            socket.broadcast.emit('player:moved', moveData);
        }
    });
    
    // Spell cast
    socket.on('spell:cast', (data) => {
        const playerData = playerSockets.get(socket.id);
        if (playerData) {
            const spellData = {
                casterId: playerData.playerId,
                casterName: playerData.username,
                spellName: data.spellName,
                position: data.position,
                direction: data.direction,
                color: data.color || { r: 1, g: 1, b: 1, a: 1 },
                damage: data.damage || 10,
                speed: data.speed || 5,
                timestamp: Date.now()
            };

            recentSpells.push(spellData);
            if (recentSpells.length > MAX_SPELL_HISTORY) { 
                recentSpells.shift(); 
            }
            
            socket.broadcast.emit('spell:casted', spellData); 
            
            console.log(`✨ ${playerData.username} cast ${data.spellName}`);
        }
    });
    
    // Damage dealt
    socket.on('damage:dealt', (data) => {
        const playerData = playerSockets.get(socket.id);
        if (playerData) {
            const targetSocketId = activePlayers.get(data.targetId);
            
            if (targetSocketId) {
                io.to(targetSocketId).emit('damage:received', {
                    attackerId: playerData.playerId,
                    damage: data.damage,
                    source: data.source
                });
                
                console.log(`💥 ${playerData.username} dealt ${data.damage} damage to ${data.targetId}`);
            }
        }
    });
    
    // Player death
    socket.on('player:death', (data) => {
        const playerData = playerSockets.get(socket.id);
        if (playerData) {
            socket.broadcast.emit('player:died', {
                playerId: playerData.playerId,
                killerId: data.killerId
            });
            
            console.log(`💀 ${playerData.username} died`);
        }
    });
    
    // Chat message
    socket.on('chat:message', (data) => {
        const playerData = playerSockets.get(socket.id);
        if (playerData) {
            io.emit('chat:message', {
                username: playerData.username,
                house: playerData.house,
                message: data.message,
                timestamp: Date.now()
            });
        }
    });
    
    // Player disconnect
    socket.on('disconnect', () => {
        const playerData = playerSockets.get(socket.id);
        
        if (playerData) {
            console.log(`👋 Player disconnecting: ${playerData.username} (${playerData.playerId})`);
            
            activePlayers.delete(playerData.playerId);
            playerSockets.delete(socket.id);
            
            // ✅ ارسال playerId به صورت string
            socket.broadcast.emit('player:left', playerData.playerId); // ✅ فقط playerId
            
            console.log(`👋 Player left: ${playerData.username}`);
            console.log(`📊 Remaining active players: ${activePlayers.size}`);
        } else {
            console.log(`📌 Client disconnected (no player data): ${socket.id}`);
        }
    });
    
    // Error handling
    socket.on('error', (error) => {
        console.error(`❌ Socket error (${socket.id}):`, error);
    });
});


// ✅ Debug endpoint: مشاهده بازیکنان فعال
app.get('/api/debug/active-players', (req, res) => {
    const players = Array.from(playerSockets.values()).map(p => ({
        playerId: p.playerId,
        username: p.username,
        house: p.house,
        position: p.position,
        socketId: Array.from(activePlayers.entries()).find(([pid]) => pid === p.playerId)?.[1]
    }));
    
    res.json({
        activeCount: players.length,
        players: players,
        timestamp: new Date()
    });
});

// ===== Background Jobs =====

// Cleanup old spells
setInterval(() => {
    const now = Date.now();
    const timeout = SPELL_TIMEOUT;
    
    let i = 0;
    while (i < recentSpells.length) {
        if (now - recentSpells[i].timestamp > timeout) {
            recentSpells.splice(i, 1);
        } else {
            i++;
        }
    }
}, 5000);

// ===== Graceful Shutdown =====
const gracefulShutdown = async () => {
    console.log('\n⚠️ Shutting down gracefully...');
    
    io.close(() => {
        console.log('✅ Socket.IO closed');
    });
    
    server.close(() => {
        console.log('✅ HTTP server closed');
    });
    
    await mongoose.connection.close();
    console.log('✅ MongoDB connection closed');
    
    process.exit(0);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// ===== Start Server =====
server.listen(PORT, '0.0.0.0', () => {
    console.log('\n🎮 ========================================');
    console.log('    WIZARD GAME SERVER');
    console.log('========================================');
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌐 Local: http://localhost:${PORT}`);
    console.log(`🌐 Network: http://127.0.0.1:${PORT}`);
    console.log(`📊 MongoDB: ${MONGODB_URI}`);
    console.log(`🔌 Socket.IO: Enabled`);
    console.log(`🛡️ Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log('========================================\n');
});

// ===== Export for testing =====
module.exports = { app, server, io };