// shop.js - Shop system routes (COMPLETE FIXED VERSION)
const express = require('express');
const router = express.Router();
const PlayerModel = require('../models/PlayerModel');
const { authenticateToken } = require('./auth');

// ===== Shop Items Database =====
const SHOP_ITEMS = {
    // Wands
    'basic_wand': {
        id: 'basic_wand',
        name: 'Basic Wand',
        type: 'wand',
        price: 0,
        description: 'A simple wand for beginners',
        stats: { damage: 1.0 }
    },
    'oak_wand': {
        id: 'oak_wand',
        name: 'Oak Wand',
        type: 'wand',
        price: 100,
        description: 'Sturdy oak wand',
        requiredLevel: 5,
        stats: { damage: 1.2 }
    },
    'elder_wand': {
        id: 'elder_wand',
        name: 'Elder Wand',
        type: 'wand',
        price: 1000,
        description: 'The legendary Elder Wand',
        requiredLevel: 20,
        stats: { damage: 2.0 }
    },
    
    // Robes
    'basic_robe': {
        id: 'basic_robe',
        name: 'Basic Robe',
        type: 'robe',
        price: 0,
        description: 'Standard student robe',
        stats: { defense: 1.0 }
    },
    'enchanted_robe': {
        id: 'enchanted_robe',
        name: 'Enchanted Robe',
        type: 'robe',
        price: 200,
        description: 'Magically enhanced robe',
        requiredLevel: 10,
        stats: { defense: 1.5 }
    },
    
    // Brooms
    'nimbus_2000': {
        id: 'nimbus_2000',
        name: 'Nimbus 2000',
        type: 'broom',
        price: 500,
        description: 'Fast and reliable racing broom',
        requiredLevel: 8,
        stats: { speed: 1.5 }
    },
    'firebolt': {
        id: 'firebolt',
        name: 'Firebolt',
        type: 'broom',
        price: 2000,
        description: 'The fastest broom available',
        requiredLevel: 15,
        stats: { speed: 2.0 }
    },
    
    // Potions
    'health_potion': {
        id: 'health_potion',
        name: 'Health Potion',
        type: 'potion',
        price: 50,
        description: 'Restores 50 HP',
        consumable: true,
        effect: { healAmount: 50 }
    },
    'greater_health_potion': {
        id: 'greater_health_potion',
        name: 'Greater Health Potion',
        type: 'potion',
        price: 100,
        description: 'Restores 100 HP',
        requiredLevel: 5,
        consumable: true,
        effect: { healAmount: 100 }
    },
    'xp_boost_potion': {
        id: 'xp_boost_potion',
        name: 'XP Boost Potion',
        type: 'potion',
        price: 150,
        description: 'Double XP for 30 minutes',
        requiredLevel: 3,
        consumable: true,
        effect: { xpMultiplier: 2.0, duration: 1800 }
    },
    
    // Pets
    'owl': {
        id: 'owl',
        name: 'Snowy Owl',
        type: 'pet',
        price: 300,
        description: 'A loyal companion',
        requiredLevel: 5
    },
    'cat': {
        id: 'cat',
        name: 'Black Cat',
        type: 'pet',
        price: 250,
        description: 'A mysterious feline friend',
        requiredLevel: 5
    },
    'toad': {
        id: 'toad',
        name: 'Toad',
        type: 'pet',
        price: 100,
        description: 'A humble toad',
        requiredLevel: 1
    },
    
    // Special Items
    'horcrux': {
        id: 'horcrux',
        name: 'Horcrux',
        type: 'special',
        price: 5000,
        description: 'An extra life',
        requiredLevel: 20,
        consumable: true,
        special: true
    },
    'time_turner': {
        id: 'time_turner',
        name: 'Time Turner',
        type: 'special',
        price: 10000,
        description: 'Turn back time (reset cooldowns)',
        requiredLevel: 25,
        consumable: true,
        special: true
    }
};

// ===== Get All Shop Items =====
router.get('/items', async (req, res) => {
    try {
        const { type, minLevel, maxPrice } = req.query;
        
        let items = Object.values(SHOP_ITEMS);
        
        // Filter by type
        if (type) {
            items = items.filter(item => item.type === type);
        }
        
        // Filter by level requirement
        if (minLevel) {
            const level = parseInt(minLevel);
            items = items.filter(item => !item.requiredLevel || item.requiredLevel <= level);
        }
        
        // Filter by price
        if (maxPrice) {
            const price = parseInt(maxPrice);
            items = items.filter(item => item.price <= price);
        }
        
        res.json({
            items: items,
            count: items.length
        });
        
    } catch (error) {
        console.error('❌ Error getting shop items:', error);
        res.status(500).json({ error: 'Failed to get shop items' });
    }
});

// ===== Get Item Details =====
router.get('/items/:itemId', async (req, res) => {
    try {
        const { itemId } = req.params;
        
        const item = SHOP_ITEMS[itemId];
        
        if (!item) {
            return res.status(404).json({ error: 'Item not found' });
        }
        
        res.json(item);
        
    } catch (error) {
        console.error('❌ Error getting item:', error);
        res.status(500).json({ error: 'Failed to get item' });
    }
});

