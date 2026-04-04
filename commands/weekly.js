/**
 * !주간: 최근 2주 기록을 바탕으로 이번 주 추세를 요약합니다.
 */

const { getUserRecords } = require('../modules/appFirebase');
const { getMapping, getDisplayName } = require('../modules/userMapping');
const { hasDiet, hasExercise, hasSleep, hasGratitude, getKstDateStr } = require('../modules/statsHelpers');

function trendLabel(current, previous) {
    if (previous === 0) {
        return current > 0 ? `+${current}` : '-';
    }

    const diff = current - previous;
    if (diff > 0) return `+${diff}`;
    if (diff < 0) return `${diff}`;
    return '=';
}

function weeklyBar(count, total = 7) {
    const filled = Math.min(Math.round((count / total) * 8), 8);
    const percent = Math.min(Math.round((count / total) * 100), 100);
    return `${'■'.repeat(filled)}${'□'.repeat(8 - filled)} ${percent}%`;
}

async function handleWeekly(user) {
    const displayName = getDisplayName(user);
    const mapping = await getMapping(user);

    if (!mapping) {
        return `${displayName}님은 아직 계정이 연결되어 있지 않아요.\n앱 프로필에서 연결 코드를 만든 뒤 !등록 ABCD1234 로 먼저 연결해 주세요.`;
    }

    let records;
    try {
        records = await getUserRecords(mapping.googleUid, 14);
    } catch (error) {
        return `오류: ${error.message}`;
    }

    if (records.length === 0) {
        return `${displayName}님은 아직 앱 기록이 없어요.\n해빛스쿨 앱에서 첫 기록을 남긴 뒤 다시 확인해 보세요.`;
    }

    const todayStr = getKstDateStr();
    const sevenDaysAgo = new Date(`${todayStr}T00:00:00+09:00`);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });

    const thisWeek = records.filter(record => record.date >= sevenDaysAgoStr && record.date <= todayStr);
    const lastWeek = records.filter(record => record.date < sevenDaysAgoStr);

    const current = {
        diet: thisWeek.filter(hasDiet).length,
        exercise: thisWeek.filter(hasExercise).length,
        sleep: thisWeek.filter(hasSleep).length,
        gratitude: thisWeek.filter(hasGratitude).length
    };

    const previous = {
        diet: lastWeek.filter(hasDiet).length,
        exercise: lastWeek.filter(hasExercise).length,
        sleep: lastWeek.filter(hasSleep).length,
        gratitude: lastWeek.filter(hasGratitude).length
    };

    const startDate = thisWeek.length > 0 ? thisWeek[0].date.substring(5).replace('-', '/') : '';
    const endDate = thisWeek.length > 0 ? thisWeek[thisWeek.length - 1].date.substring(5).replace('-', '/') : '';

    let msg = `${displayName}님의 주간 리포트`;
    if (startDate && endDate) {
        msg += ` (${startDate}~${endDate})`;
    }
    msg += `\n──────────\n`;
    msg += `식단: ${weeklyBar(current.diet)} ${trendLabel(current.diet, previous.diet)}\n`;
    msg += `운동: ${weeklyBar(current.exercise)} ${trendLabel(current.exercise, previous.exercise)}\n`;
    msg += `수면: ${weeklyBar(current.sleep)} ${trendLabel(current.sleep, previous.sleep)}\n`;
    msg += `감사: ${weeklyBar(current.gratitude)} ${trendLabel(current.gratitude, previous.gratitude)}\n`;

    const strongest = [
        { label: '식단', count: current.diet },
        { label: '운동', count: current.exercise },
        { label: '수면', count: current.sleep },
        { label: '감사', count: current.gratitude }
    ].reduce((max, item) => item.count > max.count ? item : max);

    const weakest = [
        { label: '식단', count: current.diet },
        { label: '운동', count: current.exercise },
        { label: '수면', count: current.sleep },
        { label: '감사', count: current.gratitude }
    ].reduce((min, item) => item.count < min.count ? item : min);

    msg += `\n가장 잘한 영역은 ${strongest.label}이에요.`;
    if (weakest.count < 3) {
        msg += `\n다음 주에는 ${weakest.label}을 ${weakest.count + 2}회 정도 목표로 잡아보면 좋아요.`;
    }

    return msg;
}

module.exports = { handleWeekly };
