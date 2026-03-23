require('dotenv').config();
const express = require('express');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const config = require('./config');

// 환경변수 검증
if (!process.env.GEMINI_API_KEY) {
    console.error('[FATAL] GEMINI_API_KEY 환경변수가 설정되지 않았습니다. .env 파일을 확인하세요.');
    process.exit(1);
}

// Firebase Realtime DB 초기화
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: config.FIREBASE_DB_URL
});
const db = admin.database();

// 유틸리티
const { createGeminiManager } = require('./utils/gemini');
const { createHabitLogger, isAllowedImageUrl } = require('./utils/habitLogger');
const { getChatSession } = createGeminiManager();
const { checkAndLogHabits } = createHabitLogger(db);

// 라우터
const { createKakaoRouter } = require('./routes/kakao');
const { createMessengerbotRouter } = require('./routes/messengerbot');
const { createBroadcastRouter } = require('./routes/broadcast');
const { initAppFirebase } = require('./modules/appFirebase');

// Express 앱
const app = express();
app.set('trust proxy', 1); // Render 리버스 프록시 신뢰 (rate-limit X-Forwarded-For 정상 동작)
app.use(express.json());

// Rate Limiting
const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: config.RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: { version: "2.0", template: { outputs: [{ simpleText: { text: "요청이 너무 많아요. 잠시 후 다시 시도해주세요! 🙏" } }] } }
});
app.use('/api/', apiLimiter);

// ===== 헬스 체크 =====
app.get('/health', async (req, res) => {
    const status = { ok: true, timestamp: new Date().toISOString(), checks: {} };

    try {
        await db.ref('.info/connected').once('value');
        status.checks.firebase_rtdb = 'ok';
    } catch (e) {
        status.checks.firebase_rtdb = `error: ${e.message}`;
        status.ok = false;
    }

    try {
        const appDb = initAppFirebase();
        if (appDb) {
            await appDb.collection('daily_logs').limit(1).get();
            status.checks.firestore = 'ok';
        } else {
            status.checks.firestore = 'not_initialized';
        }
    } catch (e) {
        status.checks.firestore = `error: ${e.message}`;
        status.ok = false;
    }

    status.checks.gemini_api_key = process.env.GEMINI_API_KEY ? 'ok' : 'missing';
    if (!process.env.GEMINI_API_KEY) status.ok = false;

    res.status(status.ok ? 200 : 503).json(status);
});

// ===== 메인 페이지 =====
app.get('/', (req, res) => {
    res.send('<h1>해빛스쿨 운동 챗봇 서버가 정상 동작 중입니다!</h1><p>카카오톡 챗봇 설정에서 이 주소를 사용하세요.</p>');
});

// ===== 라우트 마운트 =====
app.use('/api/chat',          createKakaoRouter({ db, getChatSession, checkAndLogHabits, isAllowedImageUrl }));
app.use('/api/messengerbot',  createMessengerbotRouter({ db, getChatSession, checkAndLogHabits }));
app.use('/api/broadcast',     createBroadcastRouter());

// ===== Render 절전 방지 Self-ping =====
setInterval(() => {
    axios.get(config.RENDER_URL)
        .then(() => console.log(`[Self-Ping] Server kept awake at ${new Date().toISOString()}`))
        .catch(err => console.error('[Self-Ping] Error:', err.message));
}, config.SELF_PING_INTERVAL_MS);

// ===== 서버 시작 =====
const server = app.listen(config.PORT, () => {
    console.log(`Habits School Chatbot Server Running on http://localhost:${config.PORT}`);
    console.log(`Kakao Endpoint:       POST http://localhost:${config.PORT}/api/chat`);
    console.log(`MessengerBot Endpoint: POST http://localhost:${config.PORT}/api/messengerbot`);
    console.log(`Health Check:          GET  http://localhost:${config.PORT}/health`);
});

// ===== Graceful Shutdown =====
function gracefulShutdown(signal) {
    console.log(`[${signal}] 서버 종료 시작...`);
    server.close(() => {
        console.log('[Shutdown] 모든 연결 종료 완료');
        process.exit(0);
    });
    setTimeout(() => { console.error('[Shutdown] 강제 종료'); process.exit(1); }, 10000);
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));
