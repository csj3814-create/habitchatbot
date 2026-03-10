const express = require('express');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const port = process.env.PORT || 3000;

// 미들웨어 설정
app.use(express.json());

const SYSTEM_INSTRUCTION = `당신은 '해빛스쿨'의 열정적이고 다정한 1타 종합 습관 코치 '해빛코치'입니다. 항상 밝고 긍정적인 에너지를 뿜어내며, 따뜻한 존댓말(해요체)로 사용자를 격려하고 코칭해 주세요. 사용자들은 당신을 '코치님'이라고 부릅니다.

[전문 코칭 분야 및 대응 가이드]
1. **식단 코칭**: 사용자가 음식 사진이나 식단 텍스트를 올리면 영양 성분을 가볍게 추정하고, "단백질이 조금 부족해보여요! 계란 하나 추가 어때요?" 처럼 현실적이고 다정한 조언을 해주세요.
2. **운동/자세 코칭**: 운동 사진이나 영상이 들어오면 (예: 스쿼트, 런지) 눈바디나 자세를 칭찬방에 온 것처럼 폭풍 칭찬한 뒤, 1~2가지 교정 포인트를 부드럽게 짚어주세요.
3. **목표 분할 (마이크로 해빗)**: 사용자가 "!목표 (달성하고 싶은 내용)" 형식으로 말하면, 절대 당장 하기 힘든 큰 목표를 주지 마세요. "오늘 당장 실천할 수 있는 아주 작고 사소한 첫걸음" 딱 1가지만 미션으로 던져주세요. (예: 아침 6시 기상 -> 알람 10분만 당기고 물 한잔 마시기)
4. **멘탈/휴식/영상 추천**: 운동 영상, ASMR, 명상 등 **유튜브 영상 추천을 요청받으면 반드시 실제 재생 가능한 유튜브 링크(https://www.youtube.com/watch?v=...) 전체 URL 주소를 답변 텍스트 안에 그대로 포함시켜야 합니다.** (마크다운 하이퍼링크 문법 사용 금지, 순수 URL 텍스트만 출력할 것)

[공통 필수 규칙]
- **대화하듯 짧게**: 긴 설명은 금물입니다. 카카오톡 모바일 화면에 맞춰 2~4문장 이내로 짧고 임팩트 있게, 친구와 대화하듯 말해주세요. 이모티콘을 적극 활용하세요.
- **실시간 정보 활용**: 날씨나 미세먼지 정보를 구글 검색 도구로 확인하여 실외 운동이 가능한지 등 실질적인 조언을 상황에 맞게 덧붙여주세요.
- **오운완 반응**: '!오운완' 이라는 단어가 보이면 무조건 오버액션 수준으로 폭풍 칭찬을 해주세요!`;

// Gemini API 초기화
const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = ai.getGenerativeModel({
    model: 'gemini-2.5-flash',
    tools: [
        { googleSearch: {} },
    ],
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] }
});

// Firebase Realtime DB 연동
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://habitchatbot-default-rtdb.firebaseio.com" // 에러 발생시 asia-southeast1 등으로 조정 필요
});
const db = admin.database();

// 사용자 대화 세션 임시 저장소 (메모리)
const userSessions = new Map();

function getChatSession(userId) {
    if (!userSessions.has(userId)) {
        const chatSession = model.startChat({
            history: [
                { role: "user", parts: [{ text: "안녕 코치님!" }] },
                { role: "model", parts: [{ text: "안녕하세요! 뭐든지 편하게 물어보세요." }] }
            ]
        });
        userSessions.set(userId, chatSession);
        
        // 메모리 관리를 위해 2시간 후 세션 삭제
        setTimeout(() => {
            userSessions.delete(userId);
        }, 1000 * 60 * 60 * 2);
    }
    return userSessions.get(userId);
}

// 기록 감지 및 Firebase 저장 로직
async function logHabit(userId, habitType, keyword) {
    try {
        const ref = db.ref(`users/${userId}/records/${Date.now()}`);
        await ref.set({ habitType, keyword, timestamp: new Date().toISOString() });
        console.log(`[DB 저장 완료] ${userId} - ${habitType}`);
    } catch (e) {
        console.error('Firebase DB Error:', e.message);
    }
}