// ===== Purchase Item =====
router.post('/purchase', authenticateToken, async (req, res) => {
    try {
        const { playerId, itemId, quantity } = req.body;
        
        // Verify player is making purchase for themselves
        if (req.user.playerId !== playerId) {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        const player = await PlayerModel.findOne({ playerId });
        
        if (!player) {
            return res.status(404).json({ error: 'Player not found' });
        }
        
        const item = SHOP_ITEMS[itemId];
        
        if (!item) {
            return res.status(404).json({ error: 'Item not found in shop' });
        }
        
        // Check level requirement
        if (item.requiredLevel && player.xpLevel < item.requiredLevel) {
            return res.status(403).json({ 
                error: `Requires level ${item.requiredLevel}`,
                requiredLevel: item.requiredLevel,
                currentLevel: player.xpLevel
            });
        }
        
        const purchaseQuantity = quantity || 1;
        const totalCost = item.price * purchaseQuantity;
        
        // Check if player has enough galleons
        if (player.galleons < totalCost) {
            return res.status(400).json({ 
                error: 'Insufficient galleons',
                required: totalCost,
                current: player.galleons
            });
        }
        
        // Deduct galleons
        player.galleons -= totalCost;
        
        // Handle different item types
        switch (item.type) {
            case 'wand':
                player.equipment.wandId = itemId;
                break;
                
            case 'robe':
                player.equipment.robeId = itemId;
                break;
                
            case 'broom':
                player.equipment.broomId = itemId;
                break;
                
            case 'pet':
                player.equipment.petId = itemId;
                break;
                
            case 'potion':
            case 'special':
                // Add to inventory (handle array structure)
                if (!player.inventory) {
                    player.inventory = [];
                }
                
                if (Array.isArray(player.inventory)) {
                    const existingItem = player.inventory.find(i => i.itemId === itemId);
                    if (existingItem) {
                        existingItem.quantity += purchaseQuantity;
                    } else {
                        player.inventory.push({ itemId, quantity: purchaseQuantity });
                    }
                }
                break;
                
            default:
                if (!player.inventory) {
                    player.inventory = [];
                }
                
                if (Array.isArray(player.inventory)) {
                    const existingItem = player.inventory.find(i => i.itemId === itemId);
                    if (existingItem) {
                        existingItem.quantity += purchaseQuantity;
                    } else {
                        player.inventory.push({ itemId, quantity: purchaseQuantity });
                    }
                }
        }
        
        await player.save();
        
        console.log(`🛒 ${player.username} purchased ${purchaseQuantity}x ${item.name} for ${totalCost} galleons`);
        
        res.json({
            success: true,
            message: `Purchased ${item.name}`,
            item: item,
            quantity: purchaseQuantity,
            totalCost: totalCost,
            remainingGalleons: player.galleons,
            equipment: player.equipment,
            inventory: player.inventory
        });
        
    } catch (error) {
        console.error('❌ Error purchasing item:', error);
        res.status(500).json({ error: 'Failed to purchase item' });
    }
});

// ===== Sell Item =====
router.post('/sell', authenticateToken, async (req, res) => {
    try {
        const { playerId, itemId, quantity } = req.body;
        
        if (req.user.playerId !== playerId) {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        const player = await PlayerModel.findOne({ playerId });
        
        if (!player) {
            return res.status(404).json({ error: 'Player not found' });
        }
        
        const item = SHOP_ITEMS[itemId];
        
        if (!item) {
            return res.status(404).json({ error: 'Item not recognized' });
        }
        
        // Handle inventory structure
        let inventoryItem;
        
        if (Array.isArray(player.inventory)) {
            inventoryItem = player.inventory.find(i => i.itemId === itemId);
        } else if (player.inventory && player.inventory.items) {
            inventoryItem = player.inventory.items.find(i => i.itemId === itemId);
        } else {
            return res.status(400).json({ error: 'Invalid inventory structure' });
        }
        
        if (!inventoryItem || inventoryItem.quantity < (quantity || 1)) {
            return res.status(400).json({ error: 'Item not found in inventory' });
        }
        
        const sellQuantity = quantity || 1;
        const sellPrice = Math.floor(item.price * 0.5);
        const totalEarned = sellPrice * sellQuantity;
        
        // Remove item quantity
        inventoryItem.quantity -= sellQuantity;
        
        // Remove from array if quantity is 0
        if (inventoryItem.quantity <= 0) {
            if (Array.isArray(player.inventory)) {
                const index = player.inventory.indexOf(inventoryItem);
                player.inventory.splice(index, 1);
            } else if (player.inventory.items) {
                const index = player.inventory.items.indexOf(inventoryItem);
                player.inventory.items.splice(index, 1);
            }
        }
        
        player.galleons += totalEarned;
        await player.save();
        
        console.log(`💰 ${player.username} sold ${sellQuantity}x ${item.name} for ${totalEarned} galleons`);
        
        res.json({
            success: true,
            message: `Sold ${item.name}`,
            quantity: sellQuantity,
            totalEarned: totalEarned,
            remainingGalleons: player.galleons,
            inventory: player.inventory
        });
        
    } catch (error) {
        console.error('❌ Error selling item:', error);
        res.status(500).json({ error: 'Failed to sell item' });
    }
});

// ===== Use Consumable Item =====
router.post('/use', authenticateToken, async (req, res) => {
    try {
        const { playerId, itemId } = req.body;
        
        if (req.user.playerId !== playerId) {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        const player = await PlayerModel.findOne({ playerId });
        
        if (!player) {
            return res.status(404).json({ error: 'Player not found' });
        }
        
        const item = SHOP_ITEMS[itemId];
        
        if (!item || !item.consumable) {
            return res.status(400).json({ error: 'Item is not consumable' });
        }
        
        // Handle inventory structure
        let inventoryItem;
        
        if (Array.isArray(player.inventory)) {
            inventoryItem = player.inventory.find(i => i.itemId === itemId);
        } else if (player.inventory && player.inventory.items) {
            inventoryItem = player.inventory.items.find(i => i.itemId === itemId);
        } else {
            return res.status(400).json({ error: 'Invalid inventory structure' });
        }
        
        if (!inventoryItem || inventoryItem.quantity < 1) {
            return res.status(400).json({ error: 'Item not found in inventory' });
        }
        
        // Apply item effect
        let effectResult = {};
        
        if (item.effect) {
            if (item.effect.healAmount) {
                const healAmount = item.effect.healAmount;
                const oldHealth = player.currentHealth;
                player.currentHealth = Math.min(player.currentHealth + healAmount, player.maxHealth);
                
                effectResult.healed = player.currentHealth - oldHealth;
                effectResult.currentHealth = player.currentHealth;
                effectResult.maxHealth = player.maxHealth;
            }
            
            if (item.effect.xpMultiplier) {
                effectResult.xpBoost = {
                    multiplier: item.effect.xpMultiplier,
                    duration: item.effect.duration
                };
            }
        }
        
        // Special items
        if (item.id === 'horcrux') {
            player.horcruxes += 1;
            effectResult.horcruxesAdded = 1;
            effectResult.totalHorcruxes = player.horcruxes;
        }
        
        if (item.id === 'time_turner') {
            effectResult.cooldownsReset = true;
        }
        
        // Remove item from inventory
        inventoryItem.quantity -= 1;
        
        // Remove from array if quantity is 0
        if (inventoryItem.quantity <= 0) {
            if (Array.isArray(player.inventory)) {
                const index = player.inventory.indexOf(inventoryItem);
                player.inventory.splice(index, 1);
            } else if (player.inventory.items) {
                const index = player.inventory.items.indexOf(inventoryItem);
                player.inventory.items.splice(index, 1);
            }
        }
        
        await player.save();
        
        console.log(`✨ ${player.username} used ${item.name}`);
        
        res.json({
            success: true,
            message: `Used ${item.name}`,
            effect: effectResult,
            inventory: player.inventory
        });
        
    } catch (error) {
        console.error('❌ Error using item:', error);
        res.status(500).json({ error: 'Failed to use item' });
    }
});

// ===== Get Player's Affordable Items =====
router.get('/affordable/:playerId', authenticateToken, async (req, res) => {
    try {
        const { playerId } = req.params;
        
        if (req.user.playerId !== playerId) {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        const player = await PlayerModel.findOne({ playerId });
        
        if (!player) {
            return res.status(404).json({ error: 'Player not found' });
        }
        
        const affordableItems = Object.values(SHOP_ITEMS).filter(item => {
            const canAfford = item.price <= player.galleons;
            const hasLevel = !item.requiredLevel || player.xpLevel >= item.requiredLevel;
            return canAfford && hasLevel;
        });
        
        res.json({
            items: affordableItems,
            playerGalleons: player.galleons,
            playerLevel: player.xpLevel
        });
        
    } catch (error) {
        console.error('❌ Error getting affordable items:', error);
        res.status(500).json({ error: 'Failed to get affordable items' });
    }
});

// ===== Daily Deals =====
router.get('/daily-deals', async (req, res) => {
    try {
        const allItems = Object.values(SHOP_ITEMS);
        const shuffled = allItems.sort(() => 0.5 - Math.random());
        const dailyDeals = shuffled.slice(0, 3).map(item => ({
            ...item,
            originalPrice: item.price,
            price: Math.floor(item.price * 0.8),
            discount: 20
        }));
        
        res.json({
            deals: dailyDeals,
            expiresIn: 86400
        });
        
    } catch (error) {
        console.error('❌ Error getting daily deals:', error);
        res.status(500).json({ error: 'Failed to get daily deals' });
    }
});

module.exports = router;