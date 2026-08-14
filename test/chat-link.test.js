const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function loadWithMocks(targetPath, mocks) {
    const resolvedTarget = require.resolve(targetPath);
    const targetDir = path.dirname(resolvedTarget);
    const originals = new Map();

    for (const [request, mockExports] of Object.entries(mocks)) {
        const resolvedDependency = require.resolve(request, { paths: [targetDir] });
        originals.set(resolvedDependency, require.cache[resolvedDependency]);
        require.cache[resolvedDependency] = {
            id: resolvedDependency,
            filename: resolvedDependency,
            loaded: true,
            exports: mockExports
        };
    }

    delete require.cache[resolvedTarget];

    try {
        return require(targetPath);
    } finally {
        delete require.cache[resolvedTarget];

        for (const [resolvedDependency, original] of originals.entries()) {
            if (original) {
                require.cache[resolvedDependency] = original;
            } else {
                delete require.cache[resolvedDependency];
            }
        }
    }
}

const CHAT_LINK_PATH = path.join(__dirname, '..', 'modules', 'chatLink.js');

/**
 * @param {object} options
 * @param {object|null} options.existingMapping mapping already stored for this nickname
 * @param {object} options.codeVerdict         what consumeChatbotLinkCode returns
 * @param {Array}  options.mappingsByUid       reverse-lookup result for the app uid
 */
function loadChatLink({ existingMapping = null, codeVerdict, mappingsByUid = [] } = {}) {
    const calls = { consumed: [], registered: [], removedKeys: [] };

    const chatLink = loadWithMocks(CHAT_LINK_PATH, {
        './appFirebase': {
            consumeChatbotLinkCode: async (code) => {
                calls.consumed.push(code);
                return codeVerdict;
            }
        },
        './userMapping': {
            getMapping: async () => existingMapping,
            getDisplayName: (user) => user.displayName,
            buildIdentityKey: (user) => `${user.platform}:${user.userId}`,
            registerUser: async (user, email, uid, options) => {
                calls.registered.push({ user, email, uid, options });
            },
            findMappingsByGoogleUid: async () => mappingsByUid,
            removeMappingByKey: async (key) => {
                calls.removedKeys.push(key);
            }
        }
    });

    return { chatLink, calls };
}

function makeUser(displayName = '테스트 사용자') {
    return {
        platform: 'messengerbot',
        userId: displayName,
        displayName,
        legacySender: displayName,
        room: '최석재'
    };
}

test('linkByCode rejects malformed codes without touching the app database', async () => {
    for (const badCode of ['', '   ', 'abc', 'ABCD123', 'ABCD12345', 'ABCD-123', '한글코드12']) {
        const { chatLink, calls } = loadChatLink({ codeVerdict: { ok: true, user: { uid: 'u1' } } });
        const result = await chatLink.linkByCode({ user: makeUser(), code: badCode });

        assert.equal(result.ok, false, `expected rejection for ${JSON.stringify(badCode)}`);
        assert.equal(result.reason, 'invalid_format');
        assert.equal(calls.consumed.length, 0, 'must not spend a code lookup on a malformed code');
    }
});

test('linkByCode accepts lowercase input by normalizing it', async () => {
    const { chatLink, calls } = loadChatLink({
        codeVerdict: { ok: true, user: { uid: 'uid-1', email: 'a@b.com' } }
    });

    const result = await chatLink.linkByCode({ user: makeUser(), code: ' abcd1234 ' });

    assert.equal(result.ok, true);
    assert.deepEqual(calls.consumed, ['ABCD1234']);
});

test('linkByCode refuses an already-linked nickname without spending the code', async () => {
    const { chatLink, calls } = loadChatLink({
        existingMapping: { googleUid: 'uid-existing', googleEmail: 'someone@example.com' },
        codeVerdict: { ok: true, user: { uid: 'uid-1' } }
    });

    const result = await chatLink.linkByCode({ user: makeUser(), code: 'ABCD1234' });

    assert.equal(result.ok, false);
    assert.equal(result.reason, 'nickname_already_linked');
    assert.equal(calls.consumed.length, 0, 'a still-valid code must not be burned');
    assert.equal(calls.registered.length, 0, 'must never silently overwrite an existing link');
});

test('linkByCode surfaces expired, unknown, and unavailable separately', async () => {
    for (const reason of ['expired', 'not_found', 'unavailable']) {
        const { chatLink, calls } = loadChatLink({ codeVerdict: { ok: false, reason } });
        const result = await chatLink.linkByCode({ user: makeUser(), code: 'ABCD1234' });

        assert.equal(result.ok, false);
        assert.equal(result.reason, reason);
        assert.equal(calls.registered.length, 0);
    }
});

test('linkByCode registers a new link with the nickname snapshot', async () => {
    const { chatLink, calls } = loadChatLink({
        codeVerdict: { ok: true, user: { uid: 'uid-1', email: 'a@b.com' } }
    });

    const result = await chatLink.linkByCode({
        user: makeUser('민수'),
        code: 'ABCD1234',
        linkSource: 'messengerbot-code'
    });

    assert.equal(result.ok, true);
    assert.equal(result.reason, 'ok');
    assert.equal(result.displayName, '민수');
    assert.equal(calls.registered.length, 1);
    assert.equal(calls.registered[0].uid, 'uid-1');
    assert.equal(calls.registered[0].options.linkSource, 'messengerbot-code');
    assert.equal(calls.registered[0].options.previousIdentityKey, undefined);
    assert.deepEqual(calls.removedKeys, [], 'nothing to clean up on a fresh link');
});

test('linkByCode moves the link when the same account sits under an old nickname', async () => {
    const { chatLink, calls } = loadChatLink({
        codeVerdict: { ok: true, user: { uid: 'uid-1', email: 'a@b.com' } },
        mappingsByUid: [
            {
                key: 'messengerbot:옛닉네임',
                mapping: { googleUid: 'uid-1', linkedDisplayName: '옛닉네임' }
            }
        ]
    });

    const result = await chatLink.linkByCode({ user: makeUser('새닉네임'), code: 'ABCD1234' });

    assert.equal(result.ok, true);
    assert.equal(result.reason, 'ok_moved');
    assert.equal(result.movedFromDisplayName, '옛닉네임');
    assert.equal(calls.registered[0].options.previousIdentityKey, 'messengerbot:옛닉네임');
    assert.deepEqual(calls.removedKeys, ['messengerbot:옛닉네임'], 'stale mapping must not linger');
});

test('linkByCode does not treat re-linking under the same key as a move', async () => {
    const { chatLink, calls } = loadChatLink({
        codeVerdict: { ok: true, user: { uid: 'uid-1', email: 'a@b.com' } },
        mappingsByUid: [
            { key: 'messengerbot:민수', mapping: { googleUid: 'uid-1' } }
        ]
    });

    const result = await chatLink.linkByCode({ user: makeUser('민수'), code: 'ABCD1234' });

    assert.equal(result.reason, 'ok');
    assert.deepEqual(calls.removedKeys, [], 'must not delete the mapping it just wrote');
});

test('resolveLinkedAccount reports linked and unlinked states', async () => {
    const linked = loadChatLink({ existingMapping: { googleUid: 'uid-1' }, codeVerdict: null });
    assert.deepEqual(await linked.chatLink.resolveLinkedAccount(makeUser()), {
        status: 'linked',
        mapping: { googleUid: 'uid-1' }
    });

    const unlinked = loadChatLink({ existingMapping: null, codeVerdict: null });
    assert.deepEqual(await unlinked.chatLink.resolveLinkedAccount(makeUser()), {
        status: 'unlinked',
        mapping: null
    });
});

test('buildUnlinkedMessage does not claim the link broke', async () => {
    const { chatLink } = loadChatLink({ codeVerdict: null });
    const message = chatLink.buildUnlinkedMessage(makeUser('민수'));

    assert.match(message, /민수/);
    assert.match(message, /닉네임을 바꾸셨다면/);
    assert.match(message, /!연결 코드/);
    // A first-time speaker looks identical to a renamed one, so the copy must
    // not assert that a link previously existed.
    assert.doesNotMatch(message, /연결이 풀렸어요/);
});
