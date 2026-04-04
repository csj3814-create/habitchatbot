/**
 * !식단 / !운동 / !마음 명령 요약과 짧은 AI 코칭
 */

const { getUserRecords } = require('../modules/appFirebase');
const { getMapping, getDisplayName, buildIdentityKey } = require('../modules/userMapping');
const {
    hasDiet,
    hasExercise,
    hasSleep,
    hasGratitude,
    hasMeditation,
    progressBar
} = require('../modules/statsHelpers');

function notRegistered(user) {
    return `${getDisplayName(user)}님은 아직 해빛스쿨 계정이 연결되어 있지 않아요.\n앱 프로필에서 연결 코드를 만든 뒤 !등록 ABCD1234 로 먼저 연결해 주세요.`;
}

async function getAiCoaching(getChatSession, sessionKey, prompt) {
    try {
        const session = getChatSession(sessionKey);
        const result = await session.sendMessage(prompt);
        return result.response.text().trim().slice(0, 180);
    } catch (error) {
        console.warn('[CategoryHabits] AI coaching failed:', error.message);
        return null;
    }
}

async function handleDiet(user, getChatSession = null) {
    const displayName = getDisplayName(user);
    const mapping = await getMapping(user);
    if (!mapping) return notRegistered(user);

    let records;
    try {
        records = await getUserRecords(mapping.googleUid, 7);
    } catch (error) {
        return `오류: ${error.message}`;
    }

    if (records.length === 0) {
        return `${displayName}님은 아직 식단 기록이 없어요.\n해빛스쿨 앱에서 식단을 기록한 뒤 다시 확인해 보세요.`;
    }

    const dietDays = records.filter(hasDiet).length;
    const latest = [...records].reverse().find(record => record.diet) || records[records.length - 1];
    const meals = [];
    if (latest.diet?.breakfastUrl) meals.push('아침');
    if (latest.diet?.lunchUrl) meals.push('점심');
    if (latest.diet?.dinnerUrl) meals.push('저녁');
    if (latest.diet?.snackUrl) meals.push('간식');

    let msg = `${displayName}님의 식단 현황\n────────\n`;
    msg += `기록: ${progressBar(dietDays)}\n`;
    msg += `마지막 기록: ${latest.date}\n`;
    msg += `식사: ${meals.length > 0 ? meals.join(', ') : '없음'}\n`;

    if (getChatSession) {
        const lines = records.filter(hasDiet).map(record => {
            const mealNames = [];
            if (record.diet?.breakfastUrl) mealNames.push('아침');
            if (record.diet?.lunchUrl) mealNames.push('점심');
            if (record.diet?.dinnerUrl) mealNames.push('저녁');
            if (record.diet?.snackUrl) mealNames.push('간식');
            return `${record.date}: ${mealNames.join(', ')}`;
        });

        const coaching = await getAiCoaching(
            getChatSession,
            `diet:${buildIdentityKey(user)}`,
            `${displayName}의 최근 식단 기록:\n${lines.join('\n')}\n\n식단 코칭을 두 문장 이내로 해 주세요.`
        );

        if (coaching) {
            msg += `\n해빛코치: ${coaching}`;
        }
    }

    return msg;
}

