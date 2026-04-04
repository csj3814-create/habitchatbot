function createChatIdentity({ platform, userId, displayName, legacySender = null, room = null }) {
    if (!platform) {
        throw new Error('platform is required');
    }

    if (!userId) {
        throw new Error('userId is required');
    }

    return {
        platform,
        userId: String(userId),
        displayName: displayName || String(userId),
        legacySender: legacySender || displayName || String(userId),
        room
    };
}

module.exports = { createChatIdentity };
