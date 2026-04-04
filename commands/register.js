/**
 * !등록 명령으로 해빛스쿨 계정을 연결합니다.
 * 사용 예시: !등록 ABCD1234
 */

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
        return `${displayName}님의 계정 연결을 해제했어요.\n다시 연결하려면 앱 프로필에서 새 연결 코드를 만든 뒤 !등록 코드 로 입력해 주세요.`;
    }

    if (!input) {
        if (existing) {
            return `${displayName}님은 이미 계정이 연결되어 있어요.\n연결 이메일: ${existing.googleEmail}\n\n!내습관 으로 기록을 확인해 보세요.\n연결 해제: !등록 해제`;
        }

        return `계정 연결 안내\n\n해빛스쿨 앱 프로필에서 해빛코치 연결 코드를 생성한 뒤, 이 방에서 입력해 주세요.\n\n순서\n1. 해빛스쿨 앱 로그인\n2. 프로필 탭에서 연결 코드 생성\n3. 카카오톡 방에서 !등록 ABCD1234 입력\n\n연결 코드는 10분 동안만 사용할 수 있어요.`;
    }

    if (existing) {
        return `${displayName}님은 이미 계정이 연결되어 있어요.\n연결 이메일: ${existing.googleEmail}\n\n다른 계정으로 바꾸려면 먼저 !등록 해제 를 입력한 뒤 새 코드를 사용해 주세요.`;
    }

    const linkCode = normalizeLinkCode(input);
    if (!LINK_CODE_REGEX.test(linkCode)) {
        return `연결 코드는 영문 대문자와 숫자 8자리예요.\n예시: !등록 ABCD1234`;
    }

    const appUser = await consumeChatbotLinkCode(linkCode);
    if (!appUser) {
        return `연결 코드를 확인하지 못했어요.\n\n확인해 주세요.\n1. 앱 프로필에서 방금 생성한 코드인지\n2. 10분이 지나 만료되지 않았는지\n3. 이미 한 번 사용한 코드가 아닌지\n\n다시 시도: 앱에서 새 코드를 만든 뒤 !등록 ABCD1234`;
    }

    await registerUser(user, appUser.email || '이메일 정보 없음', appUser.uid);

    const appDisplayName = appUser.displayName ? ` (${appUser.displayName})` : '';
    const emailLine = appUser.email ? `이메일: ${appUser.email}\n` : '';

    return `연결 완료!\n────────\n사용자: ${displayName}${appDisplayName}\n${emailLine}\n이제 사용할 수 있어요.\n- !내습관 : 내 기록 보기\n- !주간 : 주간 리포트 보기\n\n이제 해빛코치가 앱 기록을 참고해서 더 맞춤형으로 도와드릴게요.`;
}

module.exports = { handleRegister };
