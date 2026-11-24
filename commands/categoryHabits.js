/**
 * !식단 / !운동 / !마음 명령 요약과 짧은 AI 코칭
 */

const { getUserRecords } = require('../modules/appFirebase');
const { getMapping, getDisplayName, buildIdentityKey } = require('../modules/userMapping');
const { buildUnlinkedMessage } = require('../modules/chatLink');
const { sanitizeModelText } = require('../utils/gemini');
const {
    countDietPhotos,
    summarizeDayDiet,
    summarizePeriodDiet,
    formatFailedChecks
} = require('../modules/dietGrades');
const {
    hasDiet,
    hasExercise,
    hasSleep,
    hasGratitude,
    hasMeditation,
    progressBar
} = require('../modules/statsHelpers');

function notRegistered(user) {
    return buildUnlinkedMessage(user);
}

async function getAiCoaching(getChatSession, sessionKey, prompt) {
    try {
        const session = getChatSession(sessionKey);
        const result = await session.sendMessage(prompt);
        return sanitizeModelText(result.response.text()).slice(0, 180);
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
    const photos = countDietPhotos(latest);
    const day = summarizeDayDiet(latest);
    const week = summarizePeriodDiet(records);

    let msg = `${displayName}님의 식단 현황\n────────\n`;
    msg += `기록: ${progressBar(dietDays)}\n`;
    msg += `마지막 기록: ${latest.date}\n`;
    msg += `식사 사진: ${photos > 0 ? `${photos}장` : '없음'}\n`;
    // 앱 식단 분석의 등급(체크 5개, S~F). 분석하지 않은 사진만 있으면 등급 줄을 내지 않는다.
    if (day) {
        msg += `식단 등급: ${day.grade} (${day.meals}끼)\n`;
        msg += `${formatFailedChecks(day.failed)}\n`;
    }
    if (week && week.meals > (day?.meals || 0)) {
        msg += `최근 7일 평균: ${week.grade} (${week.meals}끼)\n`;
    }

    if (getChatSession) {
        const lines = records.filter(hasDiet).map(record => {
            const parts = [`사진 ${countDietPhotos(record)}장`];
            const summary = summarizeDayDiet(record);
            if (summary) {
                parts.push(`등급 ${summary.grade}`);
                if (summary.failed.length > 0) parts.push(formatFailedChecks(summary.failed));
            }
            return `${record.date}: ${parts.join(', ')}`;
        });

        const coaching = await getAiCoaching(
            getChatSession,
            `diet:${buildIdentityKey(user)}`,
            `${displayName}의 최근 식단 기록(등급은 앱의 체크 5개 기준: 채소·단백질·초가공·탄수화물·나트륨, 5개 통과 S ~ 0개 F):\n${lines.join('\n')}\n\n식단 코칭을 두 문장 이내로 해 주세요.`
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
