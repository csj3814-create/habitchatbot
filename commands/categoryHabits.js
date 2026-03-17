/**
 * commands/categoryHabits.js
 * !식단 / !운동 / !마음 — 카테고리별 상세 현황 + AI 코칭 한마디
 *
 * getChatSession이 있으면 AI 코칭을 추가하고, 없으면 데이터 요약만 반환
 */

const { getUserRecords } = require('../modules/appFirebase');
const { getMapping } = require('../modules/userMapping');
const {
    hasDiet, hasExercise, hasSleep, hasGratitude, hasMeditation, progressBar
} = require('../modules/statsHelpers');

function notRegistered(sender) {
    return `${sender}님, 아직 해빛스쿨 앱 계정이 연결되지 않았어요!\n!등록 your@gmail.com 으로 먼저 연결해주세요 🔗`;
}

/**
 * AI 코칭 한마디 생성
 * 별도 세션 키를 사용해 메인 대화 히스토리에 영향 없음
 */
async function getAiCoaching(getChatSession, sessionKey, prompt) {
    try {
        const session = getChatSession(sessionKey);
        const result = await session.sendMessage(prompt);
        const text = result.response.text().trim();
        // 2문장 이내로 자름 (문장 끝 기준)
        const endings = ['요.', '요!', '요?', '다.', '다!', '다?'];
        let cut = -1;
        for (const e of endings) {
            const idx = text.lastIndexOf(e, 160);
            if (idx > 20 && idx > cut) cut = idx + e.length;
        }
        return cut > 20 ? text.substring(0, cut) : text.substring(0, 160).trimEnd();
    } catch (e) {
        console.warn('[CategoryHabits] AI 코칭 실패:', e.message);
        return null;
    }
}

// ────────────────────────────────────────────────────────────────
// !식단
// ────────────────────────────────────────────────────────────────
async function handleDiet(sender, getChatSession = null) {
    const mapping = await getMapping(sender);
    if (!mapping) return notRegistered(sender);

    let records;
    try {
        records = await getUserRecords(mapping.googleUid, 7);
    } catch (e) {
        return `⚠️ ${e.message}`;
    }

    if (records.length === 0)
        return `${sender}님, 아직 앱에 식단 기록이 없어요!\n해빛스쿨 앱에서 오늘 식단부터 기록해보세요 🍽`;

    const dietDays = records.filter(hasDiet).length;
    const latest = [...records].reverse().find(r => r.diet) || records[records.length - 1];

    let msg = `🍽 ${sender}님 식단 현황 (최근 7일)\n`;
    msg += `━━━━━━━━━━━━━━━\n`;
    msg += `기록: ${progressBar(dietDays)}\n\n`;
    msg += `마지막 기록 (${latest.date})\n`;

    if (latest.diet) {
        const mealLabels = { breakfastUrl: '아침', lunchUrl: '점심', dinnerUrl: '저녁', snackUrl: '간식' };
        const meals = Object.entries(mealLabels)
            .filter(([k]) => latest.diet[k])
            .map(([, label]) => label);
        msg += `식사: ${meals.length > 0 ? meals.join(' | ') : '기록 없음'}\n`;
    }

    // 저장된 AI 칼로리 분석 결과 표시
    if (latest.dietAnalysis) {
        const mealKeys = ['breakfast', 'lunch', 'dinner', 'snack'];
        const mealKorean = { breakfast: '아침', lunch: '점심', dinner: '저녁', snack: '간식' };
        let totalCal = 0, totalProtein = 0, totalCarbs = 0, totalFat = 0;
        const calParts = [];

        for (const key of mealKeys) {
            const a = latest.dietAnalysis[key];
            if (!a) continue;
            if (a.totalCalories) {
                const cal = Number(a.totalCalories);
                totalCal += cal;
                calParts.push(`${mealKorean[key]} ${cal}kcal`);
            }
            if (a.nutrients) {
                totalProtein += Number(a.nutrients.protein) || 0;
                totalCarbs   += Number(a.nutrients.carbs)   || Number(a.nutrients.carbohydrates) || 0;
                totalFat     += Number(a.nutrients.fat)     || 0;
            }
        }

        if (totalCal > 0) {
            msg += `칼로리: 총 ${Math.round(totalCal)}kcal`;
            if (calParts.length > 1) msg += ` (${calParts.join(', ')})`;
            msg += '\n';
        }
        if (totalProtein > 0)
            msg += `단백질 ${Math.round(totalProtein)}g | 탄수 ${Math.round(totalCarbs)}g | 지방 ${Math.round(totalFat)}g\n`;
    }

    // AI 코칭
    if (getChatSession) {
        const lines = records.filter(hasDiet).map(r => {
            let cal = '';
            if (r.dietAnalysis) {
                let t = 0;
                ['breakfast','lunch','dinner','snack'].forEach(k => {
                    if (r.dietAnalysis[k]?.totalCalories) t += Number(r.dietAnalysis[k].totalCalories);
                });
                if (t > 0) cal = ` ${Math.round(t)}kcal`;
            }
            const meals = [];
            if (r.diet.breakfastUrl) meals.push('아침');
            if (r.diet.lunchUrl)     meals.push('점심');
            if (r.diet.dinnerUrl)    meals.push('저녁');
            if (r.diet.snackUrl)     meals.push('간식');
            return `${r.date}: ${meals.join('+')}${cal}`;
        });

        const prompt = `${sender}님의 최근 식단 기록:\n${lines.join('\n')}\n\n위 데이터를 보고 1-2문장으로 짧게 식단 코칭을 해주세요. 마크다운 사용 금지.`;
        const coaching = await getAiCoaching(getChatSession, `diet_coach_${sender}`, prompt);
        if (coaching) {
            msg += `━━━━━━━━━━━━━━━\n`;
            msg += `해빛코치: ${coaching}`;
        }
    }

    return msg;
}

