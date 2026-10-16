// 해빛 배지 — 앱에서 대표로 단 배지가 단톡방 순위·최고기록에서 이름 앞에 붙는다.
// 앱 서버(habitschool functions/global-rewards.js)가 users/{uid} 에 displayBadge(배지 id)와
// displayBadgeEmoji 를 쓴다. 회원이 직접 쓸 수 없는 필드다. 여기서는 그 배지를 정말 가졌는지
// (globalBadges 에 있는지) 한 번 더 보고 붙인다.
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
            id: resolvedDependency, filename: resolvedDependency, loaded: true, exports: mockExports
        };
    }
    delete require.cache[resolvedTarget];
    try {
        return require(resolvedTarget);
    } finally {
        delete require.cache[resolvedTarget];
        for (const [resolvedDependency, original] of originals.entries()) {
            if (original) require.cache[resolvedDependency] = original;
            else delete require.cache[resolvedDependency];
        }
    }
}

const PROFILES = {
    'pinned-uid': {
        customDisplayName: '김해빛',
        globalBadges: { globe: { pointCost: 1000 } },
        displayBadge: 'globe',
        displayBadgeEmoji: '🌍'
    },
    'not-owned-uid': {
        customDisplayName: '이루틴',
        globalBadges: {},
        displayBadge: 'legend',
        displayBadgeEmoji: '👑'
    },
    'plain-uid': { customDisplayName: '박기록' },
    'weird-emoji-uid': {
        customDisplayName: '최장문',
        globalBadges: { sprout: {} },
        displayBadge: 'sprout',
        displayBadgeEmoji: '이것은 이모지가 아니라 긴 문장입니다'
    }
};

function loadLabels() {
    return loadWithMocks(path.join(__dirname, '..', 'modules', 'leaderboardLabels.js'), {
        './appFirebase': { getUserProfilesByIds: async (uids) => Object.fromEntries(uids.map((uid) => [uid, PROFILES[uid]]).filter(([, p]) => p)) },
        './userMapping': { getAllMappings: async () => ({}) }
    });
}

test('대표 배지를 가진 회원은 이름 앞에 배지가 붙는다', async () => {
    const { loadLeaderboardLabels } = loadLabels();
    const labels = await loadLeaderboardLabels([{ uid: 'pinned-uid' }, { uid: 'plain-uid' }]);
    assert.deepEqual(labels, { 'pinned-uid': '🌍 김해빛', 'plain-uid': '박기록' });
});

test('가지지 않은 배지는 붙이지 않는다', async () => {
    const { loadLeaderboardLabels } = loadLabels();
    const labels = await loadLeaderboardLabels([{ uid: 'not-owned-uid' }]);
    assert.deepEqual(labels, { 'not-owned-uid': '이루틴' });
});

test('이모지 자리에 긴 글이 들어 있으면 붙이지 않는다', async () => {
    const { loadLeaderboardLabels } = loadLabels();
    const labels = await loadLeaderboardLabels([{ uid: 'weird-emoji-uid' }]);
    assert.deepEqual(labels, { 'weird-emoji-uid': '최장문' });
});

test('withDisplayBadge 는 배지 없이도 이름을 그대로 돌려준다', () => {
    const { withDisplayBadge } = loadLabels();
    assert.equal(withDisplayBadge('김해빛', undefined), '김해빛');
    assert.equal(withDisplayBadge('김해빛', {}), '김해빛');
    assert.equal(withDisplayBadge('김해빛', PROFILES['pinned-uid']), '🌍 김해빛');
});

test('!순위 결과에 배지가 이름 앞에 나온다', async () => {
    const { handleRanking } = loadWithMocks(path.join(__dirname, '..', 'commands', 'ranking.js'), {
        '../modules/appFirebase': {
            getWeeklyLeaderboard: async () => [
                { uid: 'pinned-uid', diet: 7, exercise: 5, mind: 7, score: 21.5 },
                { uid: 'plain-uid', diet: 1, exercise: 1, mind: 1, score: 3.5 }
            ]
        },
        '../modules/leaderboardLabels': loadLabels(),
        '../modules/statsHelpers': { getKstDateStr: () => '2026-10-16' }
    });
    const message = await handleRanking();
    assert.match(message, /🥇 🌍 김해빛 /);
    assert.match(message, /🥈 박기록 /);
});
