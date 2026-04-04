require('dotenv').config();

const express = require('express');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const admin = require('firebase-admin');

const config = require('./config');
const serviceAccount = require('./serviceAccountKey.json');
const { createGeminiManager } = require('./utils/gemini');
const { createHabitLogger, isAllowedImageUrl } = require('./utils/habitLogger');
const { createKakaoRouter } = require('./routes/kakao');
const { createMessengerbotRouter } = require('./routes/messengerbot');
const {
    initAppFirebase,
    consumeShareCardToken,
    getShareCardPayload
} = require('./modules/appFirebase');
const {
    getChatbotConnectToken,
    completeChatbotConnect
} = require('./modules/chatbotConnect');
const { renderShareCardPng } = require('./utils/shareCardRenderer');

if (!process.env.GEMINI_API_KEY) {
    console.error('[FATAL] GEMINI_API_KEY is not configured. Check your .env file.');
    process.exit(1);
}

if (!process.env.MESSENGER_API_KEY) {
    console.warn('[WARN] MESSENGER_API_KEY is not configured. /api/messengerbot will reject requests.');
}

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: config.FIREBASE_DB_URL
});

const CHATBOT_CONNECT_ALLOWED_ORIGINS = new Set([
    'https://habitschool.web.app',
    'https://habitschool-staging.web.app',
    'http://localhost:5000',
    'http://127.0.0.1:5000',
    process.env.HABITSCHOOL_APP_ORIGIN
].filter(Boolean));

const db = admin.database();
const app = express();
const { getChatSession } = createGeminiManager();
const { checkAndLogHabits } = createHabitLogger(db);

app.set('trust proxy', 1);
app.use(express.json());

const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: config.RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        version: '2.0',
        template: {
            outputs: [{ simpleText: { text: '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.' } }]
        }
    }
});

app.use('/api/', apiLimiter);

function applyConnectCors(req, res) {
    const origin = req.headers.origin;

    if (origin && CHATBOT_CONNECT_ALLOWED_ORIGINS.has(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

app.options('/api/chatbot-connect/:token', (req, res) => {
    applyConnectCors(req, res);
    return res.status(204).end();
});

app.options('/api/chatbot-connect/complete', (req, res) => {
    applyConnectCors(req, res);
    return res.status(204).end();
});

app.get('/health', async (req, res) => {
    const status = { ok: true, timestamp: new Date().toISOString(), checks: {} };

    try {
        await db.ref('.info/connected').once('value');
        status.checks.firebase_rtdb = 'ok';
    } catch (error) {
        status.checks.firebase_rtdb = `error: ${error.message}`;
        status.ok = false;
    }

    try {
        const appDb = initAppFirebase();
        if (appDb) {
            await appDb.collection('daily_logs').limit(1).get();
            status.checks.firestore = 'ok';
        } else {
            status.checks.firestore = 'not_initialized';
            status.ok = false;
        }
    } catch (error) {
        status.checks.firestore = `error: ${error.message}`;
        status.ok = false;
    }

    status.checks.gemini_api_key = process.env.GEMINI_API_KEY ? 'ok' : 'missing';
    status.checks.messenger_api_key = process.env.MESSENGER_API_KEY ? 'ok' : 'missing';

    if (!process.env.GEMINI_API_KEY || !process.env.MESSENGER_API_KEY) {
        status.ok = false;
    }

    res.status(status.ok ? 200 : 503).json(status);
});

app.get('/', (req, res) => {
    res.send('<h1>Habits School chatbot server is running.</h1><p>Use the configured Kakao or MessengerBot endpoint.</p>');
});

app.get('/api/share-card/:token.png', async (req, res) => {
    try {
        const tokenData = await consumeShareCardToken(req.params.token);
        if (!tokenData) {
            return res.status(404).send('expired');
        }

        const payload = await getShareCardPayload(tokenData.googleUid);
        if (!payload) {
            return res.status(404).send('no-record');
        }

        const png = await renderShareCardPng(payload);
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'private, max-age=300');
        return res.status(200).send(png);
    } catch (error) {
        console.error('[ShareCard] render error:', error);
        return res.status(500).send('error');
    }
});

app.get('/api/chatbot-connect/:token', async (req, res) => {
    applyConnectCors(req, res);

    try {
        const tokenData = await getChatbotConnectToken(req.params.token);
        if (!tokenData) {
            return res.status(404).json({ ok: false, code: 'expired' });
        }

        return res.status(200).json({
            ok: true,
            displayName: tokenData.displayName,
            platform: tokenData.identity.platform,
            expiresAt: tokenData.expiresAt,
            status: tokenData.status
        });
    } catch (error) {
        console.error('[ChatbotConnect] token lookup error:', error);
        return res.status(500).json({ ok: false, code: 'error' });
    }
});

app.post('/api/chatbot-connect/complete', async (req, res) => {
    applyConnectCors(req, res);

    try {
        const authHeader = String(req.headers.authorization || '');
        const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : '';
        const token = String(req.body?.token || '').trim();

        if (!token) {
            return res.status(400).json({ ok: false, code: 'missing_token' });
        }

        if (!idToken) {
            return res.status(401).json({ ok: false, code: 'missing_auth' });
        }

        const result = await completeChatbotConnect(token, idToken);

        if (!result.ok) {
            const statusCode = result.code === 'unauthorized'
                ? 401
                : result.code === 'already_used'
                    ? 409
                    : result.code === 'expired'
                        ? 404
                        : 400;

            return res.status(statusCode).json(result);
        }

        return res.status(200).json({
            ok: true,
            alreadyCompleted: result.alreadyCompleted,
            kakaoDisplayName: result.displayName,
            appUser: result.appUser
        });
    } catch (error) {
        console.error('[ChatbotConnect] complete error:', error);
        return res.status(500).json({ ok: false, code: 'error' });
    }
});

app.use('/api/chat', createKakaoRouter({ db, getChatSession, checkAndLogHabits, isAllowedImageUrl }));
app.use('/api/messengerbot', createMessengerbotRouter({ db, getChatSession, checkAndLogHabits }));

setInterval(() => {
    axios.get(config.RENDER_URL)
        .then(() => console.log(`[Self-Ping] Server kept awake at ${new Date().toISOString()}`))
        .catch((error) => console.error('[Self-Ping] Error:', error.message));
}, config.SELF_PING_INTERVAL_MS);

const server = app.listen(config.PORT, () => {
    console.log(`Habits School Chatbot Server Running on http://localhost:${config.PORT}`);
    console.log(`Kakao Endpoint:            POST http://localhost:${config.PORT}/api/chat`);
    console.log(`MessengerBot Endpoint:     POST http://localhost:${config.PORT}/api/messengerbot`);
    console.log(`Share Card Endpoint:       GET  http://localhost:${config.PORT}/api/share-card/:token.png`);
    console.log(`Chatbot Connect Lookup:    GET  http://localhost:${config.PORT}/api/chatbot-connect/:token`);
    console.log(`Chatbot Connect Complete:  POST http://localhost:${config.PORT}/api/chatbot-connect/complete`);
    console.log(`Health Check:              GET  http://localhost:${config.PORT}/health`);
});

function gracefulShutdown(signal) {
    console.log(`[${signal}] Starting graceful shutdown...`);

    server.close(() => {
        console.log('[Shutdown] All connections closed.');
        process.exit(0);
    });

    setTimeout(() => {
        console.error('[Shutdown] Forced exit after timeout.');
        process.exit(1);
    }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
