/**
 * !내습관: 연결된 사용자의 최근 기록과 7일 추세를 요약합니다.
 */

const { getUserRecords } = require('../modules/appFirebase');
const { getMapping, getDisplayName } = require('../modules/userMapping');
const {
    hasDiet,
    hasExercise,
    hasSleep,
    hasGratitude,
    hasMeditation,
    progressBar,
    calculateStreak
} = require('../modules/statsHelpers');

async function handleMyHabits(user) {
    const displayName = getDisplayName(user);
    const mapping = await getMapping(user);

    if (!mapping) {
        return `${displayName}님은 아직 해빛스쿨 계정이 연결되어 있지 않아요.\n\n연결 방법:\n앱 프로필에서 연결 코드를 만든 뒤\n!등록 ABCD1234`;
    }

    let records;
    try {
        records = await getUserRecords(mapping.googleUid, 30);
    } catch (error) {
        return `오류: ${error.message}`;
    }

    if (records.length === 0) {
        return `${displayName}님은 최근 기록이 아직 없어요.\n해빛스쿨 앱에 오늘 기록을 남기고 다시 확인해 보세요.`;
    }

    const latest = records[records.length - 1];
    const streak = calculateStreak(records);
    const recentRecords = records.slice(-7);

    const dietDays = recentRecords.filter(hasDiet).length;
    const exerciseDays = recentRecords.filter(hasExercise).length;
    const sleepDays = recentRecords.filter(hasSleep).length;
    const gratitudeDays = recentRecords.filter(hasGratitude).length;
    const meditationDays = recentRecords.filter(hasMeditation).length;

    const dietMeals = [];
    if (latest.diet?.breakfastUrl) dietMeals.push('아침');
    if (latest.diet?.lunchUrl) dietMeals.push('점심');
    if (latest.diet?.dinnerUrl) dietMeals.push('저녁');
    if (latest.diet?.snackUrl) dietMeals.push('간식');

    const exerciseParts = [];
    if (latest.exercise?.cardioList?.length) exerciseParts.push(`유산소 ${latest.exercise.cardioList.length}개`);
    if (latest.exercise?.strengthList?.length) exerciseParts.push(`근력 ${latest.exercise.strengthList.length}개`);

    let msg = `${displayName}님의 습관 현황\n──────────\n`;
    msg += `식단: ${progressBar(dietDays)}\n`;
    msg += `운동: ${progressBar(exerciseDays)}\n`;
    msg += `수면: ${progressBar(sleepDays)}\n`;
    msg += `감사: ${progressBar(gratitudeDays)}\n`;
    if (meditationDays > 0) {
        msg += `명상: ${progressBar(meditationDays)}\n`;
    }

    msg += `──────────\n`;
    msg += `마지막 기록: ${latest.date}\n`;

    if (dietMeals.length > 0) {
        msg += `식단: ${dietMeals.join(', ')}\n`;
    }

    if (exerciseParts.length > 0) {
        msg += `운동: ${exerciseParts.join(', ')}\n`;
    }

    if (latest.sleepAndMind?.sleepAnalysis?.sleepDuration || latest.sleepAndMind?.sleepAnalysis?.totalSleep) {
        msg += `수면: ${latest.sleepAndMind.sleepAnalysis.sleepDuration || latest.sleepAndMind.sleepAnalysis.totalSleep}\n`;
    }

    if (latest.sleepAndMind?.gratitude) {
        const gratitude = latest.sleepAndMind.gratitude.length > 30
            ? `${latest.sleepAndMind.gratitude.slice(0, 30)}...`
            : latest.sleepAndMind.gratitude;
        msg += `감사: "${gratitude}"\n`;
    }

    if (latest.metrics?.weight || latest.metrics?.glucose) {
        const metrics = [];
        if (latest.metrics.weight) metrics.push(`체중 ${latest.metrics.weight}kg`);
        if (latest.metrics.glucose) metrics.push(`혈당 ${latest.metrics.glucose}`);
        msg += `지표: ${metrics.join(' | ')}\n`;
    }

    const weakestArea = [
        { label: '식단', count: dietDays },
        { label: '운동', count: exerciseDays },
        { label: '수면', count: sleepDays },
        { label: '감사', count: gratitudeDays }
    ].reduce((min, item) => item.count < min.count ? item : min);

    if (weakestArea.count < 4) {
        msg += `\n이번 주에는 ${weakestArea.label} 쪽을 조금 더 챙기면 좋아요.`;
    } else {
        msg += `\n전반적으로 고르게 잘 챙기고 있어요.`;
    }

    if (streak >= 7) {
        msg += `\n연속 기록 ${streak}일째예요. 정말 좋아요.`;
    } else if (streak > 0) {
        msg += `\n연속 기록 ${streak}일째예요. 오늘도 이어가 볼까요?`;
    } else {
        msg += `\n오늘 기록을 남기면 연속 기록이 다시 시작돼요.`;
    }

    return msg;
}

module.exports = { handleMyHabits };
