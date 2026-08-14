const test = require('node:test');
const assert = require('node:assert/strict');

const { purgeUnlinkedChatData, latestRecordTimestamp } = require('../modules/retention');

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-08-15T00:00:00.000Z').getTime();

function daysAgo(days) {
    return new Date(NOW - days * DAY_MS).toISOString();
}

/**
 * Minimal Realtime DB stand-in: `ref(path).once('value')` reads and
 * `ref(path).remove()` deletes, recording every removed path.
 */
function createFakeDb(data) {
    const removed = [];
    const state = JSON.parse(JSON.stringify(data));

    function read(path) {
        return path.split('/').reduce((node, segment) => (node ? node[segment] : undefined), state);
    }

    return {
        removed,
        state,
        ref(path) {
            return {
                async once() {
                    const value = read(path);
                    return { val: () => (value === undefined ? null : value) };
                },
                async remove() {
                    removed.push(path);
                    const segments = path.split('/');
                    const last = segments.pop();
                    const parent = read(segments.join('/'));
                    if (parent) delete parent[last];
                }
            };
        }
    };
}

test('latestRecordTimestamp finds the newest record and tolerates junk', () => {
    assert.equal(
        latestRecordTimestamp({ records: { a: { timestamp: daysAgo(40) }, b: { timestamp: daysAgo(5) } } }),
        new Date(daysAgo(5)).getTime()
    );
    assert.ok(Number.isNaN(latestRecordTimestamp({})));
    assert.ok(Number.isNaN(latestRecordTimestamp({ records: {} })));
    assert.ok(Number.isNaN(latestRecordTimestamp({ records: { a: { timestamp: 'not-a-date' } } })));
});

test('purge deletes unlinked messengerbot data older than the retention window', async () => {
    const db = createFakeDb({
        users: {
            'messengerbot:오래된사람': { records: { '1': { timestamp: daysAgo(45) } } }
        },
        user_mappings: {},
        chatbot_connect_tokens: {}
    });

    const summary = await purgeUnlinkedChatData(db, { retentionDays: 30, now: NOW });

    assert.deepEqual(db.removed, ['users/messengerbot:오래된사람']);
    assert.equal(summary.deletedUsers, 1);
    assert.equal(summary.scanned, 1);
});

test('purge keeps unlinked data that is still inside the retention window', async () => {
    const db = createFakeDb({
        users: {
            'messengerbot:최근사람': { records: { '1': { timestamp: daysAgo(29) } } }
        },
        user_mappings: {},
        chatbot_connect_tokens: {}
    });

    const summary = await purgeUnlinkedChatData(db, { retentionDays: 30, now: NOW });

    assert.deepEqual(db.removed, []);
    assert.equal(summary.deletedUsers, 0);
});

test('purge never deletes data belonging to a linked account, however old', async () => {
    const db = createFakeDb({
        users: {
            'messengerbot:연결된사람': { records: { '1': { timestamp: daysAgo(400) } } }
        },
        user_mappings: {
            'messengerbot:연결된사람': { googleUid: 'uid-1' }
        },
        chatbot_connect_tokens: {}
    });

    const summary = await purgeUnlinkedChatData(db, { retentionDays: 30, now: NOW });

    assert.deepEqual(db.removed, []);
    assert.equal(summary.deletedUsers, 0);
});

test('purge ignores keys that are not messengerbot identities', async () => {
    const db = createFakeDb({
        users: {
            'kakao_user_abc': { records: { '1': { timestamp: daysAgo(400) } } },
            'legacy-name': { records: { '1': { timestamp: daysAgo(400) } } }
        },
        user_mappings: {},
        chatbot_connect_tokens: {}
    });

    const summary = await purgeUnlinkedChatData(db, { retentionDays: 30, now: NOW });

    assert.deepEqual(db.removed, []);
    assert.equal(summary.scanned, 0);
});

test('purge removes nodes with no usable timestamp rather than keeping them forever', async () => {
    const db = createFakeDb({
        users: {
            'messengerbot:빈노드': {},
            'messengerbot:깨진값': { records: { '1': { timestamp: 'not-a-date' } } }
        },
        user_mappings: {},
        chatbot_connect_tokens: {}
    });

    const summary = await purgeUnlinkedChatData(db, { retentionDays: 30, now: NOW });

    assert.equal(summary.deletedUsers, 2);
});

test('purge clears expired connect tokens and keeps live ones', async () => {
    const db = createFakeDb({
        users: {},
        user_mappings: {},
        chatbot_connect_tokens: {
            expiredToken: { expiresAt: daysAgo(1) },
            brokenToken: { expiresAt: 'not-a-date' },
            liveToken: { expiresAt: new Date(NOW + 5 * 60 * 1000).toISOString() }
        }
    });

    const summary = await purgeUnlinkedChatData(db, { retentionDays: 30, now: NOW });

    assert.equal(summary.deletedTokens, 2);
    assert.ok(db.removed.includes('chatbot_connect_tokens/expiredToken'));
    assert.ok(db.removed.includes('chatbot_connect_tokens/brokenToken'));
    assert.ok(!db.removed.includes('chatbot_connect_tokens/liveToken'));
});

test('purge tolerates a database with none of the expected paths', async () => {
    const db = createFakeDb({});

    const summary = await purgeUnlinkedChatData(db, { retentionDays: 30, now: NOW });

    assert.deepEqual(summary, { scanned: 0, deletedUsers: 0, deletedTokens: 0 });
});
