// utils/xpCalculator.js - XP calculation utilities
// هر 20 XP = 1 قسمت (Segment)
// هر 5 قسمت = 1 لول

const XP_PER_SEGMENT = 20;
const SEGMENTS_PER_LEVEL = 5;

class XPCalculator {
    
    // ===== Calculate Level and Progress from Total XP =====
    static calculateLevelAndProgress(totalXP) {
        // محاسبه تعداد کل segments
        const totalSegments = Math.floor(totalXP / XP_PER_SEGMENT);
        
        // محاسبه level
        const level = Math.floor(totalSegments / SEGMENTS_PER_LEVEL);
        
        // محاسبه progress در level فعلی (0-4)
        const progress = totalSegments % SEGMENTS_PER_LEVEL;
        
        return {
            level: level,
            progress: progress,
            totalSegments: totalSegments
        };
    }
    
    // ===== Calculate Total XP Required for a Specific Level =====
    static getTotalXPForLevel(level) {
        const totalSegments = level * SEGMENTS_PER_LEVEL;
        return totalSegments * XP_PER_SEGMENT;
    }
    
    // ===== Calculate XP Required for Next Level =====
    static getXPForNextLevel(currentLevel) {
        const currentLevelXP = this.getTotalXPForLevel(currentLevel);
        const nextLevelXP = this.getTotalXPForLevel(currentLevel + 1);
        
        return nextLevelXP - currentLevelXP;
    }
    
    // ===== Calculate XP Remaining to Next Level =====
    static getXPToNextLevel(currentXP) {
        const { level } = this.calculateLevelAndProgress(currentXP);
        const nextLevelXP = this.getTotalXPForLevel(level + 1);
        
        return Math.max(0, nextLevelXP - currentXP);
    }
    
    // ===== Calculate Progress Percentage in Current Level =====
    static getLevelProgressPercentage(currentXP) {
        const { level, progress } = this.calculateLevelAndProgress(currentXP);
        
        const percentage = (progress / SEGMENTS_PER_LEVEL) * 100;
        
        return Math.floor(percentage);
    }
    
    // ===== Calculate XP for Enemy Kill =====
    static calculateEnemyKillXP(enemyLevel, playerLevel, isSameHouse = false) {
        // جریمه برای کشتن همگروهی
        if (isSameHouse) {
            return -30;
        }
        
        const baseXP = 20;
        const levelBonus = enemyLevel * 2;
        
        // Bonus برای کشتن دشمن قوی‌تر
        const levelDiff = enemyLevel - playerLevel;
        let difficultyBonus = 0;
        
        if (levelDiff > 0) {
            difficultyBonus = levelDiff * 5; // +5 XP per level above
        } else if (levelDiff < -5) {
            // Penalty برای کشتن دشمن خیلی ضعیف‌تر
            difficultyBonus = levelDiff; // -1 XP per level below (up to -5)
        }
        
        const totalXP = baseXP + levelBonus + difficultyBonus;
        
        return Math.max(5, totalXP); // حداقل 5 XP
    }
    
    // ===== Calculate XP for Quest =====
    static calculateQuestXP(questDifficulty, questType = 'normal') {
        const baseXP = 50;
        const difficultyMultiplier = questDifficulty;
        
        let typeBonus = 1.0;
        
        switch (questType) {
            case 'main':
                typeBonus = 2.0; // Main quests give double XP
                break;
            case 'side':
                typeBonus = 1.0;
                break;
            case 'daily':
                typeBonus = 0.5;
                break;
            case 'special':
                typeBonus = 3.0;
                break;
        }
        
        return Math.floor(baseXP * difficultyMultiplier * typeBonus);
    }
    
    // ===== Calculate XP for Secret Discovery =====
    static calculateSecretXP(secretRarity = 'common') {
        const rarityXP = {
            'common': 20,
            'uncommon': 40,
            'rare': 80,
            'epic': 150,
            'legendary': 300
        };
        
        return rarityXP[secretRarity] || 20;
    }
    
    // ===== Calculate XP for Minigame =====
    static calculateMinigameXP(minigameName, won = true, performance = 1.0) {
        const baseXP = {
            'quidditch': 50,
            'wizard_chess': 30,
            'potion_brewing': 40,
            'dueling': 60
        };
        
        const xp = baseXP[minigameName] || 30;
        
        // Win multiplier
        const winMultiplier = won ? 1.5 : 0.5;
        
        // Performance bonus (0.5 - 2.0)
        const performanceBonus = Math.max(0.5, Math.min(2.0, performance));
        
        return Math.floor(xp * winMultiplier * performanceBonus);
    }
    
