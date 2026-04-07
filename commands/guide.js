/**
 * General onboarding / help text for chatbot users.
 */

const config = require('../config');
const APP_URL = 'https://habitschool.web.app';

async function handleGuide() {
    return `해빛코치 안내

앱 시작
해빛스쿨은 웹앱이에요.
${APP_URL}
로그인하면 시작돼요.

계정 연결
1:1 채팅: ${config.KAKAO_CHANNEL_CHAT_URL}
입력: !연결

자주 쓰는 명령
!오늘 !내습관 !주간
!식단 !운동 !마음
!내코드 !친구 코드 !공유

주의
!연결 !등록은 1:1 전용`;
}

async function handleApp() {
    return `해빛스쿨 앱 안내

웹앱 주소
${APP_URL}

시작
1. 접속
2. 로그인
3. 해빛코치 1:1에서 !연결

1:1 바로가기
${config.KAKAO_CHANNEL_CHAT_URL}

연결 뒤
!내습관 !주간 !공유`;
}

module.exports = { handleGuide, handleApp };
