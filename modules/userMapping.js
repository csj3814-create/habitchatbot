/**
 * Chat identity to Habits School app account mapping helpers.
 * Supports stable identity keys with backward compatibility for legacy sender-name mappings.
 */

const admin = require('firebase-admin');

function getDb() {
    return admin.database();
}

function encodeKey(value) {
    return String(value || '').replace(/[.#$[\]\/]/g, '_');
}

function getDisplayName(user) {
    if (typeof user === 'string') {
        return user;
    }

    return user?.displayName || user?.sender || user?.nickname || user?.userId || '사용자';
}

function buildIdentityKey(user) {
    if (typeof user === 'string') {
        return encodeKey(user);
    }

    const platform = user?.platform || 'legacy';
    const userId = user?.userId || user?.sender || user?.displayName;

    if (!userId) {
        throw new Error('Missing user identity');
    }

    return encodeKey(`${platform}:${userId}`);
}

function buildLegacyKeys(user) {
    if (typeof user === 'string') {
        return [encodeKey(user)];
    }

    const candidates = [
        user?.legacySender,
        user?.sender,
        user?.displayName,
        user?.nickname
    ].filter(Boolean);

    return [...new Set(candidates.map(encodeKey))];
}

async function readMappingByKey(key) {
    const snapshot = await getDb().ref(`user_mappings/${key}`).once('value');
    return snapshot.val();
}

/**
 * @param {object} [options]
 * @param {string} [options.linkSource]         how the link was established
 * @param {string} [options.previousIdentityKey] set when a link moved between identity keys
 */
async function registerUser(user, googleEmail, googleUid, options = {}) {
    const db = getDb();
    const key = buildIdentityKey(user);
    const displayName = getDisplayName(user);
    const now = new Date().toISOString();

    const record = {
        identityKey: key,
        platform: typeof user === 'string' ? 'legacy' : (user.platform || 'legacy'),
        sender: displayName,
        displayName,
        googleEmail,
        googleUid,
        registeredAt: now,
        // Snapshot of the nickname at link time. The identity key is derived from
        // a mutable display name, so this is what a future stable-id migration
        // will need to reconcile against.
        linkedDisplayName: displayName,
        linkedAt: now,
        linkSource: options.linkSource || 'unknown'
    };

    if (options.previousIdentityKey) {
        record.previousIdentityKey = options.previousIdentityKey;
    }

    await db.ref(`user_mappings/${key}`).set(record);

    console.log(`[UserMapping] Registered: ${displayName} -> ${googleEmail} (uid: ${googleUid})`);
}

async function getMapping(user) {
    const db = getDb();
    const stableKey = buildIdentityKey(user);
    const stableMapping = await readMappingByKey(stableKey);
    if (stableMapping) {
        return stableMapping;
    }

    for (const legacyKey of buildLegacyKeys(user)) {
        if (legacyKey === stableKey) {
            continue;
        }

        const legacyMapping = await readMappingByKey(legacyKey);
        if (!legacyMapping) {
            continue;
        }

        const migrated = {
            ...legacyMapping,
            identityKey: stableKey,
            platform: typeof user === 'string' ? 'legacy' : (user.platform || legacyMapping.platform || 'legacy'),
            sender: getDisplayName(user),
            displayName: getDisplayName(user),
            migratedFrom: legacyKey
        };

        await db.ref(`user_mappings/${stableKey}`).set(migrated);
        console.log(`[UserMapping] Migrated legacy mapping ${legacyKey} -> ${stableKey}`);
        return migrated;
    }

    return null;
}

async function findAppUserByEmail(googleEmail) {
    try {
        let appInstance;
        try {
            appInstance = admin.app('habitsSchoolApp');
        } catch (_) {
            const { initAppFirebase } = require('./appFirebase');
            const db = initAppFirebase();
            if (!db) {
                console.error('[UserMapping] Failed to initialize Habits School Firebase app.');
                return null;
            }
            appInstance = admin.app('habitsSchoolApp');
        }

        const userRecord = await appInstance.auth().getUserByEmail(googleEmail);
        return {
            uid: userRecord.uid,
            email: userRecord.email,
            displayName: userRecord.displayName || null
        };
    } catch (error) {
        if (error.code === 'auth/user-not-found') {
            return null;
        }

        console.error('[UserMapping] App user lookup failed:', error.code, error.message);
        return null;
    }
}

async function getAllMappings() {
    const snapshot = await getDb().ref('user_mappings').once('value');
    return snapshot.val() || {};
}

async function removeMapping(user) {
    const db = getDb();
    const keys = new Set([buildIdentityKey(user), ...buildLegacyKeys(user)]);

    await Promise.all([...keys].map(key => db.ref(`user_mappings/${key}`).remove()));
}

async function removeMappingByKey(key) {
    if (!key) {
        return;
    }

    await getDb().ref(`user_mappings/${key}`).remove();
}

/**
 * Reverse lookup: which identity keys already point at this app account?
 * Used to tell a nickname change apart from a genuinely new link.
 */
async function findMappingsByGoogleUid(googleUid) {
    if (!googleUid) {
        return [];
    }

    const all = await getAllMappings();

    return Object.entries(all)
        .filter(([, mapping]) => mapping?.googleUid === googleUid)
        .map(([key, mapping]) => ({ key, mapping }));
}

module.exports = {
    registerUser,
    getMapping,
    getAllMappings,
    findAppUserByEmail,
    findMappingsByGoogleUid,
    removeMapping,
    removeMappingByKey,
    getDisplayName,
    buildIdentityKey
};
