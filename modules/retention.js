/**
 * Retention enforcement for chat-derived data.
 *
 * The published privacy policy promises that MessengerBot data belonging to
 * someone who never linked an app account is deleted after 30 days. Writing that
 * promise down without running the deletion would itself be the violation, so
 * this job exists to make it true.
 *
 * Scope is deliberately narrow:
 *   - only Realtime DB keys under `users/` prefixed `messengerbot:`
 *   - only keys with no entry in `user_mappings` (i.e. never linked)
 *   - plus expired connect tokens, which are otherwise only cleaned lazily on
 *     read and therefore linger forever if nobody opens them
 */

const MESSENGERBOT_KEY_PREFIX = 'messengerbot:';
const CONNECT_TOKEN_PATH = 'chatbot_connect_tokens';

function toTimestampMs(value) {
    if (!value) {
        return NaN;
    }

    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? NaN : parsed;
}

/**
 * Newest activity for one chat-record node, or NaN when it cannot be determined.
 * An unreadable/empty node is treated as having no activity, which makes it
 * eligible for deletion rather than immortal.
 */
function latestRecordTimestamp(userNode) {
    const records = userNode?.records;

    if (!records || typeof records !== 'object') {
        return NaN;
    }

    let newest = NaN;

    for (const record of Object.values(records)) {
        const stamp = toTimestampMs(record?.timestamp);
        if (!Number.isNaN(stamp) && (Number.isNaN(newest) || stamp > newest)) {
            newest = stamp;
        }
    }

    return newest;
}

function isExpiredForRetention(newestMs, cutoffMs) {
    // No usable timestamp at all -> nothing proves it is recent, so purge it.
    return Number.isNaN(newestMs) || newestMs < cutoffMs;
}

async function purgeUnlinkedChatData(db, { retentionDays = 30, now = Date.now() } = {}) {
    const cutoffMs = now - retentionDays * 24 * 60 * 60 * 1000;
    const summary = { scanned: 0, deletedUsers: 0, deletedTokens: 0 };

    const [usersSnapshot, mappingsSnapshot] = await Promise.all([
        db.ref('users').once('value'),
        db.ref('user_mappings').once('value')
    ]);

    const users = usersSnapshot.val() || {};
    const mappings = mappingsSnapshot.val() || {};

    for (const [key, node] of Object.entries(users)) {
        if (!key.startsWith(MESSENGERBOT_KEY_PREFIX)) {
            continue;
        }

        summary.scanned += 1;

        // Linked members are out of scope: the policy covers people who never
        // completed a link.
        if (mappings[key]) {
            continue;
        }

        if (!isExpiredForRetention(latestRecordTimestamp(node), cutoffMs)) {
            continue;
        }

        await db.ref(`users/${key}`).remove();
        summary.deletedUsers += 1;
    }

    const tokensSnapshot = await db.ref(CONNECT_TOKEN_PATH).once('value');
    const tokens = tokensSnapshot.val() || {};

    for (const [token, data] of Object.entries(tokens)) {
        const expiresAtMs = toTimestampMs(data?.expiresAt);

        if (!Number.isNaN(expiresAtMs) && expiresAtMs >= now) {
            continue;
        }

        await db.ref(`${CONNECT_TOKEN_PATH}/${token}`).remove();
        summary.deletedTokens += 1;
    }

    return summary;
}

/**
 * Wraps the purge so a scheduled caller cannot stack overlapping runs and never
 * crashes the process on a transient database error.
 */
function createRetentionRunner(db, { retentionDays = 30 } = {}) {
    let running = false;

    return async function runRetention() {
        if (running) {
            console.log('[Retention] Previous run still in progress; skipping.');
            return null;
        }

        running = true;

        try {
            const summary = await purgeUnlinkedChatData(db, { retentionDays });
            // Counts only. Never log the nicknames themselves.
            console.log(
                `[Retention] Scanned ${summary.scanned} unlinked-eligible nodes, ` +
                `deleted ${summary.deletedUsers} chat records and ${summary.deletedTokens} expired connect tokens.`
            );
            return summary;
        } catch (error) {
            console.error('[Retention] Purge failed:', error.message);
            return null;
        } finally {
            running = false;
        }
    };
}

module.exports = {
    purgeUnlinkedChatData,
    createRetentionRunner,
    latestRecordTimestamp,
    isExpiredForRetention,
    MESSENGERBOT_KEY_PREFIX
};