async function checkAndLogHabits(userId, msg) {
    if (msg.includes('물') && msg.includes('잔')) await logHabit(userId, 'water', '물 마시기');
    else if (msg.includes('스쿼트')) await logHabit(userId, 'exercise', '스쿼트');
    else if (msg.includes('오운완')) await logHabit(userId, 'exercise', '오운완');
    else if (msg.includes('식단') || msg.includes('먹었어')) await logHabit(userId, 'diet', '식단/식사');
}

// 메인 페이지 (서버 상태 확인용)
app.get('/', (req, res) => {
    res.send('<h1>해빛스쿨 운동 챗봇 서버가 정상 동작 중입니다!</h1><p>카카오톡 챗봇 설정에서 이 주소를 사용하세요.</p>');
});

// 카카오톡 i 오픈빌더 스킬 엔드포인트
// 카카오톡 i 오픈빌더 스킬 엔드포인트
app.post('/api/chat', async (req, res) => {
    const userMessage = req.body.userRequest?.utterance || '';
    const callbackUrl = req.body.userRequest?.callbackUrl;
    const userId = req.body.userRequest?.user?.id || 'kakao_user';
    
    // 오픈빌더에서 넘어오는 사용자 이름 속성 확인 (플러그인/설정에 따라 다름)
    const userName = req.body.userRequest?.user?.properties?.nickname || 
                     req.body.action?.params?.sys_plugin_nickname || 
                     '회원';

    // 미디어(사진, 동영상) 확인
    const photo = req.body.contexts?.find(c => c.name === 'photo')?.params?.url?.value || req.body.userRequest?.params?.media?.url;
    const isMedia = !!photo;

    console.log(`--- Incoming Request: ${userMessage} ---`);
    console.log(`Media detected: ${isMedia ? 'YES' : 'NO'}`);

    // 호출 신호(!) 확인 (미디어가 없을 때만 적용)
    if (!isMedia && !userMessage.startsWith('!')) {
        return res.status(200).json({
            version: "2.0",
            template: {
                outputs: [
                    {
                        simpleText: {
                            text: `저를 부르시려면 메시지 앞에 '!'를 붙여주세요! (예: !오늘 미세먼지 어때?)\n하지만 사진이나 동영상을 올리시면 제가 바로 달려가서 도와드릴게요! 📸`
                        }
                    }
                ]
            }
        });
    }

    // 신호 제거된 실제 질문 추출 (텍스트인 경우)
    const actualQuestion = isMedia ? (userMessage || "이 사진/동영상을 분석해서 코칭해줘") : userMessage.slice(1).trim();
    
    // AI 모델에게 지시할 때 사용자 이름 덮어쓰기
    const promptWithContext = `[현재 대화중인 사용자 이름: ${userName}님]\n이름을 부를 때 반드시 '${userName}님' 이라고 다정하게 불러주세요.\n\n사용자 메시지: ${actualQuestion}`;

    // 개인 기록 추가 및 대화 세션 가져오기
    await checkAndLogHabits(userId, actualQuestion);
    const chatSession = getChatSession(userId);

    // 개인 기록 조회 명령어 (DB 연동)
    if (actualQuestion === "내기록" || actualQuestion === "내 기록") {
        try {
            const recordsRef = db.ref(`users/${userId}/records`);
            const snapshot = await recordsRef.once('value');
            const data = snapshot.val();
            let recordMsg = `${userName}님, 아직 습관 기록이 없네요! 지금 당장 물 한 잔 마시고 '!물 1잔' 이라고 쳐보세요 💧`;
            
            if (data) {
                const count = Object.keys(data).length;
                recordMsg = `${userName}님! 현재까지 총 ${count}번의 멋진 인증 기록이 있네요! 꾸준히 쌓아가는 모습이 아름답습니다 👏`;
            }
            return res.status(200).json({
                version: "2.0",
                template: { 
                    outputs: [{ simpleText: { text: recordMsg } }],
                    quickReplies: [{ label: "채팅으로 돌아가기", action: "message", messageText: "!오늘 운동 추천해줘" }]
                }
            });
        } catch(e) { console.error('DB 조회 에러:', e); }
    }

    // 카카오 템플릿 변환 헬퍼 함수
    function buildKakaoResponse(text) {
        // 정규식으로 유튜브 비디오 ID를 더 확실하게 추출 (다양한 형태 지원)
        const youtubeRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/g;
        const videoIds = [];
        let match;
        
        // 텍스트에서 비디오 ID 모두 추출
        while ((match = youtubeRegex.exec(text)) !== null) {
            videoIds.push(match[1]);
        }
        
        // 링크 본문을 텍스트에서 깔끔하게 제거
        const cleanText = text.replace(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)\/[^\s]+/g, '').trim() || "추천 영상을 확인해 보세요!";

        const quickReplies = [
            { label: "내 인증 기록 보기 🏆", action: "message", messageText: "!내기록" }
        ];

        // 유튜브 링크가 있는 경우 -> BasicCard 템플릿 사용
        if (videoIds.length > 0) {
            const videoId = videoIds[0];
            const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
            const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

            return {
                version: "2.0",
                template: {
                    outputs: [
                        { simpleText: { text: cleanText } }, // 위에 설명 텍스트 먼저 말하고
                        {
                            basicCard: { // 아래에 예쁜 영상 카드 첨부
                                title: "💪 코치님의 추천 영상",
                                description: "아래 버튼을 눌러 바로 시청해보세요!",
                                thumbnail: { imageUrl: thumbnailUrl },
                                buttons: [{ action: "webLink", label: "영상 보러가기 ▶️", webLinkUrl: videoUrl }]
                            }
                        }
                    ],
                    quickReplies: quickReplies
                }
            };
        } 
        
        // 링크가 없으면 일반 텍스트 템플릿
        return {
            version: "2.0",
            template: {
                outputs: [{ simpleText: { text: text } }],
                quickReplies: quickReplies
            }
        };
    }

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
                let promptParts = [promptWithContext];

                // 이미지가 있는 경우 멀티모달 처리
                if (isMedia) {
                    try {
                        const response = await axios.get(photo, { responseType: 'arraybuffer' });
                        const imageData = Buffer.from(response.data).toString('base64');
                        promptParts.push({
                            inlineData: { data: imageData, mimeType: "image/jpeg" }
                        });
                    } catch (imgErr) {
                        console.error('Failed to fetch image:', imgErr);
                    }
                }

                const result = await chatSession.sendMessage(promptParts);
                const aiResponse = result.response.text();

                // 새로 만든 템플릿 변환 함수 사용
                const callbackResponse = buildKakaoResponse(aiResponse);
                await axios.post(callbackUrl, callbackResponse);
            } catch (err) {
                console.error('Error in background processing:', err);
            }
        })();

        return;
    }

    // 콜백 URL이 없는 경우
    try {
        const result = await chatSession.sendMessage(promptWithContext);
        const aiResponse = result.response.text();
        
        // 새로 만든 템플릿 변환 함수 사용
        res.status(200).json(buildKakaoResponse(aiResponse));
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
        // AI 모델에게 지시할 때 사용자 이름(sender) 덮어쓰기
        const promptWithContext = `[현재 대화중인 사용자 이름: ${sender}님]\n이름을 부를 때 반드시 '${sender}님' 이라고 다정하게 불러주세요.\n\n사용자 메시지: ${msg}`;

        // 기록 탐지 및 메모리 맵 사용
        await checkAndLogHabits(sender, msg);
        const chatSession = getChatSession(sender);
        
        // !내기록 명령어 처리
        if (msg === "내기록" || msg === "내 기록") {
            const snapshot = await db.ref(`users/${sender}/records`).once('value');
            const data = snapshot.val();
            let recordMsg = `${sender}님, 아직 기록이 없네요! 당장 실천해볼까요?`;
            if (data) recordMsg = `${sender}님! 현재까지 총 ${Object.keys(data).length}번 기록하셨어요! 👏`;
            return res.status(200).json({ reply: recordMsg });
        }

        const result = await chatSession.sendMessage(promptWithContext);
        const aiResponse = result.response.text();

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
