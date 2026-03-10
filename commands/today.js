/**
 * !오늘 — 오늘의 갤러리(공개) 기록 요약
 * 등록 불필요, 누구나 사용 가능
 */

const { getGalleryByDate } = require('../modules/appFirebase');

async function handleToday(sender) {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    const month = today.getMonth() + 1;
    const day = today.getDate();

    const logs = await getGalleryByDate(dateStr);

    if (logs.length === 0) {
        return `📋 해빛스쿨 오늘의 기록 (${month}/${day})\n━━━━━━━━━━━━━━━\n아직 오늘 기록이 없어요!\n\n🌟 첫 번째로 앱에 기록해보세요!\n오늘의 식단, 운동, 감사일기를 남겨보세요 💪`;
    }

    // 통계 계산
    const dietCount = logs.filter(l => l.diet && (l.diet.breakfastUrl || l.diet.lunchUrl || l.diet.dinnerUrl || l.diet.snackUrl)).length;
    const exerciseCount = logs.filter(l => l.exercise && ((l.exercise.cardioList?.length > 0) || (l.exercise.strengthList?.length > 0))).length;
    const sleepCount = logs.filter(l => l.sleepAndMind?.sleepImageUrl).length;
    const gratitudeCount = logs.filter(l => l.sleepAndMind?.gratitude).length;
    const meditationCount = logs.filter(l => l.sleepAndMind?.meditationDone).length;
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

    return msg;
}

module.exports = { handleToday };
