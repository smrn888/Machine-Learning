// controllers/CombatController.js - Combat logic and calculations
const PlayerModel = require('../models/PlayerModel');
const xpCalculator = require('../utils/xpCalculator');

class CombatController {
    
    // ===== Spell Damage Calculations =====
    static SPELL_BASE_DAMAGE = {
        'Lumos': 10,
        'Stupefy': 20,
        'Expelliarmus': 25,
        'Protego': 0, // Shield spell
        'Expecto Patronum': 0, // Special effect
        'Avada Kedavra': 100,
        'Imperio': 0, // Control spell
        'Crucio': 40,
        'Sectumsempra': 60
    };
    
    // ===== Calculate Damage =====
    static calculateDamage(attackerId, targetId, spellName, baseModifier = 1.0) {
        return new Promise(async (resolve, reject) => {
            try {
                const attacker = await PlayerModel.findOne({ playerId: attackerId });
                const target = await PlayerModel.findOne({ playerId: targetId });
                
                if (!attacker || !target) {
                    return reject(new Error('Player not found'));
                }
                
                // Base damage from spell
                const baseDamage = this.SPELL_BASE_DAMAGE[spellName] || 20;
                
                // Level difference modifier
                const levelDiff = attacker.xpLevel - target.xpLevel;
                const levelModifier = 1 + (levelDiff * 0.02); // 2% per level
                
                // Equipment modifier (from wand)
                const equipmentModifier = this.getEquipmentModifier(attacker.equipment);
                
                // Calculate final damage
                let finalDamage = baseDamage * baseModifier * levelModifier * equipmentModifier;
                
                // Apply target defense
                const defense = this.getDefenseModifier(target.equipment);
                finalDamage = finalDamage * (1 - defense);
                
                // Random variance (±10%)
                const variance = 0.9 + (Math.random() * 0.2);
                finalDamage = Math.floor(finalDamage * variance);
                
                // Minimum 1 damage
                finalDamage = Math.max(1, finalDamage);
                
                resolve({
                    damage: finalDamage,
                    attacker: attacker.username,
                    target: target.username,
                    spell: spellName,
                    levelDiff: levelDiff,
                    modifiers: {
                        level: levelModifier,
                        equipment: equipmentModifier,
                        defense: defense
                    }
                });
                
            } catch (error) {
                reject(error);
            }
        });
    }
    