    // ===== Calculate XP Multiplier Based on Conditions =====
    static calculateXPMultiplier(conditions = {}) {
        let multiplier = 1.0;
        
        // Weekend bonus
        if (conditions.isWeekend) {
            multiplier *= 1.5;
        }
        
        // Event bonus
        if (conditions.isEvent) {
            multiplier *= 2.0;
        }
        
        // House cup bonus (if winning)
        if (conditions.houseCupLeading) {
            multiplier *= 1.2;
        }
        
        // Premium/VIP bonus
        if (conditions.isPremium) {
            multiplier *= 1.5;
        }
        
        // Party/Group bonus
        if (conditions.partySize > 1) {
            multiplier *= (1 + (conditions.partySize * 0.1)); // +10% per party member
        }
        
        return multiplier;
    }
    
    // ===== Apply XP Multiplier =====
    static applyMultiplier(baseXP, multiplier) {
        return Math.floor(baseXP * multiplier);
    }
    
    // ===== Calculate Level from Total XP (Alternative) =====
    static getLevelFromXP(xp) {
        return this.calculateLevelAndProgress(xp).level;
    }
    
    // ===== Get Segments Needed for Next Level =====
    static getSegmentsToNextLevel(currentXP) {
        const { progress } = this.calculateLevelAndProgress(currentXP);
        return SEGMENTS_PER_LEVEL - progress;
    }
    
    // ===== Format XP Display =====
    static formatXP(xp) {
        if (xp >= 1000000) {
            return `${(xp / 1000000).toFixed(1)}M`;
        } else if (xp >= 1000) {
            return `${(xp / 1000).toFixed(1)}K`;
        }
        return xp.toString();
    }
    
    // ===== Calculate Time to Level Up (Estimated) =====
    static estimateTimeToLevelUp(currentXP, averageXPPerHour) {
        const xpNeeded = this.getXPToNextLevel(currentXP);
        const hoursNeeded = xpNeeded / averageXPPerHour;
        
        return {
            hours: Math.floor(hoursNeeded),
            minutes: Math.floor((hoursNeeded % 1) * 60),
            xpNeeded: xpNeeded,
            averageXPPerHour: averageXPPerHour
        };
    }
    
    // ===== Get Level Breakdown =====
    static getLevelBreakdown(xp) {
        const { level, progress, totalSegments } = this.calculateLevelAndProgress(xp);
        
        const currentLevelXP = this.getTotalXPForLevel(level);
        const nextLevelXP = this.getTotalXPForLevel(level + 1);
        const xpInCurrentLevel = xp - currentLevelXP;
        const xpNeededForLevel = nextLevelXP - currentLevelXP;
        
        return {
            totalXP: xp,
            level: level,
            progress: progress,
            totalSegments: totalSegments,
            currentLevelXP: currentLevelXP,
            nextLevelXP: nextLevelXP,
            xpInCurrentLevel: xpInCurrentLevel,
            xpNeededForLevel: xpNeededForLevel,
            xpToNextLevel: nextLevelXP - xp,
            progressPercentage: Math.floor((xpInCurrentLevel / xpNeededForLevel) * 100)
        };
    }
    
    // ===== Validate XP Amount =====
    static validateXP(xp) {
        if (typeof xp !== 'number') {
            return {
                valid: false,
                error: 'XP must be a number'
            };
        }
        
        if (xp < 0) {
            return {
                valid: false,
                error: 'XP cannot be negative'
            };
        }
        
        if (!Number.isFinite(xp)) {
            return {
                valid: false,
                error: 'XP must be a finite number'
            };
        }
        
        return {
            valid: true
        };
    }
    
    // ===== Constants Getters =====
    static getXPPerSegment() {
        return XP_PER_SEGMENT;
    }
    
    static getSegmentsPerLevel() {
        return SEGMENTS_PER_LEVEL;
    }
    
    // ===== Debug: Get XP Table =====
    static getXPTable(maxLevel = 20) {
        const table = [];
        
        for (let level = 0; level <= maxLevel; level++) {
            const totalXP = this.getTotalXPForLevel(level);
            const xpForNext = level < maxLevel ? this.getXPForNextLevel(level) : 0;
            
            table.push({
                level: level,
                totalXPRequired: totalXP,
                xpForNextLevel: xpForNext
            });
        }
        
        return table;
    }
}

module.exports = XPCalculator;