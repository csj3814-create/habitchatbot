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

const GROUP_LINK_PATH = path.join(__dirname, '..', 'commands', 'groupLink.js');
const SECRET_CODE = 'ZXCV7788';
const LINKED_EMAIL = 'member@example.com';

function loadGroupLink({ linkResult, existingMapping = null } = {}) {
    const calls = { removed: 0, linkArgs: [] };

    const groupLink = loadWithMocks(GROUP_LINK_PATH, {
        '../modules/chatLink': {
            linkByCode: async (args) => {
                calls.linkArgs.push(args);
                return linkResult;
            }
        },
        '../modules/userMapping': {
            getMapping: async () => existingMapping,
            removeMapping: async () => {
                calls.removed += 1;
            },
            getDisplayName: (user) => user.displayName
        }
    });

    return { groupLink, calls };
}

const user = { platform: 'messengerbot', userId: '민수', displayName: '민수' };

test('a successful group link never echoes the code or the linked email', async () => {
    const { groupLink } = loadGroupLink({
        linkResult: { ok: true, reason: 'ok', displayName: '민수' }
    });

    const reply = await groupLink.handleGroupLink(user, SECRET_CODE);

    assert.match(reply, /민수님 연결 완료/);
    assert.doesNotMatch(reply, new RegExp(SECRET_CODE, 'i'));
    assert.doesNotMatch(reply, /@/, 'a shared room must never see the linked email');
});

test('a moved link says so instead of pretending it was a fresh link', async () => {
    const { groupLink } = loadGroupLink({
        linkResult: { ok: true, reason: 'ok_moved', displayName: '민수', movedFromDisplayName: '옛닉' }
    });

    const reply = await groupLink.handleGroupLink(user, SECRET_CODE);

    assert.match(reply, /연결 완료/);
    assert.match(reply, /이전 닉네임/);
    assert.doesNotMatch(reply, new RegExp(SECRET_CODE, 'i'));
});

test('each failure reason gets its own distinct guidance', async () => {
    const replies = new Map();

    for (const reason of ['invalid_format', 'expired', 'not_found', 'nickname_already_linked', 'unavailable']) {
        const { groupLink } = loadGroupLink({
            linkResult: { ok: false, reason, displayName: '민수' }
        });

        const reply = await groupLink.handleGroupLink(user, SECRET_CODE);

        // A failure must never read like a success.
        assert.doesNotMatch(reply, /연결 완료/, `"${reason}" must not look successful`);
        assert.doesNotMatch(reply, new RegExp(SECRET_CODE, 'i'), `"${reason}" must not echo the code`);
        assert.doesNotMatch(reply, /@/, `"${reason}" must not leak an email`);

        replies.set(reason, reply);
    }

    assert.equal(new Set(replies.values()).size, replies.size, 'every reason needs its own message');
    assert.match(replies.get('expired'), /만료/);
    assert.match(replies.get('not_found'), /이미 사용했거나/);
    assert.match(replies.get('invalid_format'), /8자리/);
    assert.match(replies.get('nickname_already_linked'), /이미 앱 계정과 연결/);
});

test('bare !연결 returns guidance only, with no clickable link', async () => {
    const { groupLink, calls } = loadGroupLink({ linkResult: null });

    const reply = await groupLink.handleGroupLink(user, '');

    assert.match(reply, /연결 코드/);
    assert.doesNotMatch(reply, /http/, 'a magic link in a shared room is an account-takeover vector');
    assert.equal(calls.linkArgs.length, 0);
});

test('unlink works for a linked speaker and is honest when there is nothing to unlink', async () => {
    const linked = loadGroupLink({
        linkResult: null,
        existingMapping: { googleUid: 'uid-1', googleEmail: LINKED_EMAIL }
    });

    const unlinkReply = await linked.groupLink.handleGroupLink(user, '해제');
    assert.equal(linked.calls.removed, 1);
    assert.match(unlinkReply, /해제했어요/);
    assert.doesNotMatch(unlinkReply, /@/);

    const notLinked = loadGroupLink({ linkResult: null, existingMapping: null });
    const noopReply = await notLinked.groupLink.handleGroupLink(user, '연결해제');
    assert.equal(notLinked.calls.removed, 0);
    assert.match(noopReply, /연결된 계정이 없어요/);
});

test('the group link path tags its link source for later auditing', async () => {
    const { groupLink, calls } = loadGroupLink({
        linkResult: { ok: true, reason: 'ok', displayName: '민수' }
    });

    await groupLink.handleGroupLink(user, SECRET_CODE);

    assert.equal(calls.linkArgs[0].linkSource, 'messengerbot-code');
    assert.equal(calls.linkArgs[0].code, SECRET_CODE);
});
