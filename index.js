require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const rateLimit = require('express-rate-limit');
const config = require('./config');

// 환경변수 검증
if (!process.env.GEMINI_API_KEY) {
    console.error('[FATAL] GEMINI_API_KEY 환경변수가 설정되지 않았습니다. .env 파일을 확인하세요.');
    process.exit(1);
}

// 명령어 핸들러
const { handleToday } = require('./commands/today');
const { handleMyHabits } = require('./commands/myHabits');
const { handleWeekly } = require('./commands/weekly');
const { handleClassStatus } = require('./commands/classStatus');
const { handleRegister } = require('./commands/register');

// 앱 연동 모듈
const { getUserRecords } = require('./modules/appFirebase');
const { getMapping } = require('./modules/userMapping');

const app = express();
const port = config.PORT;

// 미들웨어 설정
app.use(express.json());

// Rate Limiting — API 엔드포인트 보호
const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: config.RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: { version: "2.0", template: { outputs: [{ simpleText: { text: "요청이 너무 많아요. 잠시 후 다시 시도해주세요! 🙏" } }] } }
});
app.use('/api/', apiLimiter);

const SYSTEM_INSTRUCTION = `당신은 '해빛스쿨'의 열정적이고 다정한 1타 종합 습관 코치 '해빛코치'입니다. 항상 밝고 긍정적인 에너지를 뿜어내며, 따뜻한 존댓말(해요체)로 사용자를 격려하고 코칭해 주세요. 사용자들은 당신을 '코치님'이라고 부릅니다.

[전문 코칭 분야 및 대응 가이드]
1. **식단 코칭**: 사용자가 음식 사진이나 식단 텍스트를 올리면 영양 성분을 가볍게 추정하고, "단백질이 조금 부족해보여요! 계란 하나 추가 어때요?" 처럼 현실적이고 다정한 조언을 해주세요.
2. **운동/자세 코칭**: 운동 사진이나 영상이 들어오면 (예: 스쿼트, 런지) 눈바디나 자세를 칭찬방에 온 것처럼 폭풍 칭찬한 뒤, 1~2가지 교정 포인트를 부드럽게 짚어주세요.
3. **목표 분할 (마이크로 해빗)**: 사용자가 "!목표 (달성하고 싶은 내용)" 형식으로 말하면, 절대 당장 하기 힘든 큰 목표를 주지 마세요. "오늘 당장 실천할 수 있는 아주 작고 사소한 첫걸음" 딱 1가지만 미션으로 던져주세요. (예: 아침 6시 기상 -> 알람 10분만 당기고 물 한잔 마시기)
4. **멘탈/휴식/영상 추천**: 운동 영상, ASMR, 명상 등 유튜브 영상 추천을 요청받으면, **반드시 아래의 [검증된 유튜브 링크 목록] 중에서 사용자의 상황에 가장 잘 맞는 영상 1개를 골라서 해당 URL 전체(https://www.youtube.com/watch?v=...)를 그대로 답변 텍스트에 노출하세요.** (목록에 없는 영상이나 가짜 URL을 임의로 지어내면 절대 안 됩니다!)
5. **마음습관 코칭**: 사용자가 감정이나 마음 상태를 이야기하면 충분히 공감해주고, 상황에 맞게 감사일기 작성, 명상, 호흡 운동, 충분한 수면 등을 부드럽게 권유하세요. "오늘 감사한 일 하나만 떠올려볼까요?" 같은 가벼운 접근이 좋아요.
6. **대사건강 인사이트**: 사용자의 앱 기록 데이터(식단, 운동, 수면, 감사일기)가 프롬프트에 포함되어 있다면, 그 데이터를 적극 활용해서 구체적이고 개인화된 코칭을 해주세요. 부족한 영역은 부드럽게 독려하고, 잘하고 있는 부분은 칭찬해주세요. 만성 대사질환(당뇨, 고혈압, 비만) 예방과 연결지어 습관의 중요성을 자연스럽게 강조하세요.

[검증된 유튜브 링크 목록]
- 초보자 10분 전신 유산소: https://www.youtube.com/watch?v=swRNeYw1JkY (빅씨스 전신운동)
- 전신 스트레칭/피로회복: https://www.youtube.com/watch?v=s1X9XpAEn00 (강하나 하체/전신 스트레칭)
- 코어 복근 운동: https://www.youtube.com/watch?v=PjGcOP-IYeA (땅끄부부 11자 복근)
- 요가 및 명상 (멘탈 케어): https://www.youtube.com/watch?v=KzE_y01EwO0 (에일린 요가)
- 하체 근력 (스쿼트/런지): https://www.youtube.com/watch?v=tzN6ypk6Sps (심으뜸 스쿼트)

[공통 필수 규칙]
- **대화하듯 짧게**: 긴 설명은 금물입니다. 카카오톡 모바일 화면에 맞춰 2~4문장 이내로 짧고 임팩트 있게, 친구와 대화하듯 말해주세요. 이모티콘을 적극 활용하세요.
- **실시간 정보 활용**: 날씨나 미세먼지 정보를 구글 검색 도구로 확인하여 실외 운동이 가능한지 등 실질적인 조언을 상황에 맞게 덧붙여주세요.
- **오운완 반응**: '!오운완' 이라는 단어가 보이면 무조건 오버액션 수준으로 폭풍 칭찬을 해주세요!
- **앱 기록 독려**: 대화 중 자연스럽게 해빛스쿨 앱에 습관을 기록하도록 유도하세요. "해빛스쿨 앱에 오늘 식단 기록하셨나요?" 같은 멘트를 가끔 넣어주세요.`;

