// game.js - Backend logic for XP, progression, and game state
const express = require('express');
const router = express.Router();
const PlayerModel = require('../models/PlayerModel');
const { authenticateToken } = require('../routes/auth.js');

// ===== XP Constants =====
const XP_PER_SEGMENT = 20;
const SEGMENTS_PER_LEVEL = 5;
const GALLEONS_PER_LEVEL = 10;
const HORCRUX_EVERY_N_LEVELS = 10;
const HEALTH_INCREASE_PER_HORCRUX = 50;
const HEALTH_INCREASE_PER_LEVEL = 5;

// ===== Spell Unlock Levels =====
const SPELL_UNLOCKS = {
    'Lumos': 0,
    'Stupefy': 0,
    'Expelliarmus': 3,
    'Protego': 5,
    'Expecto Patronum': 10,
    'Avada Kedavra': 15,
    'Imperio': 20
};

// ===== GET Player Data by ID =====
router.get('/player/:playerId', authenticateToken, async (req, res) => {
    try {
        const { playerId } = req.params;
        
        const player = await PlayerModel.findOne({ playerId })
            .select('-passwordHash');
        
        if (!player) {
            return res.status(404).json({ 
                error: 'Player not found',
                playerId 
            });
        }
        
        console.log(`📥 Player data requested: ${player.username}`);
        
        res.json({
            playerId: player.playerId,
            username: player.username,
            email: player.email || '',
            house: player.house,
            xp: player.xp || 0,
            xpLevel: player.xpLevel || 0,
            xpProgress: player.xpProgress || 0,
            galleons: player.galleons || 100,
            horcruxes: player.horcruxes || 0,
            currentHealth: player.currentHealth || 100,
            maxHealth: player.maxHealth || 100,
            currentZoneId: player.currentZoneId || 'great_hall',
            position: player.position || { x: 0, y: 0, z: 0 },
            inventory: player.inventory || [],
            equipment: player.equipment || {
                wandId: '',
                robeId: '',
                broomId: '',
                petId: ''
            },
            unlockedSpells: player.unlockedSpells || ['Lumos', 'Stupefy'],
            stats: player.stats || {
                totalKills: 0,
                playerKills: 0,
                botKills: 0,
                teammateKills: 0,
                deaths: 0,
                spellsCast: 0,
                damageDealt: 0,
                damageTaken: 0,
                questsCompleted: 0
            },
            achievements: player.achievements || [],
            friends: player.friends || [],
            quests: player.quests || { active: [], completed: [] },
            sortingHatData: player.sortingHatData || { hasBeenSorted: false, answers: [] },
            characterAppearance: player.characterAppearance || {
                skinTone: 'fair',
                hairColor: 'brown',
                eyeColor: 'brown',
                gender: 'male'
            },
            createdAt: player.createdAt,
            lastLogin: player.lastLogin
        });
        
    } catch (error) {
        console.error('❌ Error fetching player data:', error);
        res.status(500).json({ error: 'Failed to fetch player data' });
    }
});

// ===== GET Active Players =====
router.get('/player/active', authenticateToken, async (req, res) => {
    try {
        const playerSockets = req.app.get('playerSockets') || new Map();
        
        const players = Array.from(playerSockets.values()).map(p => ({
            playerId: p.playerId,
            username: p.username,
            house: p.house,
            position: p.position || { x: 0, y: 0 },
            zoneId: p.zoneId || 'unknown',
            health: p.health || 100,
            maxHealth: p.maxHealth || 100
        }));
        
        res.json({ players });
        
    } catch (error) {
        console.error('❌ Error fetching active players:', error);
        res.status(500).json({ error: 'Failed to fetch active players' });
    }
});

