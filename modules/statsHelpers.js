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
    const filled = Math.min(Math.round((count / total) * barLength), barLength);
    return '█'.repeat(filled) + '░'.repeat(barLength - filled) + ` ${count}/${total}일`;
}

/**
 * 연속 기록 일수(스트릭) 계산
 * 오늘 기록이 있으면 오늘부터, 없으면 어제부터 역산
 * @param {Array} records - date 필드를 포함한 기록 배열
 * @returns {number} 연속 달성 일수
 */
function calculateStreak(records) {
    if (!records || records.length === 0) return 0;

    const recordDates = new Set(records.map(r => r.date));
    const todayStr = getKstDateStr();

    // 오늘 기록이 없으면 어제부터 체크 (아직 기록 전인 경우 스트릭 유지)
    const startOffset = recordDates.has(todayStr) ? 0 : 1;
    let streak = 0;

    for (let i = startOffset; i < 365; i++) {
        const d = new Date(todayStr + 'T12:00:00+09:00');
        d.setDate(d.getDate() - i);
        const dateStr = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });

        if (recordDates.has(dateStr)) {
            streak++;
        } else {
            break;
        }
    }

    return streak;
}

module.exports = {
    hasDiet,
    hasExercise,
    hasSleep,
    hasGratitude,
    hasMeditation,
    hasMind,
    getKstDateStr,
    progressBar,
    calculateStreak
};
