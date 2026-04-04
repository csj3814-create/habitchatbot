/**
 * MessengerBot webhook: POST /api/messengerbot
 */

const { Router } = require('express');

const { apiKeyAuth } = require('../utils/apiKeyAuth');
const { createChatIdentity } = require('../utils/chatIdentity');
const { handleToday } = require('../commands/today');
const { handleMyHabits } = require('../commands/myHabits');
const { handleWeekly } = require('../commands/weekly');
const { handleClassStatus } = require('../commands/classStatus');
const { handleRegister } = require('../commands/register');
const { handleRanking } = require('../commands/ranking');
const { handleGuide, handleApp } = require('../commands/guide');
const { handleDiet, handleExercise, handleMind } = require('../commands/categoryHabits');
const { handleAddFriend, handleMyCode } = require('../commands/addFriend');
const { handleConnect } = require('../commands/connect');
const { handleShare } = require('../commands/share');
const { getUserRecords } = require('../modules/appFirebase');
const { getMapping, getDisplayName } = require('../modules/userMapping');
const { hasDiet, hasExercise, hasMind } = require('../modules/statsHelpers');

const HELP_MSG = `명령어 안내
!안내 - 시작 가이드
!앱 - 앱 열기
!오늘 - 전체 기록 요약
!내습관 - 내 기록 보기
!식단 - 식단 현황 + AI 코칭
!운동 - 운동 현황 + AI 코칭
!마음 - 마음 현황 + AI 코칭
!주간 - 주간 리포트
!클래스 - 전체 현황
!순위 - 이번 주 리더보드
!연결 - 앱에서 계정 연결 마무리
!등록 코드 - 앱 계정 연결
!내코드 - 내 친구 코드 확인
!친구 코드 - 친구 요청
!공유 - 내 최신 인증 카드 공유

그 외에는 자유롭게 질문해도 괜찮아요.`;

function normalizeCommand(rawMessage) {
    const trimmed = String(rawMessage || '').trim();
    const body = trimmed.startsWith('!') ? trimmed.slice(1).trim() : trimmed;
    const command = body.toLowerCase();
    const args = body.includes(' ') ? body.slice(body.indexOf(' ') + 1).trim() : '';

    return { trimmed, command, args };
}

function formatShareReply(result) {
    if (result.type !== 'share-card') {
        return result.text;
    }

    return `공유 카드를 만들었어요.\n${result.description}\n\n이미지: ${result.imageUrl}\n앱에서 보기: ${result.webLinkUrl}`;
}

function formatConnectReply(result) {
    if (result.type !== 'connect-card') {
        return result.text;
    }

    return `${result.description}\n\n연결 열기: ${result.webLinkUrl}`;
}

