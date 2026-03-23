/**
 * utils/apiKeyAuth.js
 * MessengerBot R 엔드포인트 API 키 인증 미들웨어
 *
 * 사용법:
 *   .env 에 MESSENGER_API_KEY=<랜덤 비밀 문자열> 설정
 *   messengerbot_script.js 에서 HTTP 헤더 'x-api-key' 로 전달
 *
 * 키가 설정되지 않은 경우 개발 편의를 위해 경고 후 통과합니다.
 */

function apiKeyAuth(req, res, next) {
    const secret = process.env.MESSENGER_API_KEY;

    if (!secret) {
        console.warn('[Auth] MESSENGER_API_KEY 환경변수가 설정되지 않았습니다. 인증을 건너뜁니다.');
        return next();
    }

    const provided = req.headers['x-api-key'];
    if (provided !== secret) {
        console.warn(`[Auth] 잘못된 API 키 시도 — IP: ${req.ip}`);
        return res.status(401).json({ error: '인증 실패: 유효하지 않은 API 키' });
    }

    next();
}

module.exports = { apiKeyAuth };
