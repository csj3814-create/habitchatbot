// 앱이 인정하는 기록을 봇도 같은 것으로 센다.
//  - 기록 판정: daily_logs.awardedPoints (habitschool functions/points-utils.js)
//  - 연속 기록: users.currentStreak + lastLogDate (habitschool functions/streak-freshness.js)
//  - 30일 보관 중인 탈퇴 회원: account_holds/{uid} (habitschool functions/account-deletion.js)
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
    hasDiet,
    hasExercise,
    hasSleep,
    hasMind,
    resolveStreak
} = require('../modules/statsHelpers');

test('a day the app awarded counts even without photos or lists', () => {
    // 걸음수 8,000보만 있는 날: cardioList 는 비어 있고 awardedPoints 에만 남는다.
    const stepsOnly = {
        date: '2026-11-10',
        steps: { count: 9200 },
        exercise: { cardioList: [], strengthList: [] },
        awardedPoints: { exercise: true, exercisePoints: 10 }
    };
    assert.equal(hasExercise(stepsOnly), true);
    assert.equal(hasDiet(stepsOnly), false);
    assert.equal(hasMind(stepsOnly), false);

    // 마음 공유를 끈 회원: 공개 문서의 gratitude 는 빈 값이고 점수만 남는다.
    const hiddenMind = {
        date: '2026-11-10',
        shareSettings: { hideMind: true },
        sleepAndMind: { gratitude: '' },
        awardedPoints: { mindPoints: 10 }
    };
    assert.equal(hasMind(hiddenMind), true);
});

test('records without awardedPoints are still judged by their photos and lists', () => {
    const legacy = {
        date: '2026-03-01',
        diet: { lunchUrl: 'https://example.com/l.jpg' },
        exercise: { strengthList: [{ videoUrl: 'https://example.com/s.mp4' }] },
        sleepAndMind: { sleepImageUrl: 'https://example.com/z.jpg' }
    };
    assert.equal(hasDiet(legacy), true);
    assert.equal(hasExercise(legacy), true);
    assert.equal(hasSleep(legacy), true);
    assert.equal(hasMind(legacy), true);

    assert.equal(hasDiet({ date: '2026-03-01' }), false);
    assert.equal(hasExercise({ date: '2026-03-01', awardedPoints: { exercisePoints: 0 } }), false);
});

test('sleep from Health Connect counts without a capture, unless the member edited the hours', () => {
    const synced = {
        date: '2026-11-10',
        sleepAndMind: {
            sleepHours: 7.5,
            sleepSync: { source: 'health_connect', wakeDate: '2026-11-10', sleepHours: 7.5 }
        }
    };
    assert.equal(hasSleep(synced), true);

    const edited = structuredClone(synced);
    edited.sleepAndMind.sleepHours = 9;
    assert.equal(hasSleep(edited), false);

    const otherNight = structuredClone(synced);
    otherNight.sleepAndMind.sleepSync.wakeDate = '2026-11-09';
    assert.equal(hasSleep(otherNight), false);
});

test('the streak comes from the member document, not from the records that were loaded', () => {
    const thirtyRecords = Array.from({ length: 30 }, (_, i) => ({
        date: `2026-10-${String(i + 1).padStart(2, '0')}`
    }));

    // 30건만 읽었어도 127일로 답한다.
    assert.equal(
        resolveStreak({ currentStreak: 127, lastLogDate: '2026-11-11' }, thirtyRecords, '2026-11-11'),
        127
    );
    // 어제까지 기록했고 오늘은 아직이면 이어진 것으로 본다.
    assert.equal(resolveStreak({ currentStreak: 12, lastLogDate: '2026-11-10' }, [], '2026-11-11'), 12);
    // 그저께가 마지막이면 끊겼다. 저장값은 마지막 기록일에 멈춰 있을 뿐이다.
    assert.equal(resolveStreak({ currentStreak: 12, lastLogDate: '2026-11-09' }, [], '2026-11-11'), 0);
    // 한국보다 날짜가 앞선 곳의 회원은 lastLogDate 가 한국의 내일일 수 있다.
    assert.equal(resolveStreak({ currentStreak: 5, lastLogDate: '2026-11-12' }, [], '2026-11-11'), 5);
});

test('without a usable member document the streak falls back to counting records', () => {
    assert.equal(resolveStreak(null, [], '2026-11-11'), 0);
    assert.equal(resolveStreak({ currentStreak: 9 }, [], '2026-11-11'), 0);
});

function loadAppFirebaseWithDb(db) {
    const target = require.resolve(path.join(__dirname, '..', 'modules', 'appFirebase.js'));
    const adminPath = require.resolve('firebase-admin');
    const originalAdmin = require.cache[adminPath];
    const originalKey = process.env.APP_FIREBASE_KEY;

    require.cache[adminPath] = {
        id: adminPath,
        filename: adminPath,
        loaded: true,
        exports: {
            initializeApp: () => ({ firestore: () => db }),
            credential: { cert: () => ({}) }
        }
    };
    delete require.cache[target];

    return {
        appFirebase: require(target),
        restore() {
            delete require.cache[target];
            if (originalAdmin) require.cache[adminPath] = originalAdmin;
            else delete require.cache[adminPath];
            if (originalKey === undefined) delete process.env.APP_FIREBASE_KEY;
            else process.env.APP_FIREBASE_KEY = originalKey;
        }
    };
}

