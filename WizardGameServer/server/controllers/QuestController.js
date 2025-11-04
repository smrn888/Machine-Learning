// controllers/QuestController.js - Quest management and progression
const PlayerModel = require('../models/PlayerModel');
const xpCalculator = require('../utils/xpCalculator');

class QuestController {
    
    // ===== Quest Database =====
    static QUESTS = {
        'welcome_to_hogwarts': {
            id: 'welcome_to_hogwarts',
            name: 'Welcome to Hogwarts',
            description: 'Complete your first day at Hogwarts',
            type: 'tutorial',
            difficulty: 1,
            requirements: {
                level: 0
            },
            objectives: [
                { id: 'visit_great_hall', description: 'Visit the Great Hall', target: 1 },
                { id: 'cast_first_spell', description: 'Cast your first spell', target: 1 },
                { id: 'explore_library', description: 'Explore the Library', target: 1 }
            ],
            rewards: {
                xp: 50,
                galleons: 20,
                items: ['health_potion']
            }
        },
        'first_blood': {
            id: 'first_blood',
            name: 'First Blood',
            description: 'Defeat your first enemy',
            type: 'combat',
            difficulty: 1,
            requirements: {
                level: 0
            },
            objectives: [
                { id: 'kill_enemy', description: 'Defeat 1 enemy', target: 1 }
            ],
            rewards: {
                xp: 100,
                galleons: 50
            }
        },
        'spell_master': {
            id: 'spell_master',
            name: 'Spell Master',
            description: 'Unlock 5 different spells',
            type: 'progression',
            difficulty: 2,
            requirements: {
                level: 5
            },
            objectives: [
                { id: 'unlock_spells', description: 'Unlock 5 spells', target: 5 }
            ],
            rewards: {
                xp: 200,
                galleons: 100,
                items: ['greater_health_potion']
            }
        },
        'house_rivalry': {
            id: 'house_rivalry',
            name: 'House Rivalry',
            description: 'Defeat 10 students from rival houses',
            type: 'combat',
            difficulty: 3,
            requirements: {
                level: 5
            },
            objectives: [
                { id: 'kill_rivals', description: 'Defeat 10 rival students', target: 10 }
            ],
            rewards: {
                xp: 500,
                galleons: 200
            }
        },
        'library_explorer': {
            id: 'library_explorer',
            name: 'Library Explorer',
            description: 'Discover all secrets in the Restricted Library',
            type: 'exploration',
            difficulty: 2,
            requirements: {
                level: 3
            },
            objectives: [
                { id: 'find_secrets', description: 'Find 5 hidden books', target: 5 }
            ],
            rewards: {
                xp: 300,
                galleons: 150,
                items: ['xp_boost_potion']
            }
        },
        'potion_master': {
            id: 'potion_master',
            name: 'Potion Master',
            description: 'Craft 10 potions',
            type: 'crafting',
            difficulty: 2,
            requirements: {
                level: 5
            },
            objectives: [
                { id: 'craft_potions', description: 'Craft 10 potions', target: 10 }
            ],
            rewards: {
                xp: 400,
                galleons: 250
            }
        },
        'quidditch_champion': {
            id: 'quidditch_champion',
            name: 'Quidditch Champion',
            description: 'Win 5 Quidditch matches',
            type: 'minigame',
            difficulty: 3,
            requirements: {
                level: 8,
                items: ['nimbus_2000']
            },
            objectives: [
                { id: 'win_quidditch', description: 'Win 5 matches', target: 5 }
            ],
            rewards: {
                xp: 600,
                galleons: 500,
                items: ['firebolt']
            }
        },
        'dark_wizard': {
            id: 'dark_wizard',
            name: 'Dark Wizard',
            description: 'Master the unforgivable curses',
            type: 'special',
            difficulty: 5,
            requirements: {
                level: 15
            },
            objectives: [
                { id: 'use_avada', description: 'Use Avada Kedavra 10 times', target: 10 },
                { id: 'use_crucio', description: 'Use Crucio 5 times', target: 5 }
            ],
            rewards: {
                xp: 1000,
                galleons: 1000
            }
        }
    };
    
