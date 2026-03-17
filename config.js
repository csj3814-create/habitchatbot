/**
 * config.js — 서버 설정값 중앙 관리
 */

module.exports = {
    PORT: process.env.PORT || 3000,
    GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    SESSION_TTL_MS: parseInt(process.env.SESSION_TTL_MS) || 1000 * 60 * 60 * 2, // 2시간
    SELF_PING_INTERVAL_MS: parseInt(process.env.SELF_PING_INTERVAL_MS) || 14 * 60 * 1000, // 14분
    RENDER_URL: process.env.RENDER_URL || 'https://habitchatbot.onrender.com',
    RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX) || 30, // IP당 분당 요청 수
    FIREBASE_DB_URL: process.env.FIREBASE_DB_URL || 'https://habitchatbot-default-rtdb.asia-southeast1.firebasedatabase.app/',
};
