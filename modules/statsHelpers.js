/**
 * statsHelpers.js — 기록 통계 계산 공통 함수
 * daily_logs 레코드의 카테고리 존재 여부 판단
 */

const hasDiet = r => !!(r.diet && (r.diet.breakfastUrl || r.diet.lunchUrl || r.diet.dinnerUrl || r.diet.snackUrl));
const hasExercise = r => !!(r.exercise && ((r.exercise.cardioList?.length > 0) || (r.exercise.strengthList?.length > 0)));
const hasSleep = r => !!r.sleepAndMind?.sleepImageUrl;
const hasGratitude = r => !!r.sleepAndMind?.gratitude;
const hasMeditation = r => !!r.sleepAndMind?.meditationDone;
const hasMind = r => hasSleep(r) || hasMeditation(r) || hasGratitude(r);

/**
 * KST 기준 오늘 날짜 문자열 (YYYY-MM-DD)
 */
function getKstDateStr() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
}

/**
 * 프로그레스 바 생성
 * @param {number} count 달성 일수
 * @param {number} total 전체 일수 (기본 7)
 * @param {number} barLength 바 길이 (기본 7)
 */
function progressBar(count, total = 7, barLength = 7) {
    const filled = Math.round((count / total) * barLength);
    return '█'.repeat(filled) + '░'.repeat(barLength - filled) + ` ${count}/${total}일`;
}

module.exports = {
    hasDiet,
    hasExercise,
    hasSleep,
    hasGratitude,
    hasMeditation,
    hasMind,
    getKstDateStr,
    progressBar
};