// ────────────────────────────────────────────────────────────────
// !운동
// ────────────────────────────────────────────────────────────────
async function handleExercise(sender, getChatSession = null) {
    const mapping = await getMapping(sender);
    if (!mapping) return notRegistered(sender);

    let records;
    try {
        records = await getUserRecords(mapping.googleUid, 7);
    } catch (e) {
        return `⚠️ ${e.message}`;
    }

    if (records.length === 0)
        return `${sender}님, 아직 앱에 운동 기록이 없어요!\n해빛스쿨 앱에서 첫 운동을 기록해보세요 🏃`;

    const exerciseDays = records.filter(hasExercise).length;
    const latest = [...records].reverse().find(r => r.exercise);

    let msg = `🏃 ${sender}님 운동 현황 (최근 7일)\n`;
    msg += `━━━━━━━━━━━━━━━\n`;
    msg += `기록: ${progressBar(exerciseDays)}\n\n`;

    if (latest?.exercise) {
        msg += `마지막 기록 (${latest.date})\n`;

        if (latest.exercise.cardioList?.length > 0) {
            const items = latest.exercise.cardioList.map(c => {
                const name = c.type || c.name || '유산소';
                const detail = [c.duration && `${c.duration}분`, c.distance && `${c.distance}km`]
                    .filter(Boolean).join(' ');
                return detail ? `${name} ${detail}` : name;
            });
            msg += `유산소: ${items.join(', ')}\n`;
        }

        if (latest.exercise.strengthList?.length > 0) {
            const items = latest.exercise.strengthList.map(s => {
                const name = s.type || s.name || '근력';
                const sets = s.sets ? `${s.sets}세트` : '';
                const reps = s.reps ? `${s.reps}회` : '';
                const detail = [sets, reps].filter(Boolean).join('×');
                return detail ? `${name} ${detail}` : name;
            });
            msg += `근력: ${items.join(', ')}\n`;
        }

        if (latest.exercise.totalDuration)
            msg += `총 운동시간: ${latest.exercise.totalDuration}분\n`;

        if (latest.exercise.caloriesBurned)
            msg += `소모 칼로리: ${latest.exercise.caloriesBurned}kcal\n`;
    }

    // AI 코칭
    if (getChatSession) {
        const lines = records.filter(hasExercise).map(r => {
            const parts = [];
            r.exercise.cardioList?.forEach(c => {
                const name = c.type || c.name || '유산소';
                const dur = c.duration ? `${c.duration}분` : '';
                parts.push(dur ? `${name}${dur}` : name);
            });
            r.exercise.strengthList?.forEach(s => {
                const name = s.type || s.name || '근력';
                parts.push(name);
            });
            return `${r.date}: ${parts.join(', ')}`;
        });

        const prompt = `${sender}님의 최근 운동 기록:\n${lines.join('\n')}\n\n위 데이터를 보고 1-2문장으로 짧게 운동 코칭을 해주세요. 마크다운 사용 금지.`;
        const coaching = await getAiCoaching(getChatSession, `exercise_coach_${sender}`, prompt);
        if (coaching) {
            msg += `━━━━━━━━━━━━━━━\n`;
            msg += `해빛코치: ${coaching}`;
        }
    }

    return msg;
}

