/**
 * routes/kakao.js
 * 카카오 오픈빌더 → POST /api/chat
 */

const { Router } = require('express');
const axios = require('axios');
const { buildKakaoResponse } = require('../utils/kakaoTemplate');
const { handleToday } = require('../commands/today');
const { handleMyHabits } = require('../commands/myHabits');
const { handleWeekly } = require('../commands/weekly');
const { handleClassStatus } = require('../commands/classStatus');
const { handleRegister } = require('../commands/register');
const { handleRanking } = require('../commands/ranking');

const HELP_MSG = `명령어 안내
!오늘 - 전체 기록 현황
!내습관 - 내 기록 보기
!주간 - 주간 트렌드
!우리반 - 기수 현황
!랭킹 - 이번 주 리더보드
!등록 이메일 - 앱 연결
!오운완 - 운동 인증
!목표 - 마이크로 해빛

그 외 자유롭게 질문하세요!`;

function cmdResponse(text) {
    return {
        version: "2.0",
        template: {
            outputs: [{ simpleText: { text } }],
            quickReplies: [{ label: "내 인증 기록 보기", action: "message", messageText: "!내습관" }]
        }
    };
}

/**
 * @param {{ db, getChatSession, checkAndLogHabits, isAllowedImageUrl }} deps
 */
function createKakaoRouter({ db, getChatSession, checkAndLogHabits, isAllowedImageUrl }) {
    const router = Router();

    router.post('/', async (req, res) => {
        const userMessage = req.body.userRequest?.utterance || '';
        const callbackUrl = req.body.userRequest?.callbackUrl;
        const userId = req.body.userRequest?.user?.id || 'kakao_user';
        const userName = req.body.userRequest?.user?.properties?.nickname ||
                         req.body.action?.params?.sys_plugin_nickname ||
                         '회원';

        const photo = req.body.contexts?.find(c => c.name === 'photo')?.params?.url?.value ||
                      req.body.userRequest?.params?.media?.url;
        const isMedia = !!photo;

        console.log(`--- Incoming Request: ${userMessage} ---`);
        console.log(`Media detected: ${isMedia ? 'YES' : 'NO'}`);

        // ! 없이 텍스트 전송 시 안내
        if (!isMedia && !userMessage.startsWith('!')) {
            return res.status(200).json({
                version: "2.0",
                template: {
                    outputs: [{
                        simpleText: {
                            text: `저를 부르시려면 메시지 앞에 '!'를 붙여주세요! (예: !오늘 미세먼지 어때?)\n하지만 사진이나 동영상을 올리시면 제가 바로 달려가서 도와드릴게요! 📸`
                        }
                    }]
                }
            });
        }

        const actualQuestion = isMedia
            ? (userMessage || "이 사진/동영상을 분석해서 코칭해줘")
            : userMessage.slice(1).trim();

        const promptWithContext = `[현재 대화중인 사용자 이름: ${userName}님]\n이름을 부를 때 반드시 '${userName}님' 이라고 다정하게 불러주세요.\n\n사용자 메시지: ${actualQuestion}`;

        await checkAndLogHabits(userId, actualQuestion);
        const chatSession = getChatSession(userId);

        // ===== 명령어 라우팅 =====
        if (actualQuestion === '오늘')
            return res.status(200).json(cmdResponse(await handleToday(userName)));

        if (actualQuestion === '내습관' || actualQuestion === '내 습관')
            return res.status(200).json(cmdResponse(await handleMyHabits(userName)));

        if (actualQuestion === '주간' || actualQuestion === '주간리포트')
            return res.status(200).json(cmdResponse(await handleWeekly(userName)));

        if (actualQuestion === '우리반' || actualQuestion === '현황')
            return res.status(200).json(cmdResponse(await handleClassStatus(userName)));

        if (actualQuestion === '랭킹' || actualQuestion === '순위')
            return res.status(200).json(cmdResponse(await handleRanking()));

        if (actualQuestion === '도움말' || actualQuestion === '도움' || actualQuestion === '명령어')
            return res.status(200).json(cmdResponse(HELP_MSG));

        if (actualQuestion === '내기록' || actualQuestion === '내 기록') {
            try {
                const snapshot = await db.ref(`users/${userId}/records`).once('value');
                const data = snapshot.val();
                const recordMsg = data
                    ? `${userName}님! 현재까지 총 ${Object.keys(data).length}번의 멋진 인증 기록이 있네요! 꾸준히 쌓아가는 모습이 아름답습니다 👏`
                    : `${userName}님, 아직 습관 기록이 없네요! 지금 당장 물 한 잔 마시고 '!물 1잔' 이라고 쳐보세요 💧`;
                return res.status(200).json(cmdResponse(recordMsg));
            } catch (e) {
                console.error('DB 조회 에러:', e);
            }
        }

        if (actualQuestion === '등록' || actualQuestion.startsWith('등록 ')) {
            const emailArg = actualQuestion === '등록' ? '' : actualQuestion.substring('등록 '.length).trim();
            return res.status(200).json(cmdResponse(await handleRegister(userName, emailArg)));
        }

        // 콜백 URL이 있는 경우: 즉시 응답 후 백그라운드 처리
        if (callbackUrl) {
            res.status(200).json({
                version: "2.0",
                useCallback: true,
                template: {
                    outputs: [{
                        simpleText: {
                            text: isMedia
                                ? "해빛코치가 사진을 꼼꼼히 분석하고 있어요... 🧐"
                                : "해빛코치가 고민 중이에요... 잠시만 기다려 주세요! 🏃‍♂️"
                        }
                    }]
                }
            });

            (async () => {
                try {
                    let promptParts = [promptWithContext];

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
                                    mimeType: "image/jpeg"
                                }
                            });
                        } catch (imgErr) {
                            console.error('Failed to fetch image:', imgErr.message);
                        }
                    } else if (isMedia) {
                        console.warn(`[SSRF] 허용되지 않은 이미지 URL 차단: ${photo}`);
                    }

                    const result = await chatSession.sendMessage(promptParts);
                    const callbackResponse = buildKakaoResponse(result.response.text());

                    try {
                        await axios.post(callbackUrl, callbackResponse, { timeout: 5000 });
                    } catch (cbErr) {
                        console.warn('[Callback] 1차 전송 실패, 재시도:', cbErr.message);
                        try { await axios.post(callbackUrl, callbackResponse, { timeout: 5000 }); }
                        catch (retryErr) { console.error('[Callback] 재시도 실패:', retryErr.message); }
                    }
                } catch (err) {
                    console.error('Error in background processing:', err);
                    try {
                        await axios.post(callbackUrl, {
                            version: "2.0",
                            template: { outputs: [{ simpleText: { text: "죄송해요, 잠시 생각에 잠겼나 봐요. 다시 물어봐 주세요! 🙏" } }] }
                        }, { timeout: 5000 });
                    } catch (_) { /* 최종 실패 — 무시 */ }
                }
            })();

            return;
        }

        // 콜백 URL 없는 경우: 동기 처리
        try {
            const result = await chatSession.sendMessage(promptWithContext);
            res.status(200).json(buildKakaoResponse(result.response.text()));
        } catch (error) {
            console.error('Error handling chat request:', error);
            res.status(200).json({
                version: "2.0",
                template: { outputs: [{ simpleText: { text: "죄송해요, 잠시 생각에 잠겼나 봐요." } }] }
            });
        }
    });

    return router;
}

module.exports = { createKakaoRouter };
