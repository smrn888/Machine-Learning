// controllers/PlayerController.js - Player business logic
const PlayerModel = require('../models/PlayerModel');
const xpCalculator = require('../utils/xpCalculator');

class PlayerController {
    
    // ===== Create New Player =====
    static async createPlayer(username, email, passwordHash, house = '') {
        try {
            const { v4: uuidv4 } = require('uuid');
            
            const newPlayer = new PlayerModel({
                playerId: uuidv4(),
                username,
                email,
                passwordHash,
                house,
                createdAt: new Date(),
                lastLogin: new Date()
            });
            
            await newPlayer.save();
            
            console.log(`✅ Player created: ${username}`);
            
            return {
                success: true,
                player: newPlayer
            };
            
        } catch (error) {
            console.error('❌ Error creating player:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    // ===== Get Player By ID =====
    static async getPlayerById(playerId) {
        try {
            const player = await PlayerModel.findOne({ playerId });
            
            if (!player) {
                return {
                    success: false,
                    error: 'Player not found'
                };
            }
            
            return {
                success: true,
                player: player
            };
            
        } catch (error) {
            console.error('❌ Error getting player:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    // ===== Get Player By Username =====
    static async getPlayerByUsername(username) {
        try {
            const player = await PlayerModel.findByUsername(username);
            
            if (!player) {
                return {
                    success: false,
                    error: 'Player not found'
                };
            }
            
            return {
                success: true,
                player: player
            };
            
        } catch (error) {
            console.error('❌ Error getting player:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    // ===== Update Player Data =====
    static async updatePlayer(playerId, updateData) {
        try {
            const player = await PlayerModel.findOne({ playerId });
            
            if (!player) {
                return {
                    success: false,
                    error: 'Player not found'
                };
            }
            
            // Update allowed fields
            const allowedFields = [
                'currentHealth', 'maxHealth', 'currentZoneId', 'position',
                'inventory', 'equipment', 'stats', 'quests',
                'characterAppearance', 'galleons', 'horcruxes'
            ];
            
            allowedFields.forEach(field => {
                if (updateData[field] !== undefined) {
                    player[field] = updateData[field];
                }
            });
            
            player.lastLogin = Date.now();
            await player.save();
            
            return {
                success: true,
                player: player
            };
            
        } catch (error) {
            console.error('❌ Error updating player:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    // ===== Award XP =====
    static async awardXP(playerId, amount, source = 'unknown') {
        try {
            const player = await PlayerModel.findOne({ playerId });
            
            if (!player) {
                return {
                    success: false,
                    error: 'Player not found'
                };
            }
            
            const oldLevel = player.xpLevel;
            const oldXP = player.xp;
            
            // Add XP and recalculate level
            player.xp += amount;
            
            const { level, progress } = xpCalculator.calculateLevelAndProgress(player.xp);
            player.xpLevel = level;
            player.xpProgress = progress;
            
            // Check for level up
            let levelUpRewards = null;
            if (level > oldLevel) {
                levelUpRewards = await this.handleLevelUp(player, oldLevel, level);
            }
            
            await player.save();
            
            console.log(`➕ ${player.username} gained ${amount} XP from ${source} (Total: ${player.xp})`);
            
            return {
                success: true,
                xpAdded: amount,
                oldXP: oldXP,
                newXP: player.xp,
                oldLevel: oldLevel,
                newLevel: level,
                leveledUp: level > oldLevel,
                rewards: levelUpRewards
            };
            
        } catch (error) {
            console.error('❌ Error awarding XP:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    // ===== Remove XP (Penalty) =====
    static async removeXP(playerId, amount, reason = 'unknown') {
        try {
            const player = await PlayerModel.findOne({ playerId });
            
            if (!player) {
                return {
                    success: false,
                    error: 'Player not found'
                };
            }
            
            const oldXP = player.xp;
            
            player.xp = Math.max(0, player.xp - amount);
            
            const { level, progress } = xpCalculator.calculateLevelAndProgress(player.xp);
            player.xpLevel = level;
            player.xpProgress = progress;
            
            await player.save();
            
            console.log(`➖ ${player.username} lost ${amount} XP (Reason: ${reason})`);
            
            return {
                success: true,
                xpRemoved: amount,
                oldXP: oldXP,
                newXP: player.xp,
                newLevel: level,
                reason: reason
            };
            
        } catch (error) {
            console.error('❌ Error removing XP:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    // ===== Handle Level Up =====
    static async handleLevelUp(player, oldLevel, newLevel) {
        const rewards = {
            galleons: 0,
            horcrux: false,
            spells: [],
            healthIncrease: 0
        };
        
        // Base galleons reward
        let galleonsReward = 10;
        
        // Bonus galleons at milestones
        if (newLevel % 5 === 0) galleonsReward += 10;
        if (newLevel % 10 === 0) galleonsReward += 25;
        
        player.galleons += galleonsReward;
        rewards.galleons = galleonsReward;
        
        // Award Horcrux every 10 levels
        if (newLevel % 10 === 0) {
            player.horcruxes += 1;
            player.maxHealth += 50;
            player.currentHealth = player.maxHealth; // Full heal
            rewards.horcrux = true;
            rewards.healthIncrease += 50;
        }
        
        // Health increase per level
        player.maxHealth += 5;
        rewards.healthIncrease += 5;
        
        // Unlock spells at specific levels
        const spellUnlocks = {
            3: ['Expelliarmus'],
            5: ['Protego'],
            10: ['Expecto Patronum'],
            15: ['Avada Kedavra'],
            20: ['Imperio']
        };
        
        if (spellUnlocks[newLevel]) {
            for (const spell of spellUnlocks[newLevel]) {
                if (!player.unlockedSpells.includes(spell)) {
                    player.unlockedSpells.push(spell);
                    rewards.spells.push(spell);
                }
            }
        }
        
        console.log(`🎉 ${player.username} leveled up: ${oldLevel} → ${newLevel}`);
        
        return rewards;
    }
    
    // ===== Add/Remove Galleons =====
    static async modifyGalleons(playerId, amount) {
        try {
            const player = await PlayerModel.findOne({ playerId });
            
            if (!player) {
                return {
                    success: false,
                    error: 'Player not found'
                };
            }
            
            player.galleons += amount;
            player.galleons = Math.max(0, player.galleons);
            
            await player.save();
            
            console.log(`💰 ${player.username} ${amount >= 0 ? 'gained' : 'lost'} ${Math.abs(amount)} galleons`);
            
            return {
                success: true,
                change: amount,
                galleons: player.galleons
            };
            
        } catch (error) {
            console.error('❌ Error modifying galleons:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    // ===== Manage Inventory =====
    static async addItemToInventory(playerId, itemId, quantity = 1) {
        try {
            const player = await PlayerModel.findOne({ playerId });
            
            if (!player) {
                return {
                    success: false,
                    error: 'Player not found'
                };
            }
            
            await player.addItem(itemId, quantity);
            
            console.log(`📦 ${player.username} received ${quantity}x ${itemId}`);
            
            return {
                success: true,
                inventory: player.inventory
            };
            
        } catch (error) {
            console.error('❌ Error adding item:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    static async removeItemFromInventory(playerId, itemId, quantity = 1) {
        try {
            const player = await PlayerModel.findOne({ playerId });
            
            if (!player) {
                return {
                    success: false,
                    error: 'Player not found'
                };
            }
            
            await player.removeItem(itemId, quantity);
            
            console.log(`📦 ${player.username} lost ${quantity}x ${itemId}`);
            
            return {
                success: true,
                inventory: player.inventory
            };
            
        } catch (error) {
            console.error('❌ Error removing item:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    // ===== Health Management =====
    static async modifyHealth(playerId, amount) {
        try {
            const player = await PlayerModel.findOne({ playerId });
            
            if (!player) {
                return {
                    success: false,
                    error: 'Player not found'
                };
            }
            
            if (amount > 0) {
                await player.heal(amount);
            } else {
                await player.takeDamage(Math.abs(amount));
            }
            
            return {
                success: true,
                currentHealth: player.currentHealth,
                maxHealth: player.maxHealth
            };
            
        } catch (error) {
            console.error('❌ Error modifying health:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    // ===== Unlock Spell =====
    static async unlockSpell(playerId, spellName) {
        try {
            const player = await PlayerModel.findOne({ playerId });
            
            if (!player) {
                return {
                    success: false,
                    error: 'Player not found'
                };
            }
            
            if (player.hasSpell(spellName)) {
                return {
                    success: false,
                    error: 'Spell already unlocked'
                };
            }
            
            await player.unlockSpell(spellName);
            
            console.log(`✨ ${player.username} unlocked ${spellName}`);
            
            return {
                success: true,
                spell: spellName,
                unlockedSpells: player.unlockedSpells
            };
            
        } catch (error) {
            console.error('❌ Error unlocking spell:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    // ===== Reset Progress =====
    static async resetProgress(playerId) {
        try {
            const player = await PlayerModel.findOne({ playerId });
            
            if (!player) {
                return {
                    success: false,
                    error: 'Player not found'
                };
            }
            
            await player.resetProgress();
            
            console.log(`♻️ ${player.username} progress reset`);
            
            return {
                success: true,
                message: 'Progress reset successfully'
            };
            
        } catch (error) {
            console.error('❌ Error resetting progress:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    // ===== Get Player Stats =====
    static async getPlayerStats(playerId) {
        try {
            const player = await PlayerModel.findOne({ playerId });
            
            if (!player) {
                return {
                    success: false,
                    error: 'Player not found'
                };
            }
            
            return {
                success: true,
                stats: {
                    username: player.username,
                    house: player.house,
                    xp: player.xp,
                    xpLevel: player.xpLevel,
                    xpProgress: player.xpProgress,
                    galleons: player.galleons,
                    horcruxes: player.horcruxes,
                    currentHealth: player.currentHealth,
                    maxHealth: player.maxHealth,
                    combatStats: player.stats,
                    unlockedSpells: player.unlockedSpells,
                    achievements: player.achievements
                }
            };
            
        } catch (error) {
            console.error('❌ Error getting stats:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    // ===== Get Multiple Players (for leaderboard, etc) =====
    static async getPlayers(filters = {}, limit = 10, sort = { xpLevel: -1 }) {
        try {
            const players = await PlayerModel.find(filters)
                .sort(sort)
                .limit(limit)
                .select('-passwordHash -currentSessionToken -loginAttempts');
            
            return {
                success: true,
                players: players,
                count: players.length
            };
            
        } catch (error) {
            console.error('❌ Error getting players:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = PlayerController;