// Gemini API 초기화
const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = ai.getGenerativeModel({
    model: config.GEMINI_MODEL,
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
  databaseURL: config.FIREBASE_DB_URL
});
const db = admin.database();

// Photo URL 검증 (SSRF 방지)
const ALLOWED_IMAGE_HOSTS = ['k.kakaocdn.net', 'mud-kage.kakao.com', 'dn-m.talk.kakao.com', 'img1.kakaocdn.net', 'firebasestorage.googleapis.com'];
function isAllowedImageUrl(url) {
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'https:' && ALLOWED_IMAGE_HOSTS.some(host => parsed.hostname === host || parsed.hostname.endsWith('.' + host));
    } catch { return false; }
}

// 사용자 대화 세션 임시 저장소 (메모리)
const sessionTimers = new Map();
const userSessions = new Map();

const SESSION_TTL = config.SESSION_TTL_MS;

function getChatSession(userId) {
    if (!userSessions.has(userId)) {
        const chatSession = model.startChat({
            history: [
                { role: "user", parts: [{ text: "안녕 코치님!" }] },
                { role: "model", parts: [{ text: "안녕하세요! 뭐든지 편하게 물어보세요." }] }
            ]
        });
        userSessions.set(userId, chatSession);
    }

    // 기존 타이머 정리 후 재설정 (타이머 누적 방지)
    if (sessionTimers.has(userId)) clearTimeout(sessionTimers.get(userId));
    sessionTimers.set(userId, setTimeout(() => {
        userSessions.delete(userId);
        sessionTimers.delete(userId);
    }, SESSION_TTL));

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
    // 운동 관련
    if (msg.includes('오운완')) await logHabit(userId, 'exercise', '오운완');
    else if (msg.includes('스쿼트')) await logHabit(userId, 'exercise', '스쿼트');
    else if (msg.includes('런지')) await logHabit(userId, 'exercise', '런지');
    else if (msg.includes('플랭크')) await logHabit(userId, 'exercise', '플랭크');
    else if (msg.includes('조깅') || msg.includes('러닝') || msg.includes('달리기')) await logHabit(userId, 'exercise', '달리기');
    else if (msg.includes('산책') || msg.includes('걸었') || msg.includes('걸음')) await logHabit(userId, 'exercise', '산책');
    else if (msg.includes('스트레칭')) await logHabit(userId, 'exercise', '스트레칭');
    else if (msg.includes('운동')) await logHabit(userId, 'exercise', '운동');
    // 식단 관련
    else if (msg.includes('식단') || msg.includes('먹었어') || msg.includes('밥 먹') || msg.includes('식사')) await logHabit(userId, 'diet', '식단/식사');
    else if (msg.includes('물') && msg.includes('잔')) await logHabit(userId, 'water', '물 마시기');
    // 마음습관 관련
    else if (msg.includes('감사') || msg.includes('감사일기')) await logHabit(userId, 'mind', '감사일기');
    else if (msg.includes('명상') || msg.includes('마음챙김') || msg.includes('호흡')) await logHabit(userId, 'mind', '명상/마음챙김');
    else if (msg.includes('수면') || msg.includes('잠') || msg.includes('잤어')) await logHabit(userId, 'mind', '수면');
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
        const youtubeRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/g;
        const videoIds = [];
        let match;
        
        // 텍스트에서 비디오 ID 모두 추출
        while ((match = youtubeRegex.exec(text)) !== null) {
            videoIds.push(match[1]);
        }
        
        // 링크 본문을 텍스트에서 깔끔하게 제거
        const cleanText = text.replace(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)[a-zA-Z0-9_-]{11}[^\s]*/g, '').trim() || "추천 영상을 확인해 보세요!";

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

                // 이미지가 있는 경우 멀티모달 처리 (URL 검증 후)
                if (isMedia && isAllowedImageUrl(photo)) {
                    try {
                        const response = await axios.get(photo, { responseType: 'arraybuffer', timeout: 10000, maxContentLength: 20 * 1024 * 1024 });
                        const imageData = Buffer.from(response.data).toString('base64');
                        promptParts.push({
                            inlineData: { data: imageData, mimeType: "image/jpeg" }
                        });
                    } catch (imgErr) {
                        console.error('Failed to fetch image:', imgErr.message);
                    }
                } else if (isMedia) {
                    console.warn(`[SSRF] 허용되지 않은 이미지 URL 차단: ${photo}`);
                }

                const result = await chatSession.sendMessage(promptParts);
                const aiResponse = result.response.text();

                // 새로 만든 템플릿 변환 함수 사용
                const callbackResponse = buildKakaoResponse(aiResponse);
                try {
                    await axios.post(callbackUrl, callbackResponse, { timeout: 5000 });
                } catch (cbErr) {
                    console.warn('[Callback] 1차 전송 실패, 재시도:', cbErr.message);
                    try { await axios.post(callbackUrl, callbackResponse, { timeout: 5000 }); }
                    catch (retryErr) { console.error('[Callback] 재시도 실패:', retryErr.message); }
                }
            } catch (err) {
                console.error('Error in background processing:', err);
                // AI 처리 실패 시에도 콜백으로 에러 안내 시도
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
        // ===== 명령어 라우팅 (앱 데이터 연동) =====
        const command = msg.trim().toLowerCase();
        const commandArgs = msg.trim().substring(msg.trim().indexOf(' ') + 1).trim();

        // !오늘 — 갤러리 공개 데이터 요약 (등록 불필요)
        if (command === '오늘') {
            const reply = await handleToday(sender);
            return res.status(200).json({ reply });
        }

        // !내습관 — 등록 유저 개인 데이터 조회
        if (command === '내습관' || command === '내 습관') {
            const reply = await handleMyHabits(sender);
            return res.status(200).json({ reply });
        }

        // !주간 — 등록 유저 주간 트렌드
        if (command === '주간' || command === '주간리포트') {
            const reply = await handleWeekly(sender);
            return res.status(200).json({ reply });
        }

        // !우리반 — 기수 전체 현황
        if (command === '우리반' || command === '현황') {
            const reply = await handleClassStatus(sender);
            return res.status(200).json({ reply });
        }

        // !등록 — 구글 이메일로 앱 계정 연결
        if (command === '등록' || command.startsWith('등록 ')) {
            const emailArg = command === '등록' ? '' : commandArgs;
            const reply = await handleRegister(sender, emailArg);
            return res.status(200).json({ reply });
        }

        // !내기록 — 기존 챗봇 기록 조회 (하위 호환)
        if (command === '내기록' || command === '내 기록') {
            const snapshot = await db.ref(`users/${sender}/records`).once('value');
            const data = snapshot.val();
            let recordMsg = `${sender}님, 아직 기록이 없네요! 당장 실천해볼까요?`;
            if (data) recordMsg = `${sender}님! 현재까지 총 ${Object.keys(data).length}번 기록하셨어요! 👏`;
            return res.status(200).json({ reply: recordMsg });
        }

        // !도움말 — 사용 가능한 명령어 안내
        if (command === '도움말' || command === '도움' || command === '명령어') {
            const helpMsg = `📋 명령어 안내\n!오늘 — 전체 기록 현황\n!내습관 — 내 기록 보기\n!주간 — 주간 트렌드\n!우리반 — 기수 현황\n!등록 이메일 — 앱 연결\n!오운완 — 운동 인증\n!목표 — 마이크로 해빗\n\n그 외 자유롭게 질문하세요! 😊`;
            return res.status(200).json({ reply: helpMsg });
        }

        // ===== 일반 AI 대화 =====
        // 기록 탐지 및 메모리 맵 사용
        await checkAndLogHabits(sender, msg);
        const chatSession = getChatSession(sender);

        // 등록된 유저인 경우, 앱 데이터를 프롬프트에 주입
        let appDataContext = '';
        try {
            const mapping = await getMapping(sender);
            if (mapping) {
                const recentRecords = await getUserRecords(mapping.googleUid, 3);
                if (recentRecords.length > 0) {
                    const latest = recentRecords[recentRecords.length - 1];
                    const parts = [];

                    // 식단 요약
                    if (latest.diet) {
                        const meals = [];
                        if (latest.diet.breakfastUrl) meals.push('아침');
                        if (latest.diet.lunchUrl) meals.push('점심');
                        if (latest.diet.dinnerUrl) meals.push('저녁');
                        if (latest.diet.snackUrl) meals.push('간식');
                        if (meals.length > 0) parts.push(`식단: ${meals.join(',')} 기록됨`);
                    }

                    // 운동 요약
                    if (latest.exercise) {
                        const exParts = [];
                        if (latest.exercise.cardioList?.length > 0) exParts.push(`유산소 ${latest.exercise.cardioList.length}건`);
                        if (latest.exercise.strengthList?.length > 0) exParts.push(`근력 ${latest.exercise.strengthList.length}건`);
                        if (exParts.length > 0) parts.push(`운동: ${exParts.join(', ')}`);
                    }

                    // 마음습관 요약
                    if (latest.sleepAndMind) {
                        const mindParts = [];
                        if (latest.sleepAndMind.sleepImageUrl) mindParts.push('수면분석');
                        if (latest.sleepAndMind.meditationDone) mindParts.push('명상');
                        if (latest.sleepAndMind.gratitude) mindParts.push('감사일기');
                        if (mindParts.length > 0) parts.push(`마음: ${mindParts.join(', ')}`);
                    }

                    // 건강 지표
                    if (latest.metrics?.weight) parts.push(`체중: ${latest.metrics.weight}kg`);
                    if (latest.metrics?.glucose) parts.push(`혈당: ${latest.metrics.glucose}`);

                    // 기록 일수
                    const { hasDiet: hd, hasExercise: he, hasMind: hm } = require('./modules/statsHelpers');
                    const dietDays = recentRecords.filter(hd).length;
                    const exDays = recentRecords.filter(he).length;
                    const mindDays = recentRecords.filter(hm).length;

                    if (parts.length > 0) {
                        appDataContext = `\n\n[이 사용자의 해빛스쿨 앱 최근 기록]\n마지막 기록일: ${latest.date}\n${parts.join('\n')}\n최근 3일 기록: 식단 ${dietDays}일, 운동 ${exDays}일, 마음 ${mindDays}일\n\n이 데이터를 참고하여 부족한 영역을 부드럽게 독려해주세요.`;
                    }
                }
            }
        } catch (e) {
            console.warn('[AppData] 앱 데이터 주입 스킵:', e.message);
        }

        const promptWithContext = `[현재 대화중인 사용자 이름: ${sender}님]\n이름을 부를 때 반드시 '${sender}님' 이라고 다정하게 불러주세요.${appDataContext}\n\n사용자 메시지: ${msg}`;

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
// Render 무료 티어 절전 방지 Self-ping
setInterval(() => {
    axios.get(config.RENDER_URL)
        .then(() => console.log(`[Self-Ping] Server kept awake at ${new Date().toISOString()}`))
        .catch(err => console.error('[Self-Ping] Error:', err.message));
}, config.SELF_PING_INTERVAL_MS);

const server = app.listen(port, () => {
    console.log(`Habits School Chatbot Server Running on http://localhost:${port}`);
    console.log(`Kakao Endpoint: POST http://localhost:${port}/api/chat`);
    console.log(`MessengerBot R Endpoint: POST http://localhost:${port}/api/messengerbot`);
});

// Graceful Shutdown — Render 인스턴스 교체 시 진행 중 요청 완료 보장
function gracefulShutdown(signal) {
    console.log(`[${signal}] 서버 종료 시작...`);
    server.close(() => {
        console.log('[Shutdown] 모든 연결 종료 완료');
        process.exit(0);
    });
    // 10초 내 종료 안 되면 강제 종료
    setTimeout(() => { console.error('[Shutdown] 강제 종료'); process.exit(1); }, 10000);
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
