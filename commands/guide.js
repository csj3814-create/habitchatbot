/**
 * General onboarding / help text for chatbot users.
 */

const SIMPLE_APP_URL = 'https://habitschool.web.app/simple/';

async function handleGuide() {
    return `해빛코치 참여 안내

1. 아래 링크를 눌러서 들어가세요
${SIMPLE_APP_URL}

2. 구글 로그인을 하세요

3. 맨 아래 해빛스쿨 앱 설치를 누르세요

4. 매일의 식단 운동 마음을 기록하세요

챗봇에서 바로 써보세요
!오늘 - 오늘 기록 요약
!내습관 - 내 기록 보기
!주간 - 주간 리포트
!공유 - 인증 카드 만들기`;
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
