// !HBT — 숫자는 앱 서버 코드 기준(habitschool functions/runtime.js, 2026-11-25).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function loadWithMocks(targetPath, mocks) {
    const resolvedTarget = require.resolve(targetPath);
    const targetDir = path.dirname(resolvedTarget);
    const originals = new Map();
    for (const [request, exports] of Object.entries(mocks)) {
        const resolved = require.resolve(request, { paths: [targetDir] });
        originals.set(resolved, require.cache[resolved]);
        require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
    }
    delete require.cache[resolvedTarget];
    try {
        return require(resolvedTarget);
    } finally {
        delete require.cache[resolvedTarget];
        for (const [resolved, original] of originals) {
            if (original) require.cache[resolved] = original;
            else delete require.cache[resolved];
        }
    }
}

function loadHbt({ mapping = null, profile = null, rate = { weekId: '2026-W48', rate: 4, phase: 1 } } = {}) {
    return loadWithMocks(path.join(__dirname, '..', 'commands', 'hbt.js'), {
        '../modules/appFirebase': {
            getUserProfile: async () => profile,
            getLatestMiningRate: async () => rate
        },
        '../modules/userMapping': {
            getMapping: async () => mapping,
            getDisplayName: (user) => user.displayName
        }
    });
}

// 카카오는 약 500자에서 「전체보기」로 접는다(routes/messengerbot.js KAKAO_REPLY_MAX_LENGTH 480).
const KAKAO_FOLD = 480;

test('!HBT, !hbt, !토큰 and !해빛토큰 all open the HBT reply', () => {
    const { isHbtCommand } = loadHbt();
    for (const text of ['HBT', 'hbt', 'Hbt', '토큰', '해빛토큰']) {
        assert.equal(isHbtCommand(text), true, text);
    }
    assert.equal(isHbtCommand('hbt 전환'), false);
    assert.equal(isHbtCommand('순위'), false);
});

test('an unlinked member gets the guide with this week’s rate and a link nudge', async () => {
    const { handleHbt } = loadHbt();
    const reply = await handleHbt({ displayName: '김해빛' });

    assert.match(reply, /HBT는 해빛스쿨 기록으로 모은 포인트를 바꿔 받는/);
    assert.match(reply, /100P부터 100P 단위/);
    assert.match(reply, /이번 주 전환 비율: 100P → 400 HBT/);
    assert.match(reply, /3일 미니\(예치 없음\), 7일 위클리\(50~5,000 HBT\), 30일 마스터\(100~10,000 HBT\)/);
    assert.match(reply, /예치금 절반이 소각/);
    assert.match(reply, /플레이 스토어 앱에서는 HBT가 보이지 않아요/);
    assert.match(reply, /!연결 하면/);
    assert.doesNotMatch(reply, /가격|시세|투자|수익/);
    assert.ok(reply.length <= KAKAO_FOLD, `guide is ${reply.length} chars`);
});

test('without a readable rate the guide just leaves that line out', async () => {
    const { handleHbt } = loadHbt({ rate: null });
    const reply = await handleHbt({ displayName: '김해빛' });
    assert.doesNotMatch(reply, /전환 비율/);
    assert.match(reply, /100P부터 100P 단위/);
});

test('a linked member sees points, HBT received so far and active challenges, not a wallet balance', async () => {
    const { handleHbt } = loadHbt({
        mapping: { googleUid: 'uid-1' },
        profile: {
            coins: 12345,
            totalHbtEarned: 8000,
            walletAddress: '0xabc',
            activeChallenges: {
                mini: {},
                weekly: { challengeId: 'c1', totalDays: 7, completedDays: 3, endDate: '2026-11-30', hbtStaked: 500, status: 'ongoing' },
                master: { challengeId: 'c2', totalDays: 30, completedDays: 30, endDate: '2026-11-24', hbtStaked: 1000, status: 'claimable' }
            }
        }
    });
    const reply = await handleHbt({ displayName: '김해빛' });

    assert.match(reply, /💰 김해빛님의 HBT/);
    assert.match(reply, /포인트: 12,345P/);
    assert.match(reply, /지금까지 받은 HBT: 8,000 HBT/);
    assert.match(reply, /· 7일 위클리 3\/7일 · 11\/30까지 · 예치 500 HBT/);
    assert.match(reply, /· 30일 마스터 30\/30일 · 정산을 기다려요 · 예치 1,000 HBT/);
    assert.doesNotMatch(reply, /3일 미니/);
    assert.doesNotMatch(reply, /0xabc/);
    assert.match(reply, /이번 주 전환 비율: 100P → 400 HBT/);
    assert.ok(reply.length <= KAKAO_FOLD, `reply is ${reply.length} chars`);
});

test('a linked member without a challenge is told there is none', async () => {
    const { handleHbt } = loadHbt({ mapping: { googleUid: 'uid-1' }, profile: { coins: 0 } });
    const reply = await handleHbt({ displayName: '김해빛' });
    assert.match(reply, /진행 중 예치 챌린지: 없음/);
    assert.match(reply, /지금까지 받은 HBT: 0 HBT/);
});
