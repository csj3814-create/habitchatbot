/**
 * General onboarding / help text for chatbot users.
 *
 * 새 회원은 기본 앱으로 보낸다. 예전에는 4탭짜리 심플형(/simple/)으로 보냈는데, 기본 앱이
 * 새 회원에게 기록 탭부터 보여 주고 나머지를 단계별로 열게 되면서(v596) 역할이 겹쳤다.
 * 심플형에는 자산·갤러리 탭이 없어 첫걸음 배지를 받을 곳도, !공유 카드도 없다.
 * 2026-11-11 GA4: 최근 28일 심플형 방문 34명 중 기록을 저장한 사람은 1명.
 *
 * !안내 는 카카오 1:1 에서 300자에서 잘린다(utils/kakaoTemplate.js). 그 안에 들어가야 한다.
 */

// 방에 보여 주는 주소는 짧은 입구를 쓴다. habitschool.kr 은 앱(habitschool.web.app)으로 넘겨 주므로
// 로그인 상태가 나뉘지 않는다(habitschool index.html 머리 스크립트, 2026-11-22 연결).
// 초대 링크처럼 ?ref= 를 붙이는 주소는 그대로 utils/appLinks.js 의 web.app 을 쓴다.
const SHORT_APP_URL = 'https://habitschool.kr/';

const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.habitschool.app';

async function handleGuide() {
    return `해빛코치 참여 안내

1. 아래 링크를 눌러서 들어가세요
${SHORT_APP_URL}

2. 구글 로그인을 하세요

3. 내 기록 탭에서 홈 화면에 앱 설치를 누르세요

4. 매일의 식단 운동 마음을 기록하세요
첫 기록을 남기면 200P 선물이 들어와요

챗봇에서 바로 써보세요
!오늘 - 오늘 기록 요약
!내습관 - 내 기록 보기
!주간 - 주간 리포트
!공유 - 인증 카드 만들기
!해빛 - 해빛스쿨 소개 영상
!명상 - 명상/호흡 실습 영상`;
}

async function handleApp() {
    return `해빛스쿨 앱 안내

${SHORT_APP_URL}

구글 로그인 후 식단 운동 마음을 기록하세요.
첫 기록을 남기면 200P 선물이 들어와요.

포인트로 이런 것도 해요
· 해빛 코칭: 해빛코치가 4주 기록을 읽고 해빛닥터가 한마디 (처음 300P)
· 소모임: 4주에 14번 채우면 500P

안드로이드는 플레이 스토어 앱을 쓰면
걸음수와 수면이 자동으로 들어와요
${PLAY_STORE_URL}

챗봇
!오늘 !내습관 !주간 !공유 !해빛 !명상`;
}

module.exports = { handleGuide, handleApp, PLAY_STORE_URL, SHORT_APP_URL };
