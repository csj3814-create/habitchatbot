/**
 * Centralized server configuration.
 */

module.exports = {
    PORT: process.env.PORT || 3000,
    GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    SESSION_TTL_MS: parseInt(process.env.SESSION_TTL_MS, 10) || 1000 * 60 * 60 * 2,
    SELF_PING_INTERVAL_MS: parseInt(process.env.SELF_PING_INTERVAL_MS, 10) || 10 * 60 * 1000,
    SELF_PING_SLEEP_START_HOUR_KST:
        parseInt(process.env.SELF_PING_SLEEP_START_HOUR_KST, 10) || 1,
    SELF_PING_SLEEP_END_HOUR_KST:
        parseInt(process.env.SELF_PING_SLEEP_END_HOUR_KST, 10) || 7,
    RENDER_URL: process.env.RENDER_URL || 'https://habitchatbot.onrender.com',
    KAKAO_CHANNEL_URL: process.env.KAKAO_CHANNEL_URL || 'https://pf.kakao.com/_QDZZX',
    KAKAO_CHANNEL_CHAT_URL: process.env.KAKAO_CHANNEL_CHAT_URL || 'https://pf.kakao.com/_QDZZX/chat',
    RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX, 10) || 30,
    FIREBASE_DB_URL:
        process.env.FIREBASE_DB_URL ||
        'https://habitchatbot-default-rtdb.asia-southeast1.firebasedatabase.app/'
};
