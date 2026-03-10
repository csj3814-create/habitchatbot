/**
 * !우리반 — 기수 전체 현황 (공개 데이터 기반)
 * 등록 불필요, 누구나 사용 가능
 */

const { getWeeklyStats } = require('../modules/appFirebase');

async function handleClassStatus(sender) {
    const stats = await getWeeklyStats();

    if (!stats || stats.totalRecords === 0) {
        return `📊 해빛스쿨 현황\n━━━━━━━━━━━━━━━\n이번 주 기록이 아직 없어요!\n\n🌟 첫 번째로 앱에 기록하고\n오픈톡방에 !오늘 으로 확인해보세요!`;
    }

    const today = new Date();
    const startDate = stats.dates[0].substring(5).replace('-', '/');
    const endDate = stats.dates[stats.dates.length - 1].substring(5).replace('-', '/');

    let msg = `📊 해빛스쿨 이번 주 현황 (${startDate}~${endDate})\n`;
    msg += `━━━━━━━━━━━━━━━━━\n`;
    msg += `👥 활동 참여자: ${stats.uniqueUsers}명\n`;
    msg += `📱 총 기록: ${stats.totalRecords}건\n\n`;

    msg += `📋 카테고리별 기록\n`;
    msg += `🍽 식단: ${stats.dietCount}건 (일 평균 ${Math.round(stats.dietCount / 7)}건)\n`;
    msg += `🏃 운동: ${stats.exerciseCount}건 (일 평균 ${Math.round(stats.exerciseCount / 7)}건)\n`;
    msg += `🧘 마음: ${stats.mindCount}건 (일 평균 ${Math.round(stats.mindCount / 7)}건)\n`;
    msg += `━━━━━━━━━━━━━━━━━\n`;

    // 일별 참여자 수 추이
    msg += `📅 일별 참여자 수\n`;
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    stats.dailyBreakdown.forEach(day => {
        const d = new Date(day.date + 'T12:00:00');
        const dayName = dayNames[d.getDay()];
        const bar = '▓'.repeat(Math.min(day.users, 15)) + (day.users > 0 ? ` ${day.users}명` : ' -');
        msg += `${dayName} ${bar}\n`;
    });

    msg += `\n💪 모두 함께 건강해지고 있어요!`;
    msg += `\n📱 앱에서 기록하고 !내습관 으로 확인하세요!`;

    return msg;
}

module.exports = { handleClassStatus };
