/**
 * habitCheckers.js
 * 습관 데이터 존재 여부 판별 유틸리티
 * today.js, myHabits.js, weekly.js, index.js 등에서 공용으로 사용
 */

const hasDiet = r => r.diet && (r.diet.breakfastUrl || r.diet.lunchUrl || r.diet.dinnerUrl || r.diet.snackUrl);
const hasExercise = r => r.exercise && ((r.exercise.cardioList?.length > 0) || (r.exercise.strengthList?.length > 0));
const hasSleep = r => r.sleepAndMind?.sleepImageUrl;
const hasGratitude = r => r.sleepAndMind?.gratitude;
const hasMeditation = r => r.sleepAndMind?.meditationDone;
const hasMind = r => hasSleep(r) || hasMeditation(r) || hasGratitude(r);

/**
 * 한국 시간대(KST) 기준 오늘 날짜 (YYYY-MM-DD)
 */
function getKSTDateStr(date) {
    const d = date || new Date();
    const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    return kst.toISOString().split('T')[0];
}

/**
 * 한국 시간대(KST) 기준 Date 객체 (시간 오프셋 보정)
 */
function getKSTNow() {
    const now = new Date();
    return new Date(now.getTime() + 9 * 60 * 60 * 1000);
}

module.exports = {
    hasDiet,
    hasExercise,
    hasSleep,
    hasGratitude,
    hasMeditation,
    hasMind,
    getKSTDateStr,
    getKSTNow
};
