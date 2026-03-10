/**
 * !주간 — 등록 유저의 주간 트렌드 분석
 * 최근 7일 데이터 기반 트렌드 + AI 맞춤 코칭
 */

const { getUserRecords } = require('../modules/appFirebase');
const { getMapping } = require('../modules/userMapping');

async function handleWeekly(sender) {
    const mapping = await getMapping(sender);
    if (!mapping) {
        return `${sender}님, 아직 앱 계정이 연결되지 않았어요!\n!등록 your@gmail.com 으로 먼저 연결해주세요 🔗`;
    }

    const records = await getUserRecords(mapping.googleUid, 14);

    if (records.length === 0) {
        return `${sender}님, 아직 앱 기록이 없어요!\n해빛스쿨 앱에서 첫 기록을 남겨보세요 📱`;
    }

    // 이번 주 / 지난 주 분리
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // 최근 7일
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

    const thisWeek = records.filter(r => r.date >= sevenDaysAgoStr && r.date <= todayStr);
    const lastWeek = records.filter(r => r.date < sevenDaysAgoStr);

    // 이번 주 카테고리별 일수
    const hasDiet = r => r.diet && (r.diet.breakfastUrl || r.diet.lunchUrl || r.diet.dinnerUrl || r.diet.snackUrl);
    const hasExercise = r => r.exercise && ((r.exercise.cardioList?.length > 0) || (r.exercise.strengthList?.length > 0));
    const hasSleep = r => r.sleepAndMind?.sleepImageUrl;
    const hasGratitude = r => r.sleepAndMind?.gratitude;

    const tw = {
        diet: thisWeek.filter(hasDiet).length,
        exercise: thisWeek.filter(hasExercise).length,
        sleep: thisWeek.filter(hasSleep).length,
        gratitude: thisWeek.filter(hasGratitude).length,
        total: thisWeek.length
    };

    const lw = {
        diet: lastWeek.filter(hasDiet).length,
        exercise: lastWeek.filter(hasExercise).length,
        sleep: lastWeek.filter(hasSleep).length,
        gratitude: lastWeek.filter(hasGratitude).length
    };

    // 트렌드 계산
    const trend = (curr, prev) => {
        if (prev === 0) return curr > 0 ? '🆕' : '-';
        const diff = curr - prev;
        if (diff > 0) return `↑${diff}`;
        if (diff < 0) return `↓${Math.abs(diff)}`;
        return '→';
    };

    const progressBar = (count, total = 7) => {
        const pct = Math.round((count / total) * 100);
        const filled = Math.round((count / total) * 8);
        return '█'.repeat(filled) + '░'.repeat(8 - filled) + ` ${pct}%`;
    };

    // 건강 지표 변화 추적
    let metricsMsg = '';
    const recordsWithWeight = thisWeek.filter(r => r.metrics?.weight);
    if (recordsWithWeight.length >= 2) {
        const first = parseFloat(recordsWithWeight[0].metrics.weight);
        const last = parseFloat(recordsWithWeight[recordsWithWeight.length - 1].metrics.weight);
        const diff = (last - first).toFixed(1);
        const arrow = diff > 0 ? '↑' : diff < 0 ? '↓' : '→';
        metricsMsg += `\n⚕️ 체중: ${first}kg → ${last}kg (${arrow}${Math.abs(diff)}kg)`;
    }

    const startDate = thisWeek.length > 0 ? thisWeek[0].date.substring(5).replace('-', '/') : '';
    const endDate = thisWeek.length > 0 ? thisWeek[thisWeek.length - 1].date.substring(5).replace('-', '/') : '';

    let msg = `📊 ${sender}님 주간 리포트`;
    if (startDate) msg += ` (${startDate}~${endDate})`;
    msg += `\n━━━━━━━━━━━━━━━━━\n`;
    msg += `🍽 식단:   ${progressBar(tw.diet)} ${trend(tw.diet, lw.diet)}\n`;
    msg += `🏃 운동:   ${progressBar(tw.exercise)} ${trend(tw.exercise, lw.exercise)}\n`;
    msg += `😴 수면:   ${progressBar(tw.sleep)} ${trend(tw.sleep, lw.sleep)}\n`;
    msg += `📝 감사:   ${progressBar(tw.gratitude)} ${trend(tw.gratitude, lw.gratitude)}\n`;
    msg += `━━━━━━━━━━━━━━━━━`;
    if (metricsMsg) msg += metricsMsg;

    // 코칭 코멘트
    const categories = [
        { name: '식습관', count: tw.diet, emoji: '🍽' },
        { name: '운동', count: tw.exercise, emoji: '🏃' },
        { name: '수면 분석', count: tw.sleep, emoji: '😴' },
        { name: '감사일기', count: tw.gratitude, emoji: '📝' }
    ];

    // 가장 잘한 것 / 가장 부족한 것
    const best = categories.reduce((max, c) => c.count > max.count ? c : max, categories[0]);
    const weakest = categories.reduce((min, c) => c.count < min.count ? c : min, categories[0]);

    msg += `\n\n✨ ${best.emoji} ${best.name} ${best.count}일 — 잘하고 계세요!`;
    if (weakest.count < 3) {
        msg += `\n🎯 ${weakest.emoji} ${weakest.name}이 ${weakest.count}일이에요.`;
        msg += `\n   이번 주 목표: ${weakest.count + 2}일 도전! 💪`;
    }

    return msg;
}

module.exports = { handleWeekly };