    // ===== Start Quest =====
    static async startQuest(playerId, questId) {
        try {
            const player = await PlayerModel.findOne({ playerId });
            
            if (!player) {
                return {
                    success: false,
                    error: 'Player not found'
                };
            }
            
            const quest = this.QUESTS[questId];
            
            if (!quest) {
                return {
                    success: false,
                    error: 'Quest not found'
                };
            }
            
            // Check requirements
            if (quest.requirements.level && player.xpLevel < quest.requirements.level) {
                return {
                    success: false,
                    error: `Requires level ${quest.requirements.level}`,
                    requiredLevel: quest.requirements.level,
                    currentLevel: player.xpLevel
                };
            }
            
            // Check if already active
            const existingQuest = player.quests.find(q => q.questId === questId);
            
            if (existingQuest && !existingQuest.completed) {
                return {
                    success: false,
                    error: 'Quest already active'
                };
            }
            
            if (existingQuest && existingQuest.completed) {
                return {
                    success: false,
                    error: 'Quest already completed'
                };
            }
            
            // Add quest to player
            const questProgress = {
                questId: questId,
                progress: 0,
                targetProgress: quest.objectives.reduce((sum, obj) => sum + obj.target, 0),
                completed: false,
                startedAt: new Date()
            };
            
            player.quests.push(questProgress);
            await player.save();
            
            console.log(`📋 ${player.username} started quest: ${quest.name}`);
            
            return {
                success: true,
                quest: quest,
                progress: questProgress
            };
            
        } catch (error) {
            console.error('❌ Error starting quest:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    // ===== Update Quest Progress =====
    static async updateQuestProgress(playerId, questId, objectiveId, increment = 1) {
        try {
            const player = await PlayerModel.findOne({ playerId });
            
            if (!player) {
                return {
                    success: false,
                    error: 'Player not found'
                };
            }
            
            const questProgress = player.quests.find(q => q.questId === questId);
            
            if (!questProgress) {
                return {
                    success: false,
                    error: 'Quest not active'
                };
            }
            
            if (questProgress.completed) {
                return {
                    success: false,
                    error: 'Quest already completed'
                };
            }
            
            const quest = this.QUESTS[questId];
            
            // Update progress
            questProgress.progress += increment;
            
            // Check if quest completed
            if (questProgress.progress >= questProgress.targetProgress) {
                questProgress.completed = true;
                questProgress.completedAt = new Date();
                
                // Award rewards
                const rewardResult = await this.awardQuestRewards(player, quest);
                
                await player.save();
                
                console.log(`✅ ${player.username} completed quest: ${quest.name}`);
                
                return {
                    success: true,
                    completed: true,
                    quest: quest,
                    progress: questProgress,
                    rewards: rewardResult
                };
            }
            
            await player.save();
            
            return {
                success: true,
                completed: false,
                progress: questProgress
            };
            
        } catch (error) {
            console.error('❌ Error updating quest progress:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    // ===== Complete Quest =====
    static async completeQuest(playerId, questId) {
        try {
            const player = await PlayerModel.findOne({ playerId });
            
            if (!player) {
                return {
                    success: false,
                    error: 'Player not found'
                };
            }
            
            const questProgress = player.quests.find(q => q.questId === questId);
            
            if (!questProgress) {
                return {
                    success: false,
                    error: 'Quest not active'
                };
            }
            
            if (questProgress.completed) {
                return {
                    success: false,
                    error: 'Quest already completed'
                };
            }
            
            const quest = this.QUESTS[questId];
            
            // Mark as completed
            questProgress.completed = true;
            questProgress.completedAt = new Date();
            
            // Update stats
            player.stats.questsCompleted += 1;
            
            // Award rewards
            const rewardResult = await this.awardQuestRewards(player, quest);
            
            await player.save();
            
            console.log(`✅ ${player.username} completed quest: ${quest.name}`);
            
            return {
                success: true,
                quest: quest,
                rewards: rewardResult
            };
            
        } catch (error) {
            console.error('❌ Error completing quest:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    // ===== Award Quest Rewards =====
    static async awardQuestRewards(player, quest) {
        const rewards = {
            xp: 0,
            galleons: 0,
            items: []
        };
        
        // Award XP
        if (quest.rewards.xp) {
            const oldLevel = player.xpLevel;
            player.xp += quest.rewards.xp;
            
            const { level, progress } = xpCalculator.calculateLevelAndProgress(player.xp);
            player.xpLevel = level;
            player.xpProgress = progress;
            
            rewards.xp = quest.rewards.xp;
            rewards.leveledUp = level > oldLevel;
        }
        
        // Award Galleons
        if (quest.rewards.galleons) {
            player.galleons += quest.rewards.galleons;
            rewards.galleons = quest.rewards.galleons;
        }
        
        // Award Items
        if (quest.rewards.items && quest.rewards.items.length > 0) {
            for (const itemId of quest.rewards.items) {
                try {
                    await player.addItem(itemId, 1);
                    rewards.items.push(itemId);
                } catch (error) {
                    console.error(`Failed to add item ${itemId}:`, error.message);
                }
            }
        }
        
        return rewards;
    }
    
    // ===== Get Active Quests =====
    static async getActiveQuests(playerId) {
        try {
            const player = await PlayerModel.findOne({ playerId });
            
            if (!player) {
                return {
                    success: false,
                    error: 'Player not found'
                };
            }
            
            const activeQuests = player.quests
                .filter(q => !q.completed)
                .map(q => {
                    const questData = this.QUESTS[q.questId];
                    return {
                        ...questData,
                        progress: q.progress,
                        targetProgress: q.targetProgress,
                        percentage: Math.floor((q.progress / q.targetProgress) * 100)
                    };
                });
            
            return {
                success: true,
                quests: activeQuests
            };
            
        } catch (error) {
            console.error('❌ Error getting active quests:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    // ===== Get Completed Quests =====
    static async getCompletedQuests(playerId) {
        try {
            const player = await PlayerModel.findOne({ playerId });
            
            if (!player) {
                return {
                    success: false,
                    error: 'Player not found'
                };
            }
            
            const completedQuests = player.quests
                .filter(q => q.completed)
                .map(q => {
                    const questData = this.QUESTS[q.questId];
                    return {
                        ...questData,
                        completedAt: q.completedAt
                    };
                });
            
            return {
                success: true,
                quests: completedQuests,
                count: completedQuests.length
            };
            
        } catch (error) {
            console.error('❌ Error getting completed quests:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    // ===== Get Available Quests =====
    static async getAvailableQuests(playerId) {
        try {
            const player = await PlayerModel.findOne({ playerId });
            
            if (!player) {
                return {
                    success: false,
                    error: 'Player not found'
                };
            }
            
            const playerQuestIds = player.quests.map(q => q.questId);
            
            const availableQuests = Object.values(this.QUESTS).filter(quest => {
                // Check if already started or completed
                if (playerQuestIds.includes(quest.id)) {
                    return false;
                }
                
                // Check level requirement
                if (quest.requirements.level && player.xpLevel < quest.requirements.level) {
                    return false;
                }
                
                return true;
            });
            
            return {
                success: true,
                quests: availableQuests
            };
            
        } catch (error) {
            console.error('❌ Error getting available quests:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    // ===== Abandon Quest =====
    static async abandonQuest(playerId, questId) {
        try {
            const player = await PlayerModel.findOne({ playerId });
            
            if (!player) {
                return {
                    success: false,
                    error: 'Player not found'
                };
            }
            
            const questIndex = player.quests.findIndex(q => q.questId === questId);
            
            if (questIndex === -1) {
                return {
                    success: false,
                    error: 'Quest not found'
                };
            }
            
            if (player.quests[questIndex].completed) {
                return {
                    success: false,
                    error: 'Cannot abandon completed quest'
                };
            }
            
            player.quests.splice(questIndex, 1);
            await player.save();
            
            console.log(`❌ ${player.username} abandoned quest: ${questId}`);
            
            return {
                success: true,
                message: 'Quest abandoned'
            };
            
        } catch (error) {
            console.error('❌ Error abandoning quest:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = QuestController;