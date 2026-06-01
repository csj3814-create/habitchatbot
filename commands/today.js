/**
 * !오늘 — 오늘의 갤러리(공개) 기록 요약
 * 등록 불필요, 누구나 사용 가능
 */

const { getGalleryByDate } = require('../modules/appFirebase');
const { hasDiet, hasExercise, hasSleep, hasGratitude, hasMeditation, getKstDateStr } = require('../modules/statsHelpers');
const { handleBestRecords } = require('./bestRecords');

function getTodayDateStr(options = {}) {
    return options.now
        ? options.now.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
        : getKstDateStr();
}

function getAutoBestPeriods(dateStr) {
    const periods = [];
    const kstNoon = new Date(`${dateStr}T12:00:00+09:00`);
    const dayOfWeek = kstNoon.getUTCDay();
    const dayOfMonth = Number(dateStr.split('-')[2]);

    if (dayOfWeek === 1) {
        periods.push('week');
    }

    if (dayOfMonth === 1) {
        periods.push('month');
    }

    return periods;
}

async function appendAutoBestRecords(message, dateStr, options = {}) {
    const periods = getAutoBestPeriods(dateStr);
    if (periods.length === 0) {
        return message;
    }

    const sections = [];
    for (const period of periods) {
        sections.push(await handleBestRecords(period, { now: options.now }));
    }

    return `${message}\n\n${sections.join('\n\n')}`;
}

async function handleToday(sender, options = {}) {
    const dateStr = getTodayDateStr(options);
    const [, monthStr, dayStr] = dateStr.split('-');
    const month = parseInt(monthStr);
    const day = parseInt(dayStr);

    let logs;
    try {
        logs = await getGalleryByDate(dateStr);
    } catch (e) {
        return `⚠️ ${e.message}`;
    }

    if (logs.length === 0) {
        const emptyMessage = `📋 해빛스쿨 오늘의 기록 (${month}/${day})\n━━━━━━━━━━━━━━━\n아직 오늘 기록이 없어요!\n\n🌟 첫 번째로 앱에 기록해보세요!\n오늘의 식단, 운동, 감사일기를 남겨보세요 💪`;
        return appendAutoBestRecords(emptyMessage, dateStr, options);
    }

    // 통계 계산
    const dietCount = logs.filter(hasDiet).length;
    const exerciseCount = logs.filter(hasExercise).length;
    const sleepCount = logs.filter(hasSleep).length;
    const gratitudeCount = logs.filter(hasGratitude).length;
    const meditationCount = logs.filter(hasMeditation).length;
    const uniqueUsers = new Set(logs.map(l => l.userId)).size;
    const totalActivities = dietCount + exerciseCount + sleepCount + gratitudeCount;

    let msg = `📋 해빛스쿨 오늘의 기록 (${month}/${day})\n━━━━━━━━━━━━━━━\n`;
    msg += `👥 참여자: ${uniqueUsers}명\n`;
    msg += `🍽 식단 기록: ${dietCount}건\n`;
    msg += `🏃 운동 기록: ${exerciseCount}건\n`;
    msg += `😴 수면 분석: ${sleepCount}건\n`;
    msg += `📝 감사일기: ${gratitudeCount}건\n`;
    if (meditationCount > 0) msg += `🧘 마음챙김: ${meditationCount}건\n`;
    msg += `━━━━━━━━━━━━━━━\n`;
    msg += `💪 총 ${totalActivities}건의 습관 기록! 대단해요!\n\n`;
    msg += `📱 나도 기록하러 가기 → 해빛스쿨 앱`;

    return appendAutoBestRecords(msg, dateStr, options);
}

module.exports = {
    handleToday,
    getAutoBestPeriods
};