function createDb({ logs, heldUids, holdsFail = false, clinicUids = [], clinicFail = false }) {
    const query = (docs) => {
        const self = {
            where: () => self,
            orderBy: () => self,
            select: () => self,
            get: async () => ({ docs })
        };
        return self;
    };

    return {
        collection(name) {
            if (name === 'daily_logs') {
                return query(logs.map((log, index) => ({ id: `log-${index}`, data: () => log })));
            }
            if (name === 'account_holds') {
                if (holdsFail) {
                    return { select: () => ({ get: async () => { throw new Error('PERMISSION_DENIED'); } }) };
                }
                return query(heldUids.map((uid) => ({ id: uid, data: () => ({}) })));
            }
            if (name === 'users') {
                if (clinicFail) {
                    const failing = { where: () => failing, select: () => failing, get: async () => { throw new Error('UNAVAILABLE'); } };
                    return failing;
                }
                return query(clinicUids.map((uid) => ({ id: uid, data: () => ({}) })));
            }
            throw new Error(`unexpected collection ${name}`);
        }
    };
}

const ROOM_LOGS = [
    { userId: 'active-1', date: '2026-11-10', awardedPoints: { diet: true, exercise: true } },
    { userId: 'active-2', date: '2026-11-10', awardedPoints: { mind: true } },
    { userId: 'held-1', date: '2026-11-10', awardedPoints: { diet: true, exercise: true, mind: true } }
];

test('a member in the 30-day hold is left out of everything the room sees', async (t) => {
    // 서비스 계정 키 파일이 있으면 그쪽이 먼저 읽힌다. 어느 쪽이든 firebase-admin 은 가짜다.
    process.env.APP_FIREBASE_KEY = '{}';
    const { appFirebase, restore } = loadAppFirebaseWithDb(createDb({ logs: ROOM_LOGS, heldUids: ['held-1'] }));
    t.after(restore);

    const today = await appFirebase.getGalleryByDate('2026-11-10');
    assert.deepEqual(today.map((log) => log.userId), ['active-1', 'active-2']);

    assert.equal(await appFirebase.getActiveUserCount('2026-11-10'), 2);

    const stats = await appFirebase.getWeeklyStats();
    assert.equal(stats.uniqueUsers, 2);
    assert.equal(stats.totalRecords, 2);

    const weekly = await appFirebase.getWeeklyLeaderboard();
    assert.deepEqual(weekly.map((entry) => entry.uid).sort(), ['active-1', 'active-2']);

    const ranged = await appFirebase.getLeaderboardByDateRange('2026-11-01', '2026-11-10');
    assert.deepEqual(ranged.map((entry) => entry.uid).sort(), ['active-1', 'active-2']);
    // 걸음수·수면처럼 awardedPoints 에만 남은 기록도 점수에 들어간다.
    assert.equal(ranged.find((entry) => entry.uid === 'active-1').score, 2.5);
});

test('if the hold list cannot be read the room still gets its numbers', async (t) => {
    process.env.APP_FIREBASE_KEY = '{}';
    const { appFirebase, restore } = loadAppFirebaseWithDb(
        createDb({ logs: ROOM_LOGS, heldUids: [], holdsFail: true })
    );
    t.after(restore);

    const today = await appFirebase.getGalleryByDate('2026-11-10');
    assert.equal(today.length, 3);
});

// 병원 QR 회원: users/{uid}.clinicId (habitschool js/auth.js). 앱은 병원 소속이 드러나지 않게 하므로
// 이름이 나가는 순위에서는 빼고, 인원수만 세는 곳에는 둔다.
const CLINIC_LOGS = [
    { userId: 'active-1', date: '2026-11-10', awardedPoints: { diet: true } },
    { userId: 'clinic-1', date: '2026-11-10', awardedPoints: { diet: true, exercise: true, mind: true } }
];

test('a clinic member is left out of the rankings but still counted in the totals', async (t) => {
    process.env.APP_FIREBASE_KEY = '{}';
    const { appFirebase, restore } = loadAppFirebaseWithDb(
        createDb({ logs: CLINIC_LOGS, heldUids: [], clinicUids: ['clinic-1'] })
    );
    t.after(restore);

    const weekly = await appFirebase.getWeeklyLeaderboard();
    assert.deepEqual(weekly.map((entry) => entry.uid), ['active-1']);

    const ranged = await appFirebase.getLeaderboardByDateRange('2026-11-01', '2026-11-10');
    assert.deepEqual(ranged.map((entry) => entry.uid), ['active-1']);

    const today = await appFirebase.getGalleryByDate('2026-11-10');
    assert.equal(today.length, 2);
});

test('if the clinic list cannot be read no ranking goes to the room', async (t) => {
    process.env.APP_FIREBASE_KEY = '{}';
    const { appFirebase, restore } = loadAppFirebaseWithDb(
        createDb({ logs: CLINIC_LOGS, heldUids: [], clinicFail: true })
    );
    t.after(restore);

    await assert.rejects(appFirebase.getWeeklyLeaderboard());
    await assert.rejects(appFirebase.getLeaderboardByDateRange('2026-11-01', '2026-11-10'));
});
