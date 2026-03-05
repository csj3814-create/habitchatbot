const express = require('express');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const port = process.env.PORT || 3000;

// 미들웨어 설정
app.use(express.json());

// Gemini API 초기화
const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = ai.getGenerativeModel({
    model: 'gemini-2.5-flash',
    tools: [
        {
            googleSearch: {},
        },
    ]
});

const SYSTEM_INSTRUCTION = '당신은 해빛스쿨 단톡방 멤버들의 운동 습관을 관리하는 따뜻한 응급의학과 전문의 선생님의 친구입니다. 다정하고 공감 능력이 뛰어나며, 의학 지식을 바탕으로 응원해 주세요. **문체는 반드시 다정한 존댓말(해요체)로 통일하세요.** 실시간 검색 기능을 활용하여 현재 날씨나 미세먼지 농도에 맞는 실질적인 조언을 제공하세요. 반드시 2~3문장 이내로 짧고 간결하게 답변하세요. 카카오톡 모바일 화면에 최적화하여 작성하세요.';

// 메인 페이지 (서버 상태 확인용)
app.get('/', (req, res) => {
    res.send('<h1>해빛스쿨 운동 챗봇 서버가 정상 동작 중입니다!</h1><p>카카오톡 챗봇 설정에서 이 주소를 사용하세요.</p>');
});

// 카카오톡 i 오픈빌더 스킬 엔드포인트
app.post('/api/chat', async (req, res) => {
    const userMessage = req.body.userRequest?.utterance || '';
    const callbackUrl = req.body.userRequest?.callbackUrl;

    console.log(`--- Incoming Request: ${userMessage} ---`);
    console.log(`Callback URL status: ${callbackUrl ? 'PRESENT' : 'ABSENT'}`);

    // 호출 신호(!) 확인
    if (!userMessage.startsWith('!')) {
        return res.status(200).json({
            version: "2.0",
            template: {
                outputs: [
                    {
                        simpleText: {
                            text: "저를 부르시려면 메시지 앞에 '!'를 붙여주세요! (예: !오늘 미세먼지 어때?)"
                        }
                    }
                ]
            }
        });
    }

    // 신호 제거된 실제 질문 추출
    const actualQuestion = userMessage.slice(1).trim();

    // 콜백 URL이 있는 경우: 즉시 응답 후 백그라운드 처리
    if (callbackUrl) {
        // 1. 즉시 응답 (수신 확인용)
        res.status(200).json({
            version: "2.0",
            useCallback: true,
            template: {
                outputs: [{ simpleText: { text: "해빛코치가 고민 중이에요... 잠시만 기다려 주세요! 🏃‍♂️" } }]
            }
        });

        // 2. 백그라운드에서 Gemini 처리 및 콜백 전송
        (async () => {
            try {
                console.log(`Processing background request for: ${actualQuestion}`);
                const result = await model.generateContent(`${SYSTEM_INSTRUCTION}\n\n사용자 메시지: ${actualQuestion}`);
                const aiResponse = result.response.text();

                const callbackResponse = {
                    version: "2.0",
                    template: {
                        outputs: [{ simpleText: { text: aiResponse } }],
                        quickReplies: [
                            { label: "오늘 미세먼지 어때?", action: "message", messageText: "오늘 미세먼지 농도랑 날씨 확인해서 운동 추천해줘" },
                            { label: "운동하기 싫을 때", action: "message", messageText: "오늘 운동하기 너무 싫은데 따뜻한 응원 한마디 해줘" },
                            { label: "무릎 안 좋은데..", action: "message", messageText: "무릎에 무리 안 가면서 할 수 있는 유산소 운동 추천해줘" },
                            { label: "물 얼마나 마셔?", action: "message", messageText: "건강을 위해서 하루에 물을 얼마나 마시는 게 좋을까?" },
                            { label: "해빛코치 활용법", action: "message", messageText: "해빛코치에게 어떤 조언을 구할 수 있는지 알려줘" }
                        ]
                    }
                };

                await axios.post(callbackUrl, callbackResponse);
                console.log('Successfully sent callback response.');
            } catch (err) {
                console.error('Error in background processing:', err);
            }
        })();

        return;
    }

    // 콜백 URL이 없는 경우: 기존 (5초 이내 응답 시도)
    try {
        const result = await model.generateContent(`${SYSTEM_INSTRUCTION}\n\n사용자 메시지: ${actualQuestion}`);
        const aiResponse = result.response.text();

        res.status(200).json({
            version: "2.0",
            template: {
                outputs: [{ simpleText: { text: aiResponse } }],
                quickReplies: [
                    { label: "오늘 미세먼지 어때?", action: "message", messageText: "오늘 미세먼지 농도랑 날씨 확인해서 운동 추천해줘" },
                    { label: "운동하기 싫을 때", action: "message", messageText: "오늘 운동하기 너무 싫은데 따뜻한 응원 한마디 해줘" },
                    { label: "무릎 안 좋은데..", action: "message", messageText: "무릎에 무리 안 가면서 할 수 있는 유산소 운동 추천해줘" },
                    { label: "물 얼마나 마셔?", action: "message", messageText: "건강을 위해서 하루에 물을 얼마나 마시는 게 좋을까?" },
                    { label: "해빛코치 활용법", action: "message", messageText: "해빛코치에게 어떤 조언을 구할 수 있는지 알려줘" }
                ]
            }
        });
    } catch (error) {
        console.error('Error handling chat request:', error);
        res.status(200).json({
            version: "2.0",
            template: { outputs: [{ simpleText: { text: "죄송해요, 잠시 생각에 잠겼나 봐요." } }] }
        });
    }
});

app.listen(port, () => {
    console.log(`Habits School Chatbot Server Runing on http://localhost:${port}`);
    console.log(`Kakao Endpoint: POST http://localhost:${port}/api/chat`);
});
