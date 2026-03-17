/**
 * !내습관 — 등록 유저의 개인 앱 데이터 조회
 * !등록 완료된 유저만 사용 가능
 */

const { getUserRecords, getUserRecordByDate } = require('../modules/appFirebase');
const { getMapping } = require('../modules/userMapping');
const { hasDiet, hasExercise, hasSleep, hasGratitude, hasMeditation, progressBar, calculateStreak } = require('../modules/statsHelpers');

async function handleMyHabits(sender) {
    // 매핑 확인
    const mapping = await getMapping(sender);
    if (!mapping) {
        return `${sender}님, 아직 해빛스쿨 앱 계정이 연결되지 않았어요!\n\n📱 연결 방법:\n!등록 your@gmail.com\n\n구글 이메일을 입력하면 앱 기록을 여기서 확인할 수 있어요! 🔗`;
    }

    const googleUid = mapping.googleUid;
    let records;
    try {
        // 30일치 조회: 최근 7일은 통계 표시, 전체는 스트릭 계산에 활용
        records = await getUserRecords(googleUid, 30);
    } catch (e) {
        return `⚠️ ${e.message}`;
    }

    if (records.length === 0) {
        return `${sender}님, 최근 7일간 앱 기록이 없어요! 😢\n\n지금 해빛스쿨 앱에서 오늘의 식단부터 기록해볼까요? 📱`;
    }

    // 최신 기록
    const latest = records[records.length - 1];
    const latestDate = latest.date;

    // 스트릭 계산 (30일 전체 사용)
    const streak = calculateStreak(records);

    // 통계 계산 (최근 7일만 사용)
    const recentRecords = records.slice(-7);
    const dietDays = recentRecords.filter(hasDiet).length;
    const exerciseDays = recentRecords.filter(hasExercise).length;
    const sleepDays = recentRecords.filter(hasSleep).length;
    const gratitudeDays = recentRecords.filter(hasGratitude).length;
    const meditationDays = recentRecords.filter(hasMeditation).length;

    // 식단 사진 수 계산 (최신)
    let dietDetail = '';
    if (latest.diet) {
        const meals = [];
        if (latest.diet.breakfastUrl) meals.push('아침');
        if (latest.diet.lunchUrl) meals.push('점심');
        if (latest.diet.dinnerUrl) meals.push('저녁');
        if (latest.diet.snackUrl) meals.push('간식');
        if (meals.length > 0) dietDetail = `(${meals.join(', ')})`;
    }

    // AI 분석 결과 요약
    let dietAiSummary = '';
    if (latest.dietAnalysis) {
        const meals = ['breakfast', 'lunch', 'dinner', 'snack'];
        for (const meal of meals) {
            const analysis = latest.dietAnalysis[meal];
            if (analysis?.totalCalories) {
                dietAiSummary = `\n   → AI 분석: 약 ${analysis.totalCalories}kcal`;
                break;
            }
        }
    }

    // 운동 상세
    let exerciseDetail = '';
    if (latest.exercise) {
        const cardioCount = latest.exercise.cardioList?.length || 0;
        const strengthCount = latest.exercise.strengthList?.length || 0;
        const parts = [];
        if (cardioCount > 0) parts.push(`유산소 ${cardioCount}건`);
        if (strengthCount > 0) parts.push(`근력 ${strengthCount}건`);
        if (parts.length > 0) exerciseDetail = `(${parts.join(', ')})`;
    }

    // 수면 분석
    let sleepDetail = '';
    if (latest.sleepAndMind?.sleepAnalysis) {
        const sa = latest.sleepAndMind.sleepAnalysis;
        if (sa.sleepDuration) sleepDetail = `\n   → ${sa.sleepDuration}`;
        else if (sa.totalSleep) sleepDetail = `\n   → ${sa.totalSleep}`;
    }

    // 감사일기
    let gratitudeDetail = '';
    if (latest.sleepAndMind?.gratitude) {
        const text = latest.sleepAndMind.gratitude;
        gratitudeDetail = `\n   → "${text.length > 30 ? text.substring(0, 30) + '...' : text}"`;
    }

    // 건강 지표
    let metricsDetail = '';
    if (latest.metrics) {
        const parts = [];
        if (latest.metrics.weight) parts.push(`체중 ${latest.metrics.weight}kg`);
        if (latest.metrics.glucose) parts.push(`혈당 ${latest.metrics.glucose}`);
        if (parts.length > 0) metricsDetail = `\n⚕️ ${parts.join(' | ')}`;
    }

    let msg = `📋 ${sender}님의 습관 현황 (최근 7일)\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `🍽 식습관: ${progressBar(dietDays)}\n`;
    msg += `🏃 운동:   ${progressBar(exerciseDays)}\n`;
    msg += `😴 수면:   ${progressBar(sleepDays)}\n`;
    msg += `📝 감사:   ${progressBar(gratitudeDays)}\n`;
    if (meditationDays > 0) msg += `🧘 명상:   ${progressBar(meditationDays)}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n`;

    msg += `📅 마지막 기록: ${latestDate}\n`;
    if (dietDetail) msg += `🍽 식단 ${dietDetail}${dietAiSummary}\n`;
    if (exerciseDetail) msg += `🏃 운동 ${exerciseDetail}\n`;
    if (sleepDetail) msg += `😴 수면${sleepDetail}\n`;
    if (gratitudeDetail) msg += `📝 감사일기${gratitudeDetail}\n`;
    if (metricsDetail) msg += metricsDetail + '\n';

    // AI 코칭 포인트 (가장 약한 영역)
    const areas = [
        { name: '식습관', count: dietDays, emoji: '🍽' },
        { name: '운동', count: exerciseDays, emoji: '🏃' },
        { name: '수면 분석', count: sleepDays, emoji: '😴' },
        { name: '감사일기', count: gratitudeDays, emoji: '📝' }
    ];
    const weakest = areas.reduce((min, a) => a.count < min.count ? a : min, areas[0]);

    if (weakest.count < 4) {
        msg += `\n💡 ${weakest.emoji} ${weakest.name}이 ${weakest.count}일이에요!`;
        msg += `\n   오늘 앱에서 기록해볼까요? 화이팅! 🔥`;
    } else {
        msg += `\n🎉 모든 영역을 골고루 잘 실천하고 계세요! 대단해요!`;
    }

    // 스트릭 표시
    msg += `\n━━━━━━━━━━━━━━━━━━━━`;
    if (streak >= 7) {
        msg += `\n🔥 현재 스트릭: ${streak}일 연속! 완전 대단해요! 🏆`;
    } else if (streak >= 3) {
        msg += `\n🔥 현재 스트릭: ${streak}일 연속! 꺾이지 않는 마음! 💪`;
    } else if (streak > 0) {
        msg += `\n🌱 스트릭: ${streak}일째! 오늘도 기록하면 ${streak + 1}일 연속!`;
    } else {
        msg += `\n✨ 오늘 기록하면 스트릭이 시작돼요!`;
    }

    return msg;
}

module.exports = { handleMyHabits };