    // ===== Apply Damage =====
    static async applyDamage(attackerId, targetId, damage, source = 'unknown') {
        try {
            const attacker = await PlayerModel.findOne({ playerId: attackerId });
            const target = await PlayerModel.findOne({ playerId: targetId });
            
            if (!attacker || !target) {
                return {
                    success: false,
                    error: 'Player not found'
                };
            }
            
            // Apply damage to target
            const deathResult = await target.takeDamage(damage);
            
            let killed = false;
            
            if (target.currentHealth <= 0) {
                killed = true;
                
                // Update attacker stats
                attacker.stats.totalKills += 1;
                
                if (targetId.startsWith('bot_') || targetId.startsWith('enemy_')) {
                    attacker.stats.botKills += 1;
                } else {
                    attacker.stats.playerKills += 1;
                }
                
                // Check if killed teammate
                if (target.house === attacker.house) {
                    attacker.stats.teammateKills += 1;
                    
                    // Penalty for teammate kill
                    const penalty = 30;
                    attacker.xp = Math.max(0, attacker.xp - penalty);
                    
                    const { level, progress } = xpCalculator.calculateLevelAndProgress(attacker.xp);
                    attacker.xpLevel = level;
                    attacker.xpProgress = progress;
                    
                    console.log(`⚠️ ${attacker.username} killed teammate ${target.username} (-${penalty} XP)`);
                } else {
                    // Reward for enemy kill
                    const xpReward = 50 + (target.xpLevel * 5);
                    attacker.xp += xpReward;
                    
                    const { level, progress } = xpCalculator.calculateLevelAndProgress(attacker.xp);
                    attacker.xpLevel = level;
                    attacker.xpProgress = progress;
                    
                    console.log(`⚔️ ${attacker.username} killed ${target.username} (+${xpReward} XP)`);
                }
                
                await attacker.save();
            }
            
            console.log(`💥 ${attacker.username} dealt ${damage} damage to ${target.username} (HP: ${target.currentHealth}/${target.maxHealth})`);
            
            return {
                success: true,
                damage: damage,
                attacker: attacker.username,
                target: target.username,
                targetHealth: target.currentHealth,
                killed: killed,
                deathResult: killed ? deathResult : null
            };
            
        } catch (error) {
            console.error('❌ Error applying damage:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    // ===== Handle Player Death =====
    static async handleDeath(victimId, killerId = null) {
        try {
            const victim = await PlayerModel.findOne({ playerId: victimId });
            
            if (!victim) {
                return {
                    success: false,
                    error: 'Victim not found'
                };
            }
            
            const deathResult = await victim.handleDeath();
            
            // Update killer stats
            if (killerId) {
                const killer = await PlayerModel.findOne({ playerId: killerId });
                
                if (killer) {
                    killer.stats.playerKills += 1;
                    killer.stats.totalKills += 1;
                    
                    // Check teammate kill
                    if (killer.house === victim.house) {
                        killer.stats.teammateKills += 1;
                    }
                    
                    await killer.save();
                }
            }
            
            console.log(`💀 ${victim.username} died. Horcruxes remaining: ${victim.horcruxes}`);
            
            return {
                success: true,
                victim: victim.username,
                killer: killerId,
                ...deathResult
            };
            
        } catch (error) {
            console.error('❌ Error handling death:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    // ===== Enemy Kill (Bot) =====
    static async handleEnemyKill(playerId, enemyHouse, enemyLevel) {
        try {
            const player = await PlayerModel.findOne({ playerId });
            
            if (!player) {
                return {
                    success: false,
                    error: 'Player not found'
                };
            }
            
            // Check if killing same house (penalty)
            if (enemyHouse.toLowerCase() === player.house.toLowerCase()) {
                const penalty = 30;
                player.xp = Math.max(0, player.xp - penalty);
                player.stats.teammateKills += 1;
                
                const { level, progress } = xpCalculator.calculateLevelAndProgress(player.xp);
                player.xpLevel = level;
                player.xpProgress = progress;
                
                await player.save();
                
                console.log(`⚠️ ${player.username} killed teammate bot (-${penalty} XP)`);
                
                return {
                    success: true,
                    penalty: true,
                    xpLost: penalty,
                    newXP: player.xp,
                    message: 'Penalty for killing teammate!'
                };
            }
            
            // Calculate XP reward
            const baseXP = 20;
            const levelBonus = enemyLevel * 2;
            const totalXP = baseXP + levelBonus;
            
            player.xp += totalXP;
            player.stats.botKills += 1;
            player.stats.totalKills += 1;
            
            const oldLevel = player.xpLevel;
            const { level, progress } = xpCalculator.calculateLevelAndProgress(player.xp);
            player.xpLevel = level;
            player.xpProgress = progress;
            
            await player.save();
            
            console.log(`⚔️ ${player.username} killed enemy bot (+${totalXP} XP)`);
            
            return {
                success: true,
                xpGained: totalXP,
                newXP: player.xp,
                newLevel: level,
                leveledUp: level > oldLevel
            };
            
        } catch (error) {
            console.error('❌ Error handling enemy kill:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    // ===== Spell Cast Validation =====
    static async validateSpellCast(playerId, spellName) {
        try {
            const player = await PlayerModel.findOne({ playerId });
            
            if (!player) {
                return {
                    valid: false,
                    error: 'Player not found'
                };
            }
            
            // Check if spell is unlocked
            if (!player.hasSpell(spellName)) {
                return {
                    valid: false,
                    error: 'Spell not unlocked',
                    unlockedSpells: player.unlockedSpells
                };
            }
            
            // Check cooldown (would need to implement cooldown tracking)
            // For now, just validate spell exists
            
            return {
                valid: true,
                spell: spellName,
                damage: this.SPELL_BASE_DAMAGE[spellName] || 20
            };
            
        } catch (error) {
            console.error('❌ Error validating spell:', error);
            return {
                valid: false,
                error: error.message
            };
        }
    }
    
    // ===== Equipment Modifiers =====
    static getEquipmentModifier(equipment) {
        let modifier = 1.0;
        
        // Wand bonuses
        const wandBonuses = {
            'basic_wand': 1.0,
            'oak_wand': 1.2,
            'elder_wand': 2.0
        };
        
        if (equipment.wandId && wandBonuses[equipment.wandId]) {
            modifier *= wandBonuses[equipment.wandId];
        }
        
        return modifier;
    }
    
    static getDefenseModifier(equipment) {
        let defense = 0;
        
        // Robe defense
        const robeDefense = {
            'basic_robe': 0.05,
            'enchanted_robe': 0.15
        };
        
        if (equipment.robeId && robeDefense[equipment.robeId]) {
            defense += robeDefense[equipment.robeId];
        }
        
        return Math.min(defense, 0.5); // Max 50% damage reduction
    }
    
    // ===== Get Combat Stats =====
    static async getCombatStats(playerId) {
        try {
            const player = await PlayerModel.findOne({ playerId });
            
            if (!player) {
                return {
                    success: false,
                    error: 'Player not found'
                };
            }
            
            const kdRatio = player.stats.deaths > 0 
                ? (player.stats.totalKills / player.stats.deaths).toFixed(2)
                : player.stats.totalKills;
            
            return {
                success: true,
                stats: {
                    username: player.username,
                    house: player.house,
                    level: player.xpLevel,
                    totalKills: player.stats.totalKills,
                    playerKills: player.stats.playerKills,
                    botKills: player.stats.botKills,
                    teammateKills: player.stats.teammateKills,
                    deaths: player.stats.deaths,
                    kdRatio: kdRatio
                }
            };
            
        } catch (error) {
            console.error('❌ Error getting combat stats:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    // ===== Leaderboards =====
    static async getPvPLeaderboard(limit = 10) {
        try {
            const players = await PlayerModel.find()
                .sort({ 'stats.playerKills': -1 })
                .limit(limit)
                .select('username house xpLevel stats.playerKills stats.deaths');
            
            const leaderboard = players.map(player => ({
                username: player.username,
                house: player.house,
                level: player.xpLevel,
                kills: player.stats.playerKills,
                deaths: player.stats.deaths,
                kdRatio: player.stats.deaths > 0 
                    ? (player.stats.playerKills / player.stats.deaths).toFixed(2)
                    : player.stats.playerKills
            }));
            
            return {
                success: true,
                leaderboard: leaderboard
            };
            
        } catch (error) {
            console.error('❌ Error getting leaderboard:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = CombatController;