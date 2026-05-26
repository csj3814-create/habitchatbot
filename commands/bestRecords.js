/**
 * Scheduled best-record summaries for the open chat room.
 * Scores follow the existing leaderboard rule: diet 1 + exercise 1.5 + mind 1.
 */

const { getLeaderboardByDateRange } = require('../modules/appFirebase');
const { getAllMappings } = require('../modules/userMapping');

const SCORE_PER_DAY = 3.5;
const MEDALS = ['🥇', '🥈', '🥉'];

function pad2(value) {
    return String(value).padStart(2, '0');
}

function formatKstDate(date = new Date()) {
    return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
}

function toKstNoonDate(dateStr) {
    return new Date(`${dateStr}T12:00:00+09:00`);
}

function shiftDateStr(dateStr, days) {
    const date = toKstNoonDate(dateStr);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
}

function formatMD(dateStr) {
    const [, month, day] = dateStr.split('-');
    return `${Number(month)}/${Number(day)}`;
}

function formatScore(score) {
    return Number.isInteger(score) ? String(score) : score.toFixed(1);
}

function getPreviousWeekRange(now = new Date()) {
    const todayStr = formatKstDate(now);
    const today = toKstNoonDate(todayStr);
    const daysSinceMonday = (today.getUTCDay() + 6) % 7;
    const currentMonday = shiftDateStr(todayStr, -daysSinceMonday);
    const endDate = shiftDateStr(currentMonday, -1);
    const startDate = shiftDateStr(endDate, -6);

    return {
        type: 'week',
        startDate,
        endDate,
        days: 7,
        title: '지난 한 주 베스트 3',
        label: `${formatMD(startDate)}~${formatMD(endDate)}`,
        emptyLabel: '지난 한 주'
    };
}

function getPreviousMonthRange(now = new Date()) {
    const todayStr = formatKstDate(now);
    const [yearStr, monthStr] = todayStr.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    const previousYear = month === 1 ? year - 1 : year;
    const previousMonth = month === 1 ? 12 : month - 1;
    const lastDay = new Date(Date.UTC(previousYear, previousMonth, 0)).getUTCDate();
    const startDate = `${previousYear}-${pad2(previousMonth)}-01`;
    const endDate = `${previousYear}-${pad2(previousMonth)}-${pad2(lastDay)}`;

    return {
        type: 'month',
        startDate,
        endDate,
        days: lastDay,
        title: '지난 한 달 베스트 3',
        label: `${previousYear}년 ${previousMonth}월`,
        emptyLabel: '지난 한 달'
    };
}

function resolveBestRecordsPeriod(commandText) {
    const compact = String(commandText || '')
        .trim()
        .replace(/^!/, '')
        .replace(/\s+/g, '')
        .toLowerCase();

    if (['지난주베스트', '주간베스트', '지난주순위', '지난주'].includes(compact)) {
        return 'week';
    }

    if (['지난달베스트', '월간베스트', '지난달순위', '월간순위', '지난달'].includes(compact)) {
        return 'month';
    }

    return null;
}

async function loadUidToName() {
    const uidToName = {};

    try {
        const mappings = await getAllMappings();
        Object.values(mappings).forEach((mapping) => {
            const name = mapping.displayName || mapping.sender;
            if (mapping.googleUid && name) {
                uidToName[mapping.googleUid] = name;
            }
        });
    } catch (error) {
        console.warn('[BestRecords] Failed to load mappings:', error.message);
    }

    return uidToName;
}

function sortLeaderboard(leaderboard) {
    return [...leaderboard]
        .filter((entry) => Number(entry.score || 0) > 0)
        .sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            if ((b.activeDays || 0) !== (a.activeDays || 0)) return (b.activeDays || 0) - (a.activeDays || 0);
            if ((b.totalActivities || 0) !== (a.totalActivities || 0)) {
                return (b.totalActivities || 0) - (a.totalActivities || 0);
            }
            return String(a.displayName || a.uid).localeCompare(String(b.displayName || b.uid), 'ko');
        });
}

function buildBestRecordsMessage(range, leaderboard, uidToName = {}) {
    const ranked = sortLeaderboard(leaderboard);

    if (ranked.length === 0) {
        return `${range.emptyLabel}(${range.label})에는 아직 집계할 기록이 없어요.\n\n앱에서 식단, 운동, 마음 기록을 남기면 다음 자동 집계에 반영돼요.`;
    }

    const maxScore = range.days * SCORE_PER_DAY;
    const averageScore = ranked.reduce((sum, entry) => sum + entry.score, 0) / ranked.length;
    let message = `🏆 ${range.title} (${range.label})\n`;
    message += '━━━━━━━━━━━━━━━\n';

    ranked.slice(0, 3).forEach((entry, index) => {
        const name = uidToName[entry.uid] || entry.displayName || `참여자 ${index + 1}`;
        message += `${MEDALS[index]} ${name} - ${formatScore(entry.score)}점\n`;
        message += `   기록일 ${entry.activeDays || 0}일 · 식단 ${entry.diet || 0} · 운동 ${entry.exercise || 0} · 마음 ${entry.mind || 0}\n`;
    });

    message += '━━━━━━━━━━━━━━━\n';
    message += `총 ${ranked.length}명 참여 | 평균 ${formatScore(Math.round(averageScore * 10) / 10)}점\n`;
    message += `만점 ${formatScore(maxScore)}점 · 식단 1 / 운동 1.5 / 마음 1`;

    return message;
}

async function handleBestRecords(period, options = {}) {
    const range = period === 'month'
        ? getPreviousMonthRange(options.now)
        : getPreviousWeekRange(options.now);

    let leaderboard;
    try {
        leaderboard = await getLeaderboardByDateRange(range.startDate, range.endDate);
    } catch (error) {
        return `⚠️ ${error.message}`;
    }

    const uidToName = await loadUidToName();
    return buildBestRecordsMessage(range, leaderboard, uidToName);
}

module.exports = {
    handleBestRecords,
    resolveBestRecordsPeriod,
    getPreviousWeekRange,
    getPreviousMonthRange,
    buildBestRecordsMessage
};
