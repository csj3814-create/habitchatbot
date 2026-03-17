/**
 * !랭킹 — 이번 주 해빛스쿨 리더보드
 * 해빛스쿨 앱 Firestore daily_logs 집계 기반 (앱 기록만 유효)
 * 점수: 식단(×1) + 운동(×1.5) + 마음습관(×1) → 최대 24.5점/주
 */

const { getWeeklyLeaderboard } = require('../modules/appFirebase');
const { getAllMappings } = require('../modules/userMapping');
const { getKstDateStr } = require('../modules/statsHelpers');

// 5분 메모리 캐시 (Firestore 읽기 비용 절감)
let rankingCache = null;
let rankingCacheTime = 0;
const RANKING_CACHE_TTL = 5 * 60 * 1000; // 5분

// 주간 최고 점수 (7일 × (1 + 1.5 + 1))
const WEEK_MAX_SCORE = 24.5;

async function handleRanking() {
    const now = Date.now();
    let leaderboard;

    // 캐시 확인
    if (rankingCache && (now - rankingCacheTime) < RANKING_CACHE_TTL) {
        leaderboard = rankingCache;
    } else {
        try {
            leaderboard = await getWeeklyLeaderboard();
            rankingCache = leaderboard;
            rankingCacheTime = now;
        } catch (e) {
            return `⚠️ ${e.message}`;
        }
    }

    if (!leaderboard || leaderboard.length === 0) {
        return `📊 이번 주 아직 기록이 없어요!\n\n앱에서 식단, 운동, 마음습관을 기록하면\n랭킹에 올라가요! 💪\n\n지금 바로 해빛스쿨 앱을 열어볼까요?`;
    }

    // googleUid → sender 역매핑 구성
    const uidToName = {};
    try {
        const allMappings = await getAllMappings();
        Object.values(allMappings).forEach(m => {
            if (m.googleUid && m.sender) uidToName[m.googleUid] = m.sender;
        });
    } catch (e) {
        console.warn('[Ranking] 매핑 조회 실패, 번호로 표시:', e.message);
    }

    // 점수 내림차순 정렬
    const sorted = [...leaderboard].sort((a, b) => b.score - a.score);
    const medals = ['🥇', '🥈', '🥉'];

    // 이번 주 날짜 범위 표시 (KST 기준)
    const todayStr = getKstDateStr();
    const weekStart = new Date(todayStr + 'T00:00:00+09:00');
    weekStart.setDate(weekStart.getDate() - 6);
    const startMD = weekStart.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }).substring(5).replace('-', '/');
    const endMD = todayStr.substring(5).replace('-', '/');

    let msg = `🏆 이번 주 랭킹 (${startMD}~${endMD})\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n`;

    sorted.slice(0, 10).forEach((entry, i) => {
        const name = uidToName[entry.uid] || `참여자${i + 1}`;
        const prefix = medals[i] || `${i + 1}위`;

        // 점수 바 (8칸 기준)
        const filled = Math.min(Math.round((entry.score / WEEK_MAX_SCORE) * 8), 8);
        const bar = '█'.repeat(filled) + '░'.repeat(8 - filled);

        msg += `${prefix} ${name} ${bar} ${entry.score}점\n`;
    });

    const avgScore = sorted.length > 0
        ? Math.round(sorted.reduce((s, e) => s + e.score, 0) / sorted.length * 10) / 10
        : 0;

    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `👥 ${sorted.length}명 참여 | 평균 ${avgScore}점\n`;
    msg += `(🍽×1 | 🏃×1.5 | 📝×1)\n\n`;
    msg += `!내습관 으로 내 현황 확인! 💪`;

    return msg;
}

module.exports = { handleRanking };
