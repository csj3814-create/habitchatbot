// 식단 등급은 앱(habitschool js/diet-checks.js)과 같은 셈이어야 한다.
//  - 끼니 등급 = 통과한 체크 수: 5=S, 4=A, 3=B, 2=C, 1=D, 0=F (앱 v616)
//  - 하루·기간 등급 = 끼니 등급 평균을 반올림
//  - 그날 통과한 체크 = 식사의 절반 이상이 통과
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
    mealGrade,
    countDietPhotos,
    summarizeDayDiet,
    summarizePeriodDiet,
    formatFailedChecks
} = require('../modules/dietGrades');

const ALL = { vegetables: true, protein: true, ultraprocessed: true, carbs: true, sodium: true };
const meal = (checks) => ({ version: 2, mealType: 'meal', checks: { ...ALL, ...checks } });

test('a meal is graded by how many of the five checks it passed', () => {
    assert.equal(mealGrade(meal({})), 'S');
    assert.equal(mealGrade(meal({ sodium: false })), 'A');
    assert.equal(mealGrade(meal({ sodium: false, carbs: false })), 'B');
    assert.equal(mealGrade(meal({ sodium: false, carbs: false, protein: false })), 'C');
    assert.equal(mealGrade(meal({ sodium: false, carbs: false, protein: false, vegetables: false })), 'D');
    assert.equal(mealGrade(meal({ vegetables: false, protein: false, ultraprocessed: false, carbs: false, sodium: false })), 'F');
});

test('2판 meals saved on 11-21~23 with the old letter are re-graded from their checks', () => {
    // 그 사흘의 분석은 예전 표(5개 = A)로 글자가 적혀 있다. 앱도 체크 수로 다시 정한다.
    assert.equal(mealGrade({ ...meal({}), grade: 'A' }), 'S');
});

test('snacks and drinks have no grade, and older analyses keep their stored letter', () => {
    assert.equal(mealGrade({ version: 2, mealType: 'snack', checks: ALL }), null);
    assert.equal(mealGrade({ version: 2, mealType: 'drink' }), null);
    assert.equal(mealGrade({ grade: 'b' }), 'B');
    assert.equal(mealGrade({ grade: 'Z' }), null);
    assert.equal(mealGrade(null), null);
});

test('the day grade is the rounded average and snacks are not counted', () => {
    const day = summarizeDayDiet({
        dietAnalysis: {
            breakfast: meal({}),
            lunch: meal({ sodium: false }),
            snack: { version: 2, mealType: 'snack' }
        }
    });
    // S(5) 와 A(4) 의 평균 4.5 → 반올림 5 → S
    assert.deepEqual(day, { grade: 'S', meals: 2, failed: [] });
});

test('a check fails for the day only when fewer than half the meals passed it', () => {
    const day = summarizeDayDiet({
        dietAnalysis: {
            breakfast: meal({ vegetables: false, sodium: false }),
            lunch: meal({ vegetables: false }),
            dinner: meal({})
        }
    });
    // 채소: 3끼 중 1끼 통과 → 실패. 나트륨: 3끼 중 2끼 통과 → 통과.
    assert.deepEqual(day.failed, ['vegetables']);
    assert.equal(formatFailedChecks(day.failed), '아쉬운 점: 채소');
});

test('meal5 and meal6 count like the first four slots', () => {
    const log = {
        diet: { breakfastUrl: 'a', meal5Url: 'b', meal6Url: 'c' },
        dietAnalysis: { meal6: meal({ protein: false }) }
    };
    assert.equal(countDietPhotos(log), 3);
    assert.equal(summarizeDayDiet(log).grade, 'A');
});

test('a day without any graded meal has no grade', () => {
    assert.equal(summarizeDayDiet({ diet: { breakfastUrl: 'a' } }), null);
    assert.equal(summarizeDayDiet({ dietAnalysis: { snack: { version: 2, mealType: 'snack' } } }), null);
    assert.equal(formatFailedChecks([]), '체크 5개를 모두 통과했어요');
});

test('the period grade averages every graded meal across the days', () => {
    const week = summarizePeriodDiet([
        { dietAnalysis: { breakfast: meal({}) } },
        { dietAnalysis: { lunch: meal({ vegetables: false, protein: false, carbs: false }) } },
        { diet: { breakfastUrl: 'x' } }
    ]);
    // S(5) 와 C(2) 의 평균 3.5 → 반올림 4 → A
    assert.deepEqual(week, { grade: 'A', meals: 2 });
    assert.equal(summarizePeriodDiet([]), null);
});

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

test('!식단 shows the photo count, the day grade, what was missed and the 7-day average', async () => {
    const records = [
        { date: '2026-11-23', diet: { breakfastUrl: 'a' }, dietAnalysis: { breakfast: meal({ vegetables: false, protein: false, carbs: false }) } },
        { date: '2026-11-24', diet: { breakfastUrl: 'a', lunchUrl: 'b', meal5Url: 'c' }, dietAnalysis: { breakfast: meal({}), lunch: meal({ sodium: false }) } }
    ];
    const { handleDiet } = loadWithMocks(path.join(__dirname, '..', 'commands', 'categoryHabits.js'), {
        '../modules/appFirebase': { getUserRecords: async () => records },
        '../modules/userMapping': {
            getMapping: async () => ({ googleUid: 'uid-1' }),
            getDisplayName: () => '김해빛',
            buildIdentityKey: () => 'k'
        }
    });

    const message = await handleDiet({ displayName: '김해빛' });
    assert.match(message, /마지막 기록: 2026-11-24/);
    assert.match(message, /식사 사진: 3장/);
    assert.match(message, /식단 등급: S \(2끼\)/);
    assert.match(message, /체크 5개를 모두 통과했어요/);
    // S·A·C 평균 11/3 ≈ 3.7 → A
    assert.match(message, /최근 7일 평균: A \(3끼\)/);
    assert.doesNotMatch(message, /아침|점심/);
});

// 앱 식단 칸은 6개, 이름은 순서(첫 번째~여섯 번째 식사). 공유 페이지·해빛 영상·코치 대화가 모두 따른다.
test('share and video photos come from all six diet slots, labelled by order', () => {
    const { buildHaebitSharePayloadFromRecord, extractShareMedia } = require('../modules/appFirebase');
    const record = {
        date: '2026-11-24',
        diet: { breakfastUrl: 'https://x/1.jpg', meal5Url: 'https://x/5.jpg', meal6Url: 'https://x/6.jpg' }
    };

    const shareMedia = extractShareMedia(record).map((m) => m.url);
    assert.deepEqual(shareMedia, ['https://x/1.jpg', 'https://x/5.jpg', 'https://x/6.jpg']);

    const payload = buildHaebitSharePayloadFromRecord('uid-1', record, { customDisplayName: '김해빛' });
    const labels = payload.galleryMedia.filter((m) => m.category === '식단').map((m) => m.label);
    assert.deepEqual(labels, ['첫 번째 식사', '다섯 번째 식사', '여섯 번째 식사']);
});

test('the coach gets a photo count and the grade, not meal names', () => {
    const { describeDayDiet } = require('../modules/dietGrades');
    assert.equal(
        describeDayDiet({ diet: { breakfastUrl: 'a', lunchUrl: 'b' }, dietAnalysis: { breakfast: meal({ vegetables: false }), lunch: meal({ vegetables: false }) } }),
        '사진 2장, 등급 A, 아쉬운 점: 채소'
    );
    assert.equal(describeDayDiet({ diet: { meal6Url: 'a' } }), '사진 1장');
    assert.equal(describeDayDiet({}), '');
});