// ────────────────────────────────────────────────────────────────
// !마음
// ────────────────────────────────────────────────────────────────
async function handleMind(sender, getChatSession = null) {
    const mapping = await getMapping(sender);
    if (!mapping) return notRegistered(sender);

    let records;
    try {
        records = await getUserRecords(mapping.googleUid, 7);
    } catch (e) {
        return `⚠️ ${e.message}`;
    }

    if (records.length === 0)
        return `${sender}님, 아직 앱에 마음습관 기록이 없어요!\n해빛스쿨 앱에서 감사일기부터 써보세요 📝`;

    const sleepDays     = records.filter(hasSleep).length;
    const meditDays     = records.filter(hasMeditation).length;
    const gratitudeDays = records.filter(hasGratitude).length;
    const latest = records[records.length - 1];

    let msg = `😴 ${sender}님 마음습관 현황 (최근 7일)\n`;
    msg += `━━━━━━━━━━━━━━━\n`;
    msg += `수면분석: ${progressBar(sleepDays)}\n`;
    msg += `감사일기: ${progressBar(gratitudeDays)}\n`;
    if (meditDays > 0) msg += `명상:     ${progressBar(meditDays)}\n`;
    msg += '\n';

    if (latest.sleepAndMind) {
        const sm = latest.sleepAndMind;
        msg += `마지막 기록 (${latest.date})\n`;

        if (sm.sleepAnalysis) {
            const dur = sm.sleepAnalysis.sleepDuration || sm.sleepAnalysis.totalSleep;
            if (dur) msg += `수면: ${dur}\n`;
            if (sm.sleepAnalysis.sleepQuality) msg += `수면 질: ${sm.sleepAnalysis.sleepQuality}\n`;
            if (sm.sleepAnalysis.deepSleepRatio) msg += `깊은 수면: ${sm.sleepAnalysis.deepSleepRatio}\n`;
        } else if (sm.sleepImageUrl) {
            msg += `수면 분석 기록됨\n`;
        }

        if (sm.meditationDone) {
            const mins = sm.meditationMinutes ? `${sm.meditationMinutes}분` : '완료';
            msg += `명상: ${mins}\n`;
        }

        if (sm.gratitude) {
            const text = sm.gratitude.length > 40
                ? sm.gratitude.substring(0, 40) + '...'
                : sm.gratitude;
            msg += `감사일기: "${text}"\n`;
        }
    }

    // AI 코칭
    if (getChatSession) {
        const lines = records
            .filter(r => r.sleepAndMind)
            .map(r => {
                const sm = r.sleepAndMind;
                const parts = [];
                const dur = sm.sleepAnalysis?.sleepDuration || sm.sleepAnalysis?.totalSleep;
                if (dur) parts.push(`수면 ${dur}`);
                else if (sm.sleepImageUrl) parts.push('수면 기록됨');
                if (sm.meditationDone) parts.push('명상 완료');
                if (sm.gratitude) parts.push(`감사일기: "${sm.gratitude.substring(0, 20)}"`);
                return parts.length ? `${r.date}: ${parts.join(' | ')}` : null;
            })
            .filter(Boolean);

        const prompt = `${sender}님의 최근 마음습관 기록:\n${lines.join('\n')}\n\n위 데이터를 보고 1-2문장으로 짧게 마음건강 코칭을 해주세요. 마크다운 사용 금지.`;
        const coaching = await getAiCoaching(getChatSession, `mind_coach_${sender}`, prompt);
        if (coaching) {
            msg += `━━━━━━━━━━━━━━━\n`;
            msg += `해빛코치: ${coaching}`;
        }
    }

    return msg;
}

module.exports = { handleDiet, handleExercise, handleMind };
