/**
 * routes/messengerbot.js
 * 메신저봇R (Android) → POST /api/messengerbot
 */

const { Router } = require('express');
const { handleToday } = require('../commands/today');
const { handleMyHabits } = require('../commands/myHabits');
const { handleWeekly } = require('../commands/weekly');
const { handleClassStatus } = require('../commands/classStatus');
const { handleRegister } = require('../commands/register');
const { handleRanking } = require('../commands/ranking');
const { handleDiet, handleExercise, handleMind } = require('../commands/categoryHabits');
const { getUserRecords } = require('../modules/appFirebase');
const { getMapping } = require('../modules/userMapping');
const { hasDiet, hasExercise, hasMind } = require('../modules/statsHelpers');

const HELP_MSG = `📋 명령어 안내
!오늘 — 전체 기록 현황
!내습관 — 내 기록 보기
!식단 — 식단 현황 + AI 분석
!운동 — 운동 현황 + AI 분석
!마음 — 마음습관 현황 + AI 분석
!주간 — 주간 트렌드
!우리반 — 기수 현황
!랭킹 — 이번 주 리더보드 🏆
!등록 이메일 — 앱 연결

그 외 자유롭게 질문하세요! 😊`;

/**
 * @param {{ db, getChatSession, checkAndLogHabits }} deps
 */
function createMessengerbotRouter({ db, getChatSession, checkAndLogHabits }) {
    const router = Router();

    router.post('/', async (req, res) => {
        const { room, msg, sender } = req.body;

        if (!msg) {
            return res.status(400).json({ error: "메시지가 없습니다." });
        }

        console.log(`[MessengerBot R] Room: ${room}, Sender: ${sender}, Message: ${msg}`);

        try {
            const command = msg.trim().toLowerCase();
            const commandArgs = msg.trim().substring(msg.trim().indexOf(' ') + 1).trim();

            if (command === '오늘')
                return res.json({ reply: await handleToday(sender) });

            if (command === '내습관' || command === '내 습관')
                return res.json({ reply: await handleMyHabits(sender) });

            if (command === '주간' || command === '주간리포트')
                return res.json({ reply: await handleWeekly(sender) });

            if (command === '우리반' || command === '현황')
                return res.json({ reply: await handleClassStatus(sender) });

            if (command === '등록' || command.startsWith('등록 ')) {
                const emailArg = command === '등록' ? '' : commandArgs;
                return res.json({ reply: await handleRegister(sender, emailArg) });
            }

            if (command === '내기록' || command === '내 기록') {
                const snapshot = await db.ref(`users/${sender}/records`).once('value');
                const data = snapshot.val();
                const recordMsg = data
                    ? `${sender}님! 현재까지 총 ${Object.keys(data).length}번 기록하셨어요! 👏`
                    : `${sender}님, 아직 기록이 없네요! 당장 실천해볼까요?`;
                return res.json({ reply: recordMsg });
            }

            if (command === '도움말' || command === '도움' || command === '명령어')
                return res.json({ reply: HELP_MSG });

            if (command === '랭킹' || command === '순위')
                return res.json({ reply: await handleRanking() });

            if (command === '식단')
                return res.json({ reply: await handleDiet(sender, getChatSession) });

            if (command === '운동')
                return res.json({ reply: await handleExercise(sender, getChatSession) });

            if (command === '마음')
                return res.json({ reply: await handleMind(sender, getChatSession) });

            // ===== 일반 AI 대화 =====
            await checkAndLogHabits(sender, msg);
            const chatSession = getChatSession(sender);

            // 등록 유저 앱 데이터 프롬프트 주입
            let appDataContext = '';
            try {
                const mapping = await getMapping(sender);
                if (mapping) {
                    const recentRecords = await getUserRecords(mapping.googleUid, 3);
                    if (recentRecords.length > 0) {
                        const latest = recentRecords[recentRecords.length - 1];
                        const parts = [];

                        if (latest.diet) {
                            const meals = ['breakfastUrl', 'lunchUrl', 'dinnerUrl', 'snackUrl']
                                .filter(k => latest.diet[k])
                                .map(k => ({ breakfastUrl: '아침', lunchUrl: '점심', dinnerUrl: '저녁', snackUrl: '간식' }[k]));
                            if (meals.length) parts.push(`식단: ${meals.join(',')} 기록됨`);
                        }
                        if (latest.exercise) {
                            const ex = [];
                            if (latest.exercise.cardioList?.length)   ex.push(`유산소 ${latest.exercise.cardioList.length}건`);
                            if (latest.exercise.strengthList?.length) ex.push(`근력 ${latest.exercise.strengthList.length}건`);
                            if (ex.length) parts.push(`운동: ${ex.join(', ')}`);
                        }
                        if (latest.sleepAndMind) {
                            const mind = [];
                            if (latest.sleepAndMind.sleepImageUrl)  mind.push('수면분석');
                            if (latest.sleepAndMind.meditationDone) mind.push('명상');
                            if (latest.sleepAndMind.gratitude)      mind.push('감사일기');
                            if (mind.length) parts.push(`마음: ${mind.join(', ')}`);
                        }
                        if (latest.metrics?.weight)  parts.push(`체중: ${latest.metrics.weight}kg`);
                        if (latest.metrics?.glucose) parts.push(`혈당: ${latest.metrics.glucose}`);

                        const dietDays = recentRecords.filter(hasDiet).length;
                        const exDays   = recentRecords.filter(hasExercise).length;
                        const mindDays = recentRecords.filter(hasMind).length;

                        if (parts.length) {
                            appDataContext = `\n\n[이 사용자의 해빛스쿨 앱 최근 기록]\n마지막 기록일: ${latest.date}\n${parts.join('\n')}\n최근 3일 기록: 식단 ${dietDays}일, 운동 ${exDays}일, 마음 ${mindDays}일\n\n이 데이터를 참고하여 부족한 영역을 부드럽게 독려해주세요.`;
                        }
                    }
                }
            } catch (e) {
                console.warn('[AppData] 앱 데이터 주입 스킵:', e.message);
            }

            const prompt = `[현재 대화중인 사용자 이름: ${sender}님]\n이름을 부를 때 반드시 '${sender}님' 이라고 다정하게 불러주세요.${appDataContext}\n\n사용자 메시지: ${msg}`;
            const result = await chatSession.sendMessage(prompt);
            res.json({ reply: result.response.text() });

        } catch (error) {
            console.error('Error handling MessengerBot request:', error);
            res.status(500).json({ reply: "죄송해요, 잠시 생각에 잠겼나 봐요. (서버 에러)" });
        }
    });

    return router;
}

module.exports = { createMessengerbotRouter };
