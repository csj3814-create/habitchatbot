/**
 * statsHelpers.js — 기록 통계 계산 공통 함수
 * daily_logs 레코드의 카테고리 존재 여부 판단
 */

// 앱 서버가 그날 기록에 매긴 결과(daily_logs.awardedPoints)를 먼저 본다. 걸음수 8,000보,
// Health Connect 로 들어온 수면, 마음 공유를 끈 회원의 감사일기처럼 사진·목록 없이 인정되는
// 기록이 거기에만 남는다(habitschool functions/points-utils.js). 예전 기록에는 이 칸이 없을 수
// 있어 사진·목록으로 보던 판정도 그대로 둔다 — 둘 중 하나면 기록한 날이다.
function isAwarded(record, category) {
    const awarded = record?.awardedPoints;
    if (!awarded || typeof awarded !== 'object') return false;
    return awarded[category] === true || Number(awarded[`${category}Points`]) > 0;
}

// Health Connect 밤잠: 캡처 사진 없이 기기가 넘긴 수면. 회원이 시간을 고쳤으면 기기 기록이 아니다.
function hasSyncedSleep(record) {
    const mind = record?.sleepAndMind;
    const sync = mind?.sleepSync;
    if (!sync || typeof sync !== 'object' || sync.source !== 'health_connect') return false;
    const hours = Number(sync.sleepHours);
    return sync.wakeDate === record.date && hours > 0 && Number(mind.sleepHours) === hours;
}

const hasDiet = r => isAwarded(r, 'diet')
    || !!(r.diet && (r.diet.breakfastUrl || r.diet.lunchUrl || r.diet.dinnerUrl || r.diet.snackUrl));
const hasExercise = r => isAwarded(r, 'exercise')
    || !!(r.exercise && ((r.exercise.cardioList?.length > 0) || (r.exercise.strengthList?.length > 0)));
const hasSleep = r => !!r.sleepAndMind?.sleepImageUrl || hasSyncedSleep(r);
const hasGratitude = r => !!r.sleepAndMind?.gratitude;
const hasMeditation = r => !!r.sleepAndMind?.meditationDone;
const hasMind = r => isAwarded(r, 'mind') || hasSleep(r) || hasMeditation(r) || hasGratitude(r);

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

/**
 * 오늘의 연속 기록. 앱이 회원 문서에 적어 둔 값(users.currentStreak)을 쓴다.
 *
 * 그 값은 기록을 저장할 때만 쓰이므로 뜻은 "lastLogDate 시점의 연속"이다. 마지막 기록이
 * 어제보다 오래됐으면 끊긴 것이다(habitschool functions/streak-freshness.js 와 같은 규칙).
 * 해외 회원은 그곳 날짜로 기록해 lastLogDate 가 한국의 내일일 수 있어 "어제 이후"로 본다.
 *
 * 회원 문서를 못 읽었거나 lastLogDate 가 없으면 최근 기록으로 직접 센다. 이때는 읽어 온
 * 기록 수가 상한이다.
 */
function resolveStreak(profile, records, todayStr = getKstDateStr()) {
    const lastLogDate = String(profile?.lastLogDate || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(lastLogDate)) {
        return calculateStreak(records);
    }

    const yesterday = new Date(`${todayStr}T12:00:00+09:00`);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });

    if (lastLogDate < yesterdayStr) return 0;
    return Math.max(0, Math.floor(Number(profile.currentStreak) || 0));
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
    calculateStreak,
    resolveStreak
};
