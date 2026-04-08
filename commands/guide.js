/**
 * General onboarding / help text for chatbot users.
 */

const APP_URL = 'https://habitschool.web.app';

async function handleGuide() {
    return `해빛코치 안내

웹앱
${APP_URL}
로그인 후 기록하면 시작돼요.

앱에서 해요
식단 운동 수면 마음 기록
갤러리 친구 활동 확인

챗봇 명령
!오늘 !내습관 !주간
!공유 !식단 !운동 !마음

필요할 때만
!연결`;
}

async function handleApp() {
    return `해빛스쿨 앱 안내

웹앱
${APP_URL}

앱에서 할 일
식단 운동 수면 마음 기록
갤러리 보기
친구 초대 관리

챗봇에서
!오늘 !내습관 !주간 !공유

계정 연결이 필요할 때만 !연결`;
}

module.exports = { handleGuide, handleApp };