// ===== POST Player Position =====
router.post('/player/position', authenticateToken, async (req, res) => {
    try {
        const { playerId, username, position, zoneId, health, maxHealth, house } = req.body;
        
        if (!playerId || !position) {
            return res.status(400).json({ error: 'playerId and position required' });
        }
        
        const playerSockets = req.app.get('playerSockets') || new Map();
        const activePlayers = req.app.get('activePlayers') || new Map();
        const socketId = activePlayers.get(playerId);
        
        if (socketId && playerSockets.has(socketId)) {
            const playerData = playerSockets.get(socketId);
            playerData.position = position;
            playerData.zoneId = zoneId;
            playerData.health = health;
            playerData.maxHealth = maxHealth;
        }
        
        await PlayerModel.updateOne(
            { playerId },
            { 
                $set: { 
                    position,
                    currentZoneId: zoneId,
                    lastLogin: Date.now()
                } 
            }
        );
        
        res.json({ success: true });
        
    } catch (error) {
        console.error('❌ Error updating player position:', error);
        res.status(500).json({ error: 'Failed to update position' });
    }
});

// ===== Add XP =====
router.post('/xp/add', authenticateToken, async (req, res) => {
    try {
        const { playerId, amount, source } = req.body;
        
        if (!playerId || !amount) {
            return res.status(400).json({ error: 'playerId and amount required' });
        }
        
        const player = await PlayerModel.findOne({ playerId });
        if (!player) {
            return res.status(404).json({ error: 'Player not found' });
        }
        
        const oldXP = player.xp;
        const oldLevel = player.xpLevel;
        
        player.xp += amount;
        
        const result = calculateLevelAndProgress(player.xp);
        player.xpLevel = result.level;
        player.xpProgress = result.progress;
        
        if (result.level > oldLevel) {
            const levelUpRewards = handleLevelUp(player, oldLevel, result.level);
            await player.save();
            
            console.log(`✅ Player ${player.username} leveled up: ${oldLevel} → ${result.level}`);
            
            return res.json({
                success: true,
                xpAdded: amount,
                newXP: player.xp,
                newLevel: result.level,
                newProgress: result.progress,
                levelUp: true,
                rewards: levelUpRewards
            });
        }
        
        await player.save();
        
        console.log(`✅ XP added to ${player.username}: +${amount} (Source: ${source})`);
        
        res.json({
            success: true,
            xpAdded: amount,
            newXP: player.xp,
            newLevel: result.level,
            newProgress: result.progress,
            levelUp: false
        });
        
    } catch (error) {
        console.error('❌ Error adding XP:', error);
        res.status(500).json({ error: 'Failed to add XP' });
    }
});

// ===== Remove XP (Penalty) =====
router.post('/xp/remove', authenticateToken, async (req, res) => {
    try {
        const { playerId, amount, reason } = req.body;
        
        if (!playerId || !amount) {
            return res.status(400).json({ error: 'playerId and amount required' });
        }
        
        const player = await PlayerModel.findOne({ playerId });
        if (!player) {
            return res.status(404).json({ error: 'Player not found' });
        }
        
        player.xp = Math.max(0, player.xp - amount);
        
        const result = calculateLevelAndProgress(player.xp);
        player.xpLevel = result.level;
        player.xpProgress = result.progress;
        
        await player.save();
        
        console.log(`⚠️ XP removed from ${player.username}: -${amount} (Reason: ${reason})`);
        
        res.json({
            success: true,
            xpRemoved: amount,
            newXP: player.xp,
            newLevel: result.level,
            newProgress: result.progress
        });
        
    } catch (error) {
        console.error('❌ Error removing XP:', error);
        res.status(500).json({ error: 'Failed to remove XP' });
    }
});

