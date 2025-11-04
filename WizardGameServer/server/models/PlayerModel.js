// PlayerModel.js - Complete Player Model with All Methods
const mongoose = require('mongoose');

// ===== Player Schema =====
const playerSchema = new mongoose.Schema({
    playerId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        minlength: 3,
        maxlength: 20
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    passwordHash: {
        type: String,
        required: true
    },
    house: {
        type: String,
        enum: ['Gryffindor', 'Slytherin', 'Ravenclaw', 'Hufflepuff', null],
        default: null
    },
    sortingHatData: {
        hasBeenSorted: {
            type: Boolean,
            default: false
        },
        sortedAt: Date,
        answers: [Number],
        houseScores: {
            type: Map,
            of: Number
        }
    },
    xp: {
        type: Number,
        default: 0,
        min: 0
    },
    xpLevel: {
        type: Number,
        default: 1,
        min: 1
    },
    xpProgress: {
        type: Number,
        default: 0,
        min: 0
    },
    galleons: {
        type: Number,
        default: 100,
        min: 0
    },
    horcruxes: {
        type: Number,
        default: 1,
        min: 0,
        max: 10
    },
    currentHealth: {
        type: Number,
        default: 100,
        min: 0
    },
    maxHealth: {
        type: Number,
        default: 100,
        min: 1
    },
    currentZoneId: {
        type: String,
        default: 'great_hall'
    },
    position: {
        x: { type: Number, default: 75 },
        y: { type: Number, default: 35 },
        z: { type: Number, default: 0 }
    },
    unlockedSpells: {
        type: [String],
        default: ['Lumos', 'Stupefy']
    },
inventory: [{
    itemId: { 
        type: String, 
        required: true, 
        default: '' 
    },
    quantity: { 
        type: Number, 
        required: true, 
        default: 0, 
        min: 0 
    }
}],
    equipment: {
        wandId: { type: String, default: null },
        robeId: { type: String, default: null },
        broomId: { type: String, default: null },
        petId: { type: String, default: null }
    },
    characterAppearance: {
        skinTone: { type: String, default: 'fair' },
        hairColor: { type: String, default: 'brown' },
        eyeColor: { type: String, default: 'brown' },
        gender: { type: String, default: 'male' }
    },
    stats: {
        totalKills: { type: Number, default: 0 },
        playerKills: { type: Number, default: 0 },
        botKills: { type: Number, default: 0 },
        teammateKills: { type: Number, default: 0 },
        deaths: { type: Number, default: 0 },
        spellsCast: { type: Number, default: 0 },
        damageDealt: { type: Number, default: 0 },
        damageTaken: { type: Number, default: 0 },
        questsCompleted: { type: Number, default: 0 }
    },
    quests: {
        active: [String],
        completed: [String]
    },
    achievements: [String],
    friends: [String],
    loginAttempts: {
        type: Number,
        default: 0
    },
    accountLocked: {
        type: Boolean,
        default: false
    },
    lockExpiry: Date,
    currentSessionToken: String,
    sessionExpiry: Date,
    createdAt: {
        type: Date,
        default: Date.now
    },
    lastLogin: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// ===== Indexes =====
playerSchema.index({ username: 1 });
playerSchema.index({ email: 1 });
playerSchema.index({ playerId: 1 });
playerSchema.index({ house: 1 });
playerSchema.index({ xpLevel: -1 });

// ===== Instance Methods =====

// ===== Inventory Methods =====

playerSchema.methods.addItem = function(itemId, quantity = 1) {
    if (!this.inventory) {
        this.inventory = [];
    }

    const existingItem = this.inventory.find(item => item.itemId === itemId);

    if (existingItem) {
        existingItem.quantity += quantity;
    } else {
        this.inventory.push({
            itemId: itemId,
            quantity: quantity
        });
    }

    return this.save();
};

playerSchema.methods.removeItem = function(itemId, quantity = 1) {
    if (!this.inventory || this.inventory.length === 0) {
        throw new Error('Item not found');
    }

    const itemIndex = this.inventory.findIndex(item => item.itemId === itemId);

    if (itemIndex === -1) {
        throw new Error('Item not found');
    }

    const item = this.inventory[itemIndex];

    if (item.quantity < quantity) {
        throw new Error('Insufficient quantity');
    }

    item.quantity -= quantity;

    if (item.quantity <= 0) {
        this.inventory.splice(itemIndex, 1);
    }

    return this.save();
};

playerSchema.methods.hasItem = function(itemId) {
    if (!this.inventory) return false;
    return this.inventory.some(item => item.itemId === itemId && item.quantity > 0);
};

playerSchema.methods.getItemQuantity = function(itemId) {
    if (!this.inventory) return 0;
    const item = this.inventory.find(item => item.itemId === itemId);
    return item ? item.quantity : 0;
};

// ===== Spell Methods =====

playerSchema.methods.unlockSpell = function(spellName) {
    if (!this.unlockedSpells) {
        this.unlockedSpells = [];
    }

    if (!this.unlockedSpells.includes(spellName)) {
        this.unlockedSpells.push(spellName);
    }

    return this.save();
};

playerSchema.methods.hasSpell = function(spellName) {
    if (!this.unlockedSpells) return false;
    return this.unlockedSpells.includes(spellName);
};

// ===== Combat Methods =====

playerSchema.methods.takeDamage = async function(damage) {
    this.currentHealth -= damage;
    this.stats.damageTaken += damage;

    if (this.currentHealth <= 0) {
        this.currentHealth = 0;
        await this.save();
        return true; // Player died
    }

    await this.save();
    return false; // Player survived
};

playerSchema.methods.heal = async function(amount) {
    this.currentHealth = Math.min(this.currentHealth + amount, this.maxHealth);
    await this.save();
    return this.currentHealth;
};

playerSchema.methods.handleDeath = async function() {
    this.stats.deaths += 1;

    if (this.horcruxes > 0) {
        // Lose a horcrux
        this.horcruxes -= 1;
        this.currentHealth = Math.floor(this.maxHealth * 0.3); // 30% health
        
        await this.save();
        
        return {
            died: true,
            horcruxesRemaining: this.horcruxes,
            respawn: true,
            currentHealth: this.currentHealth
        };
    } else {
        // Game Over - Reset progress
        await this.resetProgress();
        
        return {
            died: true,
            horcruxesRemaining: 0,
            gameOver: true,
            message: 'All Horcruxes lost. Progress reset.'
        };
    }
};

playerSchema.methods.resetProgress = async function() {
    this.xp = 0;
    this.xpLevel = 1;
    this.xpProgress = 0;
    this.galleons = 50;
    this.horcruxes = 1;
    this.maxHealth = 100;
    this.currentHealth = 100;
    this.unlockedSpells = ['Lumos', 'Stupefy'];
    this.inventory = [];
    this.equipment = {
        wandId: null,
        robeId: null,
        broomId: null,
        petId: null
    };
    
    await this.save();
};

// ===== Static Methods =====

playerSchema.statics.findByUsername = function(username) {
    return this.findOne({ username: username });
};

playerSchema.statics.findByEmail = function(email) {
    return this.findOne({ email: email.toLowerCase() });
};

playerSchema.statics.getLeaderboard = function(limit = 10) {
    return this.find()
        .sort({ xpLevel: -1, xp: -1 })
        .limit(limit)
        .select('username house xpLevel xp stats');
};

playerSchema.statics.findByHouse = function(house) {
    return this.find({ house: house });
};

playerSchema.statics.getHouseStats = async function() {
    const houses = ['Gryffindor', 'Slytherin', 'Ravenclaw', 'Hufflepuff'];
    const stats = {};
    
    for (const house of houses) {
        const players = await this.find({ house: house });
        stats[house] = {
            totalPlayers: players.length,
            totalXP: players.reduce((sum, p) => sum + p.xp, 0),
            averageLevel: players.length > 0 
                ? players.reduce((sum, p) => sum + p.xpLevel, 0) / players.length 
                : 0
        };
    }
    
    return stats;
};

// ===== Virtual Properties =====

playerSchema.virtual('level').get(function() {
    return this.xpLevel;
});

playerSchema.virtual('healthPercentage').get(function() {
    return (this.currentHealth / this.maxHealth) * 100;
});

playerSchema.virtual('isAlive').get(function() {
    return this.currentHealth > 0;
});

// ===== Hooks/Middleware =====

// Update lastLogin before saving
playerSchema.pre('save', function(next) {
    if (this.isModified('currentSessionToken') && this.currentSessionToken) {
        this.lastLogin = new Date();
    }
    next();
});

// ===== Export Model =====
const PlayerModel = mongoose.model('Player', playerSchema);

module.exports = PlayerModel;