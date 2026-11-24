/**
 * 식단 등급 (앱 식단 분석 2판, 체크 5개).
 *
 * 앱 서버(habitschool functions/diet-checks.js)가 끼니마다 체크 5개를 계산해
 * daily_logs.dietAnalysis.{칸} 에 저장한다. 여기는 앱 화면(habitschool js/diet-checks.js)과
 * 같은 셈으로 **세기만** 한다. 셈법이 다르면 앱과 챗봇이 같은 날을 다른 등급으로 말한다.
 *
 *   끼니 등급 = 통과한 체크 수: 5=S, 4=A, 3=B, 2=C, 1=D, 0=F (앱 v616)
 *   하루·한 주 등급 = 끼니 등급의 평균을 반올림한 한 글자
 *   그날 통과한 체크 = 그날 식사의 절반 이상이 통과한 체크
 *
 * 간식·음료(mealType 이 meal 이 아님)는 등급이 없어 세지 않는다.
 * 2판 이전 분석은 저장된 글자(A~F)를 그대로 쓴다.
 */

// 앱 js/diet-slots.js 와 같아야 한다(2026-11-20 4칸 → 6칸).
const DIET_SLOTS = Object.freeze(['breakfast', 'lunch', 'dinner', 'snack', 'meal5', 'meal6']);
// 칸 이름은 시간(아침·점심)이 아니라 순서다 — 앱 js/app-core.js 의 칸 라벨과 같다.
const DIET_SLOT_LABELS = Object.freeze({
    breakfast: '첫 번째 식사',
    lunch: '두 번째 식사',
    dinner: '세 번째 식사',
    snack: '네 번째 식사',
    meal5: '다섯 번째 식사',
    meal6: '여섯 번째 식사'
});
const DIET_CHECK_KEYS = Object.freeze(['vegetables', 'protein', 'ultraprocessed', 'carbs', 'sodium']);
const DIET_CHECK_LABELS = Object.freeze({
    vegetables: '채소',
    protein: '단백질',
    ultraprocessed: '초가공',
    carbs: '탄수화물',
    sodium: '나트륨'
});
const GRADE_BY_CHECK_COUNT = Object.freeze({ 5: 'S', 4: 'A', 3: 'B', 2: 'C', 1: 'D', 0: 'F' });
const GRADE_POINTS = Object.freeze({ S: 5, A: 4, B: 3, C: 2, D: 1, F: 0 });

function isCheckedMeal(analysis) {
    return !!analysis
        && Number(analysis.version) === 2
        && analysis.mealType === 'meal'
        && !!analysis.checks
        && typeof analysis.checks === 'object';
}

/** 끼니 하나의 등급. 등급이 없으면 null. */
function mealGrade(analysis) {
    if (isCheckedMeal(analysis)) {
        const count = DIET_CHECK_KEYS.filter((key) => analysis.checks[key] === true).length;
        return GRADE_BY_CHECK_COUNT[count];
    }
    const letter = String(analysis?.grade || '').trim().toUpperCase();
    return Object.prototype.hasOwnProperty.call(GRADE_POINTS, letter) ? letter : null;
}

function averageGrade(analyses = []) {
    const points = analyses.map(mealGrade).filter(Boolean).map((grade) => GRADE_POINTS[grade]);
    if (points.length === 0) return null;
    const avg = points.reduce((sum, p) => sum + p, 0) / points.length;
    return GRADE_BY_CHECK_COUNT[Math.max(0, Math.min(5, Math.round(avg)))];
}

function logAnalyses(log) {
    const raw = log && typeof log.dietAnalysis === 'object' && log.dietAnalysis ? log.dietAnalysis : {};
    return DIET_SLOTS.map((slot) => raw[slot]).filter(Boolean);
}

/** 그날 올린 식단 사진 수(6칸). */
function countDietPhotos(log) {
    return DIET_SLOTS.filter((slot) => !!log?.diet?.[`${slot}Url`]).length;
}

/**
 * 하루 식단 등급.
 * @returns {null | { grade: string, meals: number, failed: string[] }}
 *   meals: 등급이 있는 끼니 수, failed: 그날 통과하지 못한 체크(2판 식사가 있을 때만).
 */
function summarizeDayDiet(log) {
    const analyses = logAnalyses(log);
    const grade = averageGrade(analyses);
    if (!grade) return null;

    const checked = analyses.filter(isCheckedMeal);
    const failed = checked.length === 0
        ? []
        : DIET_CHECK_KEYS.filter((key) => {
            const passed = checked.filter((meal) => meal.checks[key] === true).length;
            return passed * 2 < checked.length;
        });

    return { grade, meals: analyses.filter((a) => mealGrade(a)).length, failed };
}

/** 여러 날의 평균 등급. 등급이 있는 끼니가 없으면 null. */
function summarizePeriodDiet(logs = []) {
    const analyses = (logs || []).flatMap(logAnalyses).filter((a) => mealGrade(a));
    const grade = averageGrade(analyses);
    return grade ? { grade, meals: analyses.length } : null;
}

function formatFailedChecks(failed = []) {
    if (failed.length === 0) return '체크 5개를 모두 통과했어요';
    return `아쉬운 점: ${failed.map((key) => DIET_CHECK_LABELS[key]).join(' · ')}`;
}

/** 코치에게 넘기는 한 줄: "사진 3장, 등급 A, 아쉬운 점: 채소". 사진도 등급도 없으면 ''. */
function describeDayDiet(log) {
    const photos = countDietPhotos(log);
    const day = summarizeDayDiet(log);
    const parts = [];
    if (photos > 0) parts.push(`사진 ${photos}장`);
    if (day) {
        parts.push(`등급 ${day.grade}`);
        if (day.failed.length > 0) parts.push(formatFailedChecks(day.failed));
    }
    return parts.join(', ');
}

module.exports = {
    DIET_SLOTS,
    DIET_SLOT_LABELS,
    describeDayDiet,
    DIET_CHECK_KEYS,
    mealGrade,
    countDietPhotos,
    summarizeDayDiet,
    summarizePeriodDiet,
    formatFailedChecks
};