// ===== Enemy Kill =====
router.post('/combat/enemy-kill', authenticateToken, async (req, res) => {
    try {
        const { playerId, enemyHouse, enemyLevel } = req.body;
        
        const player = await PlayerModel.findOne({ playerId });
        if (!player) {
            return res.status(404).json({ error: 'Player not found' });
        }
        
        if (enemyHouse.toLowerCase() === player.house.toLowerCase()) {
            player.xp = Math.max(0, player.xp - 30);
            player.stats.teammateKills += 1;
            
            const result = calculateLevelAndProgress(player.xp);
            player.xpLevel = result.level;
            player.xpProgress = result.progress;
            
            await player.save();
            
            return res.json({
                success: true,
                penalty: true,
                xpLost: 30,
                newXP: player.xp,
                message: 'Penalty for killing teammate!'
            });
        }
        
        const baseXP = 20;
        const levelBonus = enemyLevel * 2;
        const totalXP = baseXP + levelBonus;
        
        player.xp += totalXP;
        player.stats.botKills += 1;
        player.stats.totalKills += 1;
        
        const oldLevel = player.xpLevel;
        const result = calculateLevelAndProgress(player.xp);
        player.xpLevel = result.level;
        player.xpProgress = result.progress;
        
        let levelUpRewards = null;
        if (result.level > oldLevel) {
            levelUpRewards = handleLevelUp(player, oldLevel, result.level);
        }
        
        await player.save();
        
        res.json({
            success: true,
            xpGained: totalXP,
            newXP: player.xp,
            newLevel: result.level,
            levelUp: result.level > oldLevel,
            rewards: levelUpRewards
        });
        
    } catch (error) {
        console.error('❌ Error processing enemy kill:', error);
        res.status(500).json({ error: 'Failed to process enemy kill' });
    }
});

// ===== Player Death =====
router.post('/combat/player-death', authenticateToken, async (req, res) => {
    try {
        const { playerId, attackerId } = req.body;
        
        const player = await PlayerModel.findOne({ playerId });
        if (!player) {
            return res.status(404).json({ error: 'Player not found' });
        }
        
        player.stats.deaths += 1;
        
        if (player.horcruxes > 0) {
            player.horcruxes -= 1;
            player.currentHealth = player.maxHealth * 0.3;
            
            await player.save();
            
            return res.json({
                success: true,
                died: true,
                horcruxesRemaining: player.horcruxes,
                respawn: true
            });
        } else {
            await resetPlayerProgress(player);
            
            return res.json({
                success: true,
                died: true,
                horcruxesRemaining: 0,
                gameOver: true,
                message: 'All Horcruxes lost. Progress reset.'
            });
        }
        
    } catch (error) {
        console.error('❌ Error processing player death:', error);
        res.status(500).json({ error: 'Failed to process death' });
    }
});

// ===== Quest Complete =====
router.post('/quest/complete', authenticateToken, async (req, res) => {
    try {
        const { playerId, questId, difficulty } = req.body;
        
        const player = await PlayerModel.findOne({ playerId });
        if (!player) {
            return res.status(404).json({ error: 'Player not found' });
        }
        
        const baseXP = 50;
        const difficultyBonus = difficulty * 10;
        const totalXP = baseXP + difficultyBonus;
        
        player.xp += totalXP;
        player.stats.questsCompleted += 1;
        
        const oldLevel = player.xpLevel;
        const result = calculateLevelAndProgress(player.xp);
        player.xpLevel = result.level;
        player.xpProgress = result.progress;
        
        let levelUpRewards = null;
        if (result.level > oldLevel) {
            levelUpRewards = handleLevelUp(player, oldLevel, result.level);
        }
        
        await player.save();
        
        res.json({
            success: true,
            xpGained: totalXP,
            newXP: player.xp,
            newLevel: result.level,
            levelUp: result.level > oldLevel,
            rewards: levelUpRewards
        });
        
    } catch (error) {
        console.error('❌ Error completing quest:', error);
        res.status(500).json({ error: 'Failed to complete quest' });
    }
});

// ===== Get Player Stats =====
router.get('/stats/:playerId', authenticateToken, async (req, res) => {
    try {
        const { playerId } = req.params;
        
        const player = await PlayerModel.findOne({ playerId });
        if (!player) {
            return res.status(404).json({ error: 'Player not found' });
        }
        
        res.json({
            username: player.username,
            house: player.house,
            xp: player.xp,
            xpLevel: player.xpLevel,
            xpProgress: player.xpProgress,
            galleons: player.galleons,
            horcruxes: player.horcruxes,
            stats: player.stats,
            unlockedSpells: player.unlockedSpells
        });
        
    } catch (error) {
        console.error('❌ Error getting stats:', error);
        res.status(500).json({ error: 'Failed to get stats' });
    }
});

