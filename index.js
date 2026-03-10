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

const SYSTEM_INSTRUCTION = `당신은 '해빛스쿨'의 열정적이고 다정한 1타 종합 습관 코치 '해빛코치'입니다. 항상 밝고 긍정적인 에너지를 뿜어내며, 따뜻한 존댓말(해요체)로 사용자를 격려하고 코칭해 주세요. 사용자들은 당신을 '코치님'이라고 부릅니다.

[전문 코칭 분야 및 대응 가이드]
1. **식단 코칭**: 사용자가 음식 사진이나 식단 텍스트를 올리면 영양 성분을 가볍게 추정하고, "단백질이 조금 부족해보여요! 계란 하나 추가 어때요?" 처럼 현실적이고 다정한 조언을 해주세요.
2. **운동/자세 코칭**: 운동 사진이나 영상이 들어오면 (예: 스쿼트, 런지) 눈바디나 자세를 칭찬방에 온 것처럼 폭풍 칭찬한 뒤, 1~2가지 교정 포인트를 부드럽게 짚어주세요.
3. **목표 분할 (마이크로 해빗)**: 사용자가 "!목표 (달성하고 싶은 내용)" 형식으로 말하면, 절대 당장 하기 힘든 큰 목표를 주지 마세요. "오늘 당장 실천할 수 있는 아주 작고 사소한 첫걸음" 딱 1가지만 미션으로 던져주세요. (예: 아침 6시 기상 -> 알람 10분만 당기고 물 한잔 마시기)
4. **멘탈 케어**: 너무 힘들다, 지친다, 운동하기 싫다는 맥락의 메시지가 오면 무조건 공감부터 해주세요. "오늘 하루 정말 고생 많으셨어요."라고 위로하며, 유튜브에서 들을 만한 ASMR, 명상 음악, 혹은 따뜻한 텍스트 힐링 문구를 추천해 주세요.

[공통 필수 규칙]
- **대화하듯 짧게**: 긴 설명은 금물입니다. 카카오톡 모바일 화면에 맞춰 2~4문장 이내로 짧고 임팩트 있게, 친구와 대화하듯 말해주세요. 이모티콘을 적극 활용하세요.
- **실시간 정보 활용**: 날씨나 미세먼지 정보를 구글 검색 도구로 확인하여 실외 운동이 가능한지 등 실질적인 조언을 상황에 맞게 덧붙여주세요.
- **오운완 반응**: '!오운완' 이라는 단어가 보이면 무조건 오버액션 수준으로 폭풍 칭찬을 해주세요!`;

// 메인 페이지 (서버 상태 확인용)
app.get('/', (req, res) => {
    res.send('<h1>해빛스쿨 운동 챗봇 서버가 정상 동작 중입니다!</h1><p>카카오톡 챗봇 설정에서 이 주소를 사용하세요.</p>');
});

