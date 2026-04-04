/**
 * Kakao skill webhook: POST /api/chat
 */

const { Router } = require('express');
const axios = require('axios');

const { buildKakaoResponse, buildKakaoShareCardResponse, buildKakaoConnectCardResponse } = require('../utils/kakaoTemplate');
const { createChatIdentity } = require('../utils/chatIdentity');
const { handleToday } = require('../commands/today');
const { handleMyHabits } = require('../commands/myHabits');
const { handleWeekly } = require('../commands/weekly');
const { handleClassStatus } = require('../commands/classStatus');
const { handleRegister } = require('../commands/register');
const { handleRanking } = require('../commands/ranking');
const { handleDiet, handleExercise, handleMind } = require('../commands/categoryHabits');
const { handleAddFriend, handleMyCode } = require('../commands/addFriend');
const { handleConnect } = require('../commands/connect');
const { handleShare } = require('../commands/share');

const HELP_MSG = `명령어 안내
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

function cmdResponse(text) {
    return {
        version: '2.0',
        template: {
            outputs: [{ simpleText: { text } }],
            quickReplies: [{ label: '내습관 보기', action: 'message', messageText: '!내습관' }]
        }
    };
}

function createKakaoRouter({ db, getChatSession, checkAndLogHabits, isAllowedImageUrl }) {
    const router = Router();

    router.post('/', async (req, res) => {
        const userMessage = req.body.userRequest?.utterance || '';
        const callbackUrl = req.body.userRequest?.callbackUrl;
        const userId = req.body.userRequest?.user?.id || 'kakao_user';
        const userName = req.body.userRequest?.user?.properties?.nickname
            || req.body.action?.params?.sys_plugin_nickname
            || '사용자';

        const user = createChatIdentity({
            platform: 'kakao',
            userId,
            displayName: userName,
            legacySender: userName
        });

        const photo = req.body.contexts?.find((context) => context.name === 'photo')?.params?.url?.value
            || req.body.userRequest?.params?.media?.url;
        const isMedia = Boolean(photo);

        console.log(`--- Incoming Kakao Request: ${userMessage} ---`);
        console.log(`Media detected: ${isMedia ? 'YES' : 'NO'}`);

        if (!isMedia && !userMessage.startsWith('!')) {
            return res.status(200).json({
                version: '2.0',
                template: {
                    outputs: [{
                        simpleText: {
                            text: `해빛코치를 부르려면 메시지 앞에 ! 를 붙여 주세요.\n예: !오늘\n사진이나 동영상을 올리면 바로 분석도 할 수 있어요.`
                        }
                    }]
                }
            });
        }

        const actualQuestion = isMedia
            ? (userMessage || '이 사진 또는 영상을 분석해서 코칭해 주세요.')
            : userMessage.slice(1).trim();

        const promptWithContext = `[현재 대화방 사용자 이름: ${user.displayName}]
이름은 '${user.displayName}'이라고 자연스럽게 불러 주세요.

사용자 메시지: ${actualQuestion}`;

        await checkAndLogHabits(user.userId, actualQuestion);
        const chatSession = getChatSession(`kakao:${user.userId}`);

        if (actualQuestion === '오늘') {
            return res.status(200).json(cmdResponse(await handleToday(user.displayName)));
        }

        if (actualQuestion === '내습관' || actualQuestion === '내기록') {
            return res.status(200).json(cmdResponse(await handleMyHabits(user)));
        }

        if (actualQuestion === '주간' || actualQuestion === '주간리포트') {
            return res.status(200).json(cmdResponse(await handleWeekly(user)));
        }

        if (actualQuestion === '클래스' || actualQuestion === '현황') {
            return res.status(200).json(cmdResponse(await handleClassStatus(user.displayName)));
        }

        if (actualQuestion === '순위' || actualQuestion === '주간순위') {
            return res.status(200).json(cmdResponse(await handleRanking()));
        }

        if (actualQuestion === '식단') {
            return res.status(200).json(cmdResponse(await handleDiet(user, getChatSession)));
        }

        if (actualQuestion === '운동') {
            return res.status(200).json(cmdResponse(await handleExercise(user, getChatSession)));
        }

        if (actualQuestion === '마음') {
            return res.status(200).json(cmdResponse(await handleMind(user, getChatSession)));
        }

        if (actualQuestion === '공유' || actualQuestion === '인증공유') {
            const result = await handleShare(user);
            if (result.type === 'share-card') {
                return res.status(200).json(buildKakaoShareCardResponse(result));
            }
            return res.status(200).json(cmdResponse(result.text));
        }

        if (actualQuestion === '연결') {
            const result = await handleConnect(user);
            if (result.type === 'connect-card') {
                return res.status(200).json(buildKakaoConnectCardResponse(result));
            }
            return res.status(200).json(cmdResponse(result.text));
        }

        if (actualQuestion === '도움말' || actualQuestion === '명령어') {
            return res.status(200).json(cmdResponse(HELP_MSG));
        }

        if (actualQuestion === '등록' || actualQuestion.startsWith('등록 ')) {
            const registrationArg = actualQuestion === '등록' ? '' : actualQuestion.substring('등록 '.length).trim();
            return res.status(200).json(cmdResponse(await handleRegister(user, registrationArg)));
        }

        if (actualQuestion === '내코드') {
            return res.status(200).json(cmdResponse(await handleMyCode(user)));
        }

        if (actualQuestion === '친구' || actualQuestion.startsWith('친구 ')) {
            const codeArg = actualQuestion === '친구' ? '' : actualQuestion.substring('친구 '.length).trim();
            return res.status(200).json(cmdResponse(await handleAddFriend(user, codeArg)));
        }

        if (callbackUrl) {
            res.status(200).json({
                version: '2.0',
                useCallback: true,
                template: {
                    outputs: [{
                        simpleText: {
                            text: isMedia
                                ? '해빛코치가 사진을 분석하고 있어요. 잠시만 기다려 주세요.'
                                : '해빛코치가 답변을 준비하고 있어요. 잠시만 기다려 주세요.'
                        }
                    }]
                }
            });

            (async () => {
                try {
                    const promptParts = [promptWithContext];

                    if (isMedia && isAllowedImageUrl(photo)) {
                        try {
                            const response = await axios.get(photo, {
                                responseType: 'arraybuffer',
                                timeout: 10000,
                                maxContentLength: 20 * 1024 * 1024
                            });

                            promptParts.push({
                                inlineData: {
                                    data: Buffer.from(response.data).toString('base64'),
                                    mimeType: 'image/jpeg'
                                }
                            });
                        } catch (imageError) {
                            console.error('Failed to fetch image:', imageError.message);
                        }
                    }

                    const result = await chatSession.sendMessage(promptParts);
                    const callbackResponse = buildKakaoResponse(result.response.text());
                    await axios.post(callbackUrl, callbackResponse, { timeout: 5000 });
                } catch (error) {
                    console.error('Error in background Kakao processing:', error);
                    try {
                        await axios.post(callbackUrl, {
                            version: '2.0',
                            template: {
                                outputs: [{ simpleText: { text: '죄송해요. 일시적인 오류가 발생했어요. 다시 한 번 물어봐 주세요.' } }]
                            }
                        }, { timeout: 5000 });
                    } catch (_) {
                        // ignore final callback failure
                    }
                }
            })();

            return undefined;
        }

        try {
            const result = await chatSession.sendMessage(promptWithContext);
            return res.status(200).json(buildKakaoResponse(result.response.text()));
        } catch (error) {
            console.error('Error handling Kakao chat request:', error);
            return res.status(200).json({
                version: '2.0',
                template: {
                    outputs: [{ simpleText: { text: '죄송해요. 일시적인 오류가 발생했어요.' } }]
                }
            });
        }
    });

    return router;
}

module.exports = { createKakaoRouter };
