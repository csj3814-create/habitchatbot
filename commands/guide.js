/**
 * General onboarding / help text for chatbot users.
 */

const SIMPLE_APP_URL = 'https://habitschool.web.app/simple/';

async function handleGuide() {
    return `해빛코치 안내

심플형 앱
${SIMPLE_APP_URL}
처음엔 여기서 시작하세요.

앱에서
식단 운동 수면 마음 기록

챗봇
!오늘 !내습관 !주간 !공유`;
}

async function handleApp() {
    return `해빛스쿨 심플형 앱 안내

심플형 앱
${SIMPLE_APP_URL}

처음엔 여기서 시작하세요.
식단 운동 수면 마음 기록

챗봇
!오늘 !내습관 !주간 !공유`;
}

module.exports = { handleGuide, handleApp, SIMPLE_APP_URL };