async function handleExercise(user, getChatSession = null) {
    const displayName = getDisplayName(user);
    const mapping = await getMapping(user);
    if (!mapping) return notRegistered(user);

    let records;
    try {
        records = await getUserRecords(mapping.googleUid, 7);
    } catch (error) {
        return `오류: ${error.message}`;
    }

    if (records.length === 0) {
        return `${displayName}님은 아직 운동 기록이 없어요.\n해빛스쿨 앱에서 운동을 기록한 뒤 다시 확인해 보세요.`;
    }

    const exerciseDays = records.filter(hasExercise).length;
    const latest = [...records].reverse().find(record => record.exercise);

    let msg = `${displayName}님의 운동 현황\n────────\n`;
    msg += `기록: ${progressBar(exerciseDays)}\n`;

    if (latest?.exercise) {
        msg += `마지막 기록: ${latest.date}\n`;

        if (latest.exercise.cardioList?.length > 0) {
            msg += `유산소: ${latest.exercise.cardioList.length}개\n`;
        }

        if (latest.exercise.strengthList?.length > 0) {
            msg += `근력: ${latest.exercise.strengthList.length}개\n`;
        }

        if (latest.exercise.totalDuration) {
            msg += `총 운동 시간: ${latest.exercise.totalDuration}분\n`;
        }
    }

    if (getChatSession) {
        const lines = records.filter(hasExercise).map(record => {
            const parts = [];
            if (record.exercise?.cardioList?.length) parts.push(`유산소 ${record.exercise.cardioList.length}개`);
            if (record.exercise?.strengthList?.length) parts.push(`근력 ${record.exercise.strengthList.length}개`);
            return `${record.date}: ${parts.join(', ')}`;
        });

        const coaching = await getAiCoaching(
            getChatSession,
            `exercise:${buildIdentityKey(user)}`,
            `${displayName}의 최근 운동 기록:\n${lines.join('\n')}\n\n운동 코칭을 두 문장 이내로 해 주세요.`
        );

        if (coaching) {
            msg += `\n해빛코치: ${coaching}`;
        }
    }

    return msg;
}

async function handleMind(user, getChatSession = null) {
    const displayName = getDisplayName(user);
    const mapping = await getMapping(user);
    if (!mapping) return notRegistered(user);

    let records;
    try {
        records = await getUserRecords(mapping.googleUid, 7);
    } catch (error) {
        return `오류: ${error.message}`;
    }

    if (records.length === 0) {
        return `${displayName}님은 아직 마음 기록이 없어요.\n해빛스쿨 앱에서 수면이나 감사 기록을 남긴 뒤 다시 확인해 보세요.`;
    }

    const sleepDays = records.filter(hasSleep).length;
    const gratitudeDays = records.filter(hasGratitude).length;
    const meditationDays = records.filter(hasMeditation).length;
    const latest = records[records.length - 1];

    let msg = `${displayName}님의 마음 현황\n────────\n`;
    msg += `수면: ${progressBar(sleepDays)}\n`;
    msg += `감사: ${progressBar(gratitudeDays)}\n`;
    if (meditationDays > 0) {
        msg += `명상: ${progressBar(meditationDays)}\n`;
    }

    if (latest.sleepAndMind) {
        msg += `마지막 기록: ${latest.date}\n`;
        if (latest.sleepAndMind.sleepAnalysis?.sleepDuration || latest.sleepAndMind.sleepAnalysis?.totalSleep) {
            msg += `수면 시간: ${latest.sleepAndMind.sleepAnalysis.sleepDuration || latest.sleepAndMind.sleepAnalysis.totalSleep}\n`;
        }
        if (latest.sleepAndMind.gratitude) {
            msg += `감사 기록 있음\n`;
        }
        if (latest.sleepAndMind.meditationDone) {
            msg += `명상 완료\n`;
        }
    }

    if (getChatSession) {
        const lines = records
            .filter(record => record.sleepAndMind)
            .map(record => {
                const parts = [];
                if (record.sleepAndMind?.sleepAnalysis?.sleepDuration || record.sleepAndMind?.sleepAnalysis?.totalSleep) {
                    parts.push(`수면 ${record.sleepAndMind.sleepAnalysis.sleepDuration || record.sleepAndMind.sleepAnalysis.totalSleep}`);
                }
                if (record.sleepAndMind?.gratitude) parts.push('감사');
                if (record.sleepAndMind?.meditationDone) parts.push('명상');
                return `${record.date}: ${parts.join(', ')}`;
            });

        const coaching = await getAiCoaching(
            getChatSession,
            `mind:${buildIdentityKey(user)}`,
            `${displayName}의 최근 마음 기록:\n${lines.join('\n')}\n\n마음 건강 코칭을 두 문장 이내로 해 주세요.`
        );

        if (coaching) {
            msg += `\n해빛코치: ${coaching}`;
        }
    }

    return msg;
}

module.exports = { handleDiet, handleExercise, handleMind };