// ===== Get Game Data =====
router.get('/data', authenticateToken, async (req, res) => {
    try {
        const playerId = req.user.playerId;
        const player = await PlayerModel.findOne({ playerId })
            .select('-passwordHash -email -sortingHatData');

        if (!player) {
            return res.status(404).json({ error: 'Player data not found' });
        }
        
        res.json(player);

    } catch (error) {
        console.error('❌ Error fetching player game data:', error);
        res.status(500).json({ error: 'Failed to fetch player game data' });
    }
});

// ===== Save Player Data =====
router.post('/player/:playerId/save', authenticateToken, async (req, res) => {
    try {
        const { playerId } = req.params;
        const updateData = req.body;
        
        const player = await PlayerModel.findOne({ playerId });
        if (!player) {
            return res.status(404).json({ error: 'Player not found' });
        }
        
        const allowedFields = [
            'xp', 'xpLevel', 'xpProgress', 'galleons', 'currentHealth', 
            'maxHealth', 'horcruxes', 'stats', 'inventory', 'equipment',
            'unlockedSpells', 'position', 'currentZoneId'
        ];
        
        allowedFields.forEach(field => {
            if (updateData[field] !== undefined) {
                player[field] = updateData[field];
            }
        });
        
        player.lastLogin = Date.now();
        await player.save();
        
        console.log(`💾 Player data saved: ${player.username}`);
        
        res.json({
            success: true,
            message: 'Player data saved successfully',
            player: {
                playerId: player.playerId,
                username: player.username,
                xp: player.xp,
                xpLevel: player.xpLevel,
                galleons: player.galleons
            }
        });
        
    } catch (error) {
        console.error('❌ Error saving player data:', error);
        res.status(500).json({ error: 'Failed to save player data' });
    }
});

// ===== Helper Functions =====

function calculateLevelAndProgress(xp) {
    const totalSegments = Math.floor(xp / XP_PER_SEGMENT);
    const level = Math.floor(totalSegments / SEGMENTS_PER_LEVEL);
    const progress = totalSegments % SEGMENTS_PER_LEVEL;
    
    return { level, progress };
}

function handleLevelUp(player, oldLevel, newLevel) {
    const rewards = {
        galleons: 0,
        horcrux: false,
        spells: [],
        healthIncrease: 0
    };
    
    let galleonsAwarded = GALLEONS_PER_LEVEL;
    if (newLevel % 5 === 0) galleonsAwarded += 10;
    if (newLevel % 10 === 0) galleonsAwarded += 25;
    
    player.galleons += galleonsAwarded;
    rewards.galleons = galleonsAwarded;
    
    if (newLevel % HORCRUX_EVERY_N_LEVELS === 0) {
        player.horcruxes += 1;
        player.maxHealth += HEALTH_INCREASE_PER_HORCRUX;
        player.currentHealth = player.maxHealth;
        rewards.horcrux = true;
        rewards.healthIncrease += HEALTH_INCREASE_PER_HORCRUX;
    }
    
    player.maxHealth += HEALTH_INCREASE_PER_LEVEL;
    rewards.healthIncrease += HEALTH_INCREASE_PER_LEVEL;
    
    for (const [spellName, unlockLevel] of Object.entries(SPELL_UNLOCKS)) {
        if (unlockLevel === newLevel && !player.unlockedSpells.includes(spellName)) {
            player.unlockedSpells.push(spellName);
            rewards.spells.push(spellName);
        }
    }
    
    return rewards;
}

async function resetPlayerProgress(player) {
    player.xp = 0;
    player.xpLevel = 0;
    player.xpProgress = 0;
    player.galleons = 50;
    player.horcruxes = 1;
    player.maxHealth = 100;
    player.currentHealth = 100;
    player.unlockedSpells = ['Lumos', 'Stupefy'];
    player.inventory = { items: [] };
    player.equipment = {
        wandId: 'basic_wand',
        robeId: 'basic_robe',
        broomId: null,
        petId: null
    };
    
    await player.save();
    
    console.log(`♻️ Player ${player.username} progress reset`);
}

module.exports = router;