// 카카오톡 i 오픈빌더 스킬 엔드포인트
app.post('/api/chat', async (req, res) => {
    const userMessage = req.body.userRequest?.utterance || '';
    const callbackUrl = req.body.userRequest?.callbackUrl;

    // 미디어(사진, 동영상) 확인
    const photo = req.body.contexts?.find(c => c.name === 'photo')?.params?.url?.value || req.body.userRequest?.params?.media?.url;
    const isMedia = !!photo;

    console.log(`--- Incoming Request: ${userMessage} ---`);
    console.log(`Callback URL status: ${callbackUrl ? 'PRESENT' : 'ABSENT'}`);
    console.log(`Media detected: ${isMedia ? 'YES' : 'NO'}`);

    // 호출 신호(!) 확인 (미디어가 없을 때만 적용)
    if (!isMedia && !userMessage.startsWith('!')) {
        return res.status(200).json({
            version: "2.0",
            template: {
                outputs: [
                    {
                        simpleText: {
                            text: "저를 부르시려면 메시지 앞에 '!'를 붙여주세요! (예: !오늘 미세먼지 어때?)\n하지만 사진이나 동영상을 올리시면 제가 바로 달려가서 도와드릴게요! 📸"
                        }
                    }
                ]
            }
        });
    }

    // 신호 제거된 실제 질문 추출 (텍스트인 경우)
    const actualQuestion = isMedia ? (userMessage || "이 사진/동영상을 분석해서 코칭해줘") : userMessage.slice(1).trim();

    // 콜백 URL이 있는 경우: 즉시 응답 후 백그라운드 처리
    if (callbackUrl) {
        // 1. 즉시 응답 (수신 확인용)
        res.status(200).json({
            version: "2.0",
            useCallback: true,
            template: {
                outputs: [{ simpleText: { text: isMedia ? "해빛코치가 사진을 꼼꼼히 분석하고 있어요... 🧐" : "해빛코치가 고민 중이에요... 잠시만 기다려 주세요! 🏃‍♂️" } }]
            }
        });

        // 2. 백그라운드에서 Gemini 처리 및 콜백 전송
        (async () => {
            try {
                console.log(`Processing background request for: ${actualQuestion}`);

                let promptParts = [`${SYSTEM_INSTRUCTION}\n\n사용자 메시지: ${actualQuestion}`];

                // 이미지가 있는 경우 멀티모달 처리
                if (isMedia) {
                    try {
                        const response = await axios.get(photo, { responseType: 'arraybuffer' });
                        const imageData = Buffer.from(response.data).toString('base64');
                        promptParts.push({
                            inlineData: {
                                data: imageData,
                                mimeType: "image/jpeg" // 카카오톡은 보통 jpeg/png이나 Gemini는 둘 다 잘 처리함
                            }
                        });
                        console.log('Image data included in prompt.');
                    } catch (imgErr) {
                        console.error('Failed to fetch image:', imgErr);
                    }
                }

                const result = await model.generateContent(promptParts);
                const aiResponse = result.response.text();

                const callbackResponse = {
                    version: "2.0",
                    template: {
                        outputs: [{ simpleText: { text: aiResponse } }],
                        quickReplies: [
                            { label: "오늘 미세먼지 어때?", action: "message", messageText: "!오늘 미세먼지 농도랑 날씨 확인해서 운동 추천해줘" },
                            { label: "운동하기 싫을 때", action: "message", messageText: "!오늘 운동하기 너무 싫은데 따뜻한 응원 한마디 해줘" },
                            { label: "무릎 안 좋은데..", action: "message", messageText: "!무릎에 무리 안 가면서 할 수 있는 유산소 운동 추천해줘" },
                            { label: "물 얼마나 마셔?", action: "message", messageText: "!건강을 위해서 하루에 물을 얼마나 마시는 게 좋을까?" },
                            { label: "해빛코치 활용법", action: "message", messageText: "!해빛코치에게 어떤 조언을 구할 수 있는지 알려줘" }
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
                    { label: "오늘 미세먼지 어때?", action: "message", messageText: "!오늘 미세먼지 농도랑 날씨 확인해서 운동 추천해줘" },
                    { label: "운동하기 싫을 때", action: "message", messageText: "!오늘 운동하기 너무 싫은데 따뜻한 응원 한마디 해줘" },
                    { label: "무릎 안 좋은데..", action: "message", messageText: "!무릎에 무리 안 가면서 할 수 있는 유산소 운동 추천해줘" },
                    { label: "물 얼마나 마셔?", action: "message", messageText: "!건강을 위해서 하루에 물을 얼마나 마시는 게 좋을까?" },
                    { label: "해빛코치 활용법", action: "message", messageText: "!해빛코치에게 어떤 조언을 구할 수 있는지 알려줘" }
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

app.post('/api/messengerbot', async (req, res) => {
    const { room, msg, sender, isGroupChat } = req.body;

    if (!msg) {
        return res.status(400).json({ error: "메시지가 없습니다." });
    }

    console.log(`[MessengerBot R] Room: ${room}, Sender: ${sender}, Message: ${msg}`);

    try {
        // 기존 Gemini 호출 로직 재사용
        const result = await model.generateContent(`${SYSTEM_INSTRUCTION}\n\n사용자 메시지: ${msg}`);
        const aiResponse = result.response.text();

        // 메신저봇R이 렌더링하기 쉬운 단순 JSON 반환
        res.status(200).json({ reply: aiResponse });
    } catch (error) {
        console.error('Error handling MessengerBot request:', error);
        res.status(500).json({ reply: "죄송해요, 잠시 생각에 잠겼나 봐요. (서버 에러)" });
    }
});

// Render 무료 티어의 경우 15분간 외부 요청이 없으면 서버가 절전 모드로 들어갑니다.
// 서버가 잠들지 않도록 14분(840,000ms)마다 스스로를 호출하는 Self-ping 로직
const RENDER_URL = "https://habitchatbot.onrender.com"; // Render에서 할당받은 실제 주소
setInterval(() => {
    axios.get(RENDER_URL)
        .then(() => console.log(`[Self-Ping] Server kept awake at ${new Date().toISOString()}`))
        .catch(err => console.error('[Self-Ping] Error:', err.message));
}, 14 * 60 * 1000); // 14분 주기

app.listen(port, () => {
    console.log(`Habits School Chatbot Server Runing on http://localhost:${port}`);
    console.log(`Kakao Endpoint: POST http://localhost:${port}/api/chat`);
    console.log(`MessengerBot R Endpoint: POST http://localhost:${port}/api/messengerbot`);
});
