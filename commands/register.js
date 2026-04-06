/**
 * Manual fallback registration command.
 * Preferred flow is now `!연결`, but `!등록 코드` remains supported.
 */

const config = require('../config');
const { consumeChatbotLinkCode } = require('../modules/appFirebase');
const {
    registerUser,
    getMapping,
    removeMapping,
    getDisplayName
} = require('../modules/userMapping');

const LINK_CODE_REGEX = /^[A-Z0-9]{8}$/;

function normalizeLinkCode(value) {
    return String(value || '').trim().toUpperCase();
}

async function handleRegister(user, args) {
    const displayName = getDisplayName(user);
    const input = String(args || '').trim();
    const existing = await getMapping(user);

    if (input === '해제' || input === '연결해제') {
        if (!existing) {
            return `${displayName}님은 현재 연결된 계정이 없어요.`;
        }

        await removeMapping(user);
        return `${displayName}님의 계정 연결이 해제됐어요.\n다시 연결하려면 해빛코치 1:1 바로가기\n${config.KAKAO_CHANNEL_CHAT_URL}\n에서 !연결 을 입력해 주세요.\n수동 방식이 필요하면 앱 프로필에서 연결 코드를 만든 뒤 !등록 코드 를 사용할 수도 있어요.`;
    }

    if (!input) {
        if (existing) {
            return `${displayName}님은 이미 계정이 연결되어 있어요.\n연결 이메일: ${existing.googleEmail}\n\n!내습관 으로 기록을 확인해 보세요.\n연결 해제: !등록 해제`;
        }

        return `계정 연결 안내

가장 쉬운 방법
1. 해빛코치 1:1 바로가기 열기
${config.KAKAO_CHANNEL_CHAT_URL}
2. 1:1 채팅방에서 !연결 입력
3. 챗봇이 보내는 버튼 누르기
4. 앱에서 로그인된 계정으로 바로 연결 완료

수동 방식도 가능해요.
- 앱 프로필에서 연결 코드 생성
- 카톡에서 !등록 ABCD1234 입력

연결 코드는 10분 동안만 유효해요.`;
    }

    if (existing) {
        return `${displayName}님은 이미 계정이 연결되어 있어요.\n연결 이메일: ${existing.googleEmail}\n\n다른 계정으로 바꾸려면 먼저 !등록 해제 를 입력한 뒤 !연결 또는 !등록 코드 를 사용해 주세요.`;
    }

    const linkCode = normalizeLinkCode(input);
    if (!LINK_CODE_REGEX.test(linkCode)) {
        return `연결 코드는 영문 대문자와 숫자 8자리예요.\n예시: !등록 ABCD1234`;
    }

    const appUser = await consumeChatbotLinkCode(linkCode);
    if (!appUser) {
        return `연결 코드를 확인하지 못했어요.

확인해 주세요.
1. 앱 프로필에서 방금 생성한 코드인지
2. 10분이 지나 만료되지 않았는지
3. 이미 한 번 사용한 코드는 아닌지

더 쉬운 방법을 원하면 해빛코치 1:1 바로가기
${config.KAKAO_CHANNEL_CHAT_URL}
에서 !연결 을 입력해 주세요.`;
    }

    await registerUser(user, appUser.email || '이메일 정보 없음', appUser.uid);

    const appDisplayName = appUser.displayName ? ` (${appUser.displayName})` : '';
    const emailLine = appUser.email ? `이메일: ${appUser.email}\n` : '';

    return `연결 완료!
━━━━━━━━━━
사용자: ${displayName}${appDisplayName}
${emailLine}
이제 사용할 수 있어요.
- !내습관 : 내 기록 보기
- !주간 : 주간 리포트 보기
- !공유 : 최신 인증 카드 보내기

이제 해빛코치가 앱 기록을 참고해서 더 맞춤형으로 도와드릴게요.`;
}

module.exports = { handleRegister };
