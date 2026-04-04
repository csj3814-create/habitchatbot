/**
 * !순위 명령으로 이번 주 해빛스쿨 리더보드를 보여줍니다.
 * 점수: 식단 1점 + 운동 1.5점 + 마음 1점
 */

const { getWeeklyLeaderboard } = require('../modules/appFirebase');
const { getAllMappings } = require('../modules/userMapping');
const { getKstDateStr } = require('../modules/statsHelpers');

let rankingCache = null;
let rankingCacheTime = 0;
const RANKING_CACHE_TTL = 5 * 60 * 1000;
const WEEK_MAX_SCORE = 24.5;

async function handleRanking() {
    const now = Date.now();
    let leaderboard;

    if (rankingCache && (now - rankingCacheTime) < RANKING_CACHE_TTL) {
        leaderboard = rankingCache;
    } else {
        try {
            leaderboard = await getWeeklyLeaderboard();
            rankingCache = leaderboard;
            rankingCacheTime = now;
        } catch (error) {
            return `오류: ${error.message}`;
        }
    }

    if (!leaderboard || leaderboard.length === 0) {
        return `이번 주에는 아직 기록이 없어요.\n\n앱에서 식단, 운동, 마음 기록을 남기면 순위가 집계돼요.\n지금 바로 해빛스쿨 앱을 열어볼까요?`;
    }

    const uidToName = {};
    try {
        const allMappings = await getAllMappings();
        Object.values(allMappings).forEach(mapping => {
            const name = mapping.displayName || mapping.sender;
            if (mapping.googleUid && name) {
                uidToName[mapping.googleUid] = name;
            }
        });
    } catch (error) {
        console.warn('[Ranking] Failed to load mappings:', error.message);
    }

    const sorted = [...leaderboard].sort((a, b) => b.score - a.score);
    const medals = ['🥇', '🥈', '🥉'];

    const todayStr = getKstDateStr();
    const weekStart = new Date(`${todayStr}T00:00:00+09:00`);
    weekStart.setDate(weekStart.getDate() - 6);
    const startMD = weekStart.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }).substring(5).replace('-', '/');
    const endMD = todayStr.substring(5).replace('-', '/');

    let msg = `이번 주 순위 (${startMD}~${endMD})\n`;
    msg += `──────────\n`;

    sorted.slice(0, 10).forEach((entry, index) => {
        const name = uidToName[entry.uid] || `참여자 ${index + 1}`;
        const prefix = medals[index] || `${index + 1}위`;
        const filled = Math.min(Math.round((entry.score / WEEK_MAX_SCORE) * 8), 8);
        const bar = '■'.repeat(filled) + '□'.repeat(8 - filled);

        msg += `${prefix} ${name} ${bar} ${entry.score}점\n`;
    });

    const avgScore = sorted.length > 0
        ? Math.round((sorted.reduce((sum, entry) => sum + entry.score, 0) / sorted.length) * 10) / 10
        : 0;

    msg += `──────────\n`;
    msg += `${sorted.length}명 참여 | 평균 ${avgScore}점\n`;
    msg += `(식단×1 | 운동×1.5 | 마음×1)\n\n`;
    msg += `!내습관 으로 내 기록도 확인해 보세요.`;

    return msg;
}

module.exports = { handleRanking };