function createMessengerbotRouter({ db, getChatSession, checkAndLogHabits }) {
    const router = Router();

    router.post('/', apiKeyAuth, async (req, res) => {
        const { room, msg, sender } = req.body;

        if (!msg) {
            return res.status(400).json({ error: '메시지가 없습니다.' });
        }

        const user = createChatIdentity({
            platform: 'messengerbot',
            userId: sender,
            displayName: sender,
            legacySender: sender,
            room
        });

        console.log(`[MessengerBot] Room: ${room}, Sender: ${sender}, Message: ${msg}`);

        try {
            const { command, args, trimmed } = normalizeCommand(msg);

            if (command === '오늘') {
                return res.json({ reply: await handleToday(getDisplayName(user)) });
            }

            if (command === '내습관' || command === '내기록') {
                return res.json({ reply: await handleMyHabits(user) });
            }

            if (command === '주간' || command === '주간리포트') {
                return res.json({ reply: await handleWeekly(user) });
            }

            if (command === '클래스' || command === '현황') {
                return res.json({ reply: await handleClassStatus(getDisplayName(user)) });
            }

            if (command === '등록' || command.startsWith('등록 ')) {
                const registrationArg = command === '등록' ? '' : args;
                return res.json({ reply: await handleRegister(user, registrationArg) });
            }

            if (command === '내코드') {
                return res.json({ reply: await handleMyCode(user) });
            }

            if (command === '친구' || command.startsWith('친구 ')) {
                const codeArg = command === '친구' ? '' : args;
                return res.json({ reply: await handleAddFriend(user, codeArg) });
            }

            if (command === '연결') {
                return res.json({ reply: formatConnectReply(await handleConnect(user)) });
            }

            if (command === '공유' || command === '인증공유') {
                return res.json({ reply: formatShareReply(await handleShare(user)) });
            }

            if (command === '안내' || command === '시작' || command === '가이드') {
                return res.json({ reply: await handleGuide(getDisplayName(user)) });
            }

            if (command === '앱') {
                return res.json({ reply: await handleApp() });
            }

            if (command === '도움말' || command === '명령어') {
                return res.json({ reply: HELP_MSG });
            }

            if (command === '순위' || command === '주간순위') {
                return res.json({ reply: await handleRanking() });
            }

            if (command === '식단') {
                return res.json({ reply: await handleDiet(user, getChatSession) });
            }

            if (command === '운동') {
                return res.json({ reply: await handleExercise(user, getChatSession) });
            }

            if (command === '마음') {
                return res.json({ reply: await handleMind(user, getChatSession) });
            }

            if (command === '기록수') {
                const snapshot = await db.ref(`users/messengerbot:${sender}/records`).once('value');
                const data = snapshot.val();
                const recordMsg = data
                    ? `${sender}님은 지금까지 총 ${Object.keys(data).length}번 기록했어요.`
                    : `${sender}님은 아직 자동 기록이 없어요.`;
                return res.json({ reply: recordMsg });
            }

            await checkAndLogHabits(`messengerbot:${sender}`, trimmed);
            const chatSession = getChatSession(`messengerbot:${sender}`);

            let appDataContext = '';

            try {
                const mapping = await getMapping(user);
                if (!mapping) {
                    appDataContext = '\n\n[아직 해빛스쿨 앱 계정 연결이 없습니다. 자연스럽게 !등록 안내를 해 주세요.]';
                } else {
                    const recentRecords = await getUserRecords(mapping.googleUid, 3);
                    if (recentRecords.length > 0) {
                        const latest = recentRecords[recentRecords.length - 1];
                        const parts = [];

                        if (latest.diet) {
                            const meals = ['breakfastUrl', 'lunchUrl', 'dinnerUrl', 'snackUrl']
                                .filter((key) => latest.diet[key])
                                .map((key) => ({
                                    breakfastUrl: '아침',
                                    lunchUrl: '점심',
                                    dinnerUrl: '저녁',
                                    snackUrl: '간식'
                                }[key]));

                            if (meals.length > 0) parts.push(`식단: ${meals.join(', ')}`);
                        }

                        if (latest.exercise) {
                            const exercise = [];
                            if (latest.exercise.cardioList?.length) exercise.push(`유산소 ${latest.exercise.cardioList.length}개`);
                            if (latest.exercise.strengthList?.length) exercise.push(`근력 ${latest.exercise.strengthList.length}개`);
                            if (exercise.length > 0) parts.push(`운동: ${exercise.join(', ')}`);
                        }

                        if (latest.sleepAndMind) {
                            const mind = [];
                            if (latest.sleepAndMind.sleepImageUrl) mind.push('수면');
                            if (latest.sleepAndMind.meditationDone) mind.push('명상');
                            if (latest.sleepAndMind.gratitudeJournal || latest.sleepAndMind.gratitude) mind.push('감사');
                            if (mind.length > 0) parts.push(`마음: ${mind.join(', ')}`);
                        }

                        if (latest.metrics?.weight) parts.push(`체중: ${latest.metrics.weight}kg`);
                        if (latest.metrics?.glucose) parts.push(`혈당: ${latest.metrics.glucose}`);

                        const dietDays = recentRecords.filter(hasDiet).length;
                        const exerciseDays = recentRecords.filter(hasExercise).length;
                        const mindDays = recentRecords.filter(hasMind).length;

                        if (parts.length > 0) {
                            appDataContext = `\n\n[최근 앱 기록]
마지막 기록일: ${latest.date}
${parts.join('\n')}
최근 3일 기록: 식단 ${dietDays}일 / 운동 ${exerciseDays}일 / 마음 ${mindDays}일`;
                        }
                    }
                }
            } catch (error) {
                console.warn('[MessengerBot] Failed to inject app data context:', error.message);
            }

            const prompt = `[현재 대화방 사용자 이름: ${getDisplayName(user)}]
이름은 '${getDisplayName(user)}'이라고 자연스럽게 불러 주세요.${appDataContext}

사용자 메시지: ${trimmed}`;

            const result = await chatSession.sendMessage(prompt);
            return res.json({ reply: result.response.text() });
        } catch (error) {
            console.error('Error handling MessengerBot request:', error);
            return res.status(500).json({ reply: '죄송해요. 일시적인 오류가 발생했어요.' });
        }
    });

    return router;
}

module.exports = { createMessengerbotRouter };
