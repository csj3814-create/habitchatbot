/**
 * Account linking for shared MessengerBot rooms.
 *
 * Separate from `commands/register.js` on purpose: the 1:1 copy echoes the
 * linked email address, which must never be printed into a room other people
 * are reading. Nothing here repeats the submitted code either.
 */

const { linkByCode } = require('../modules/chatLink');
const { getMapping, removeMapping, getDisplayName } = require('../modules/userMapping');

const UNLINK_KEYWORDS = new Set(['해제', '연결해제', '연결 해제']);

function isUnlinkRequest(args) {
    return UNLINK_KEYWORDS.has(String(args || '').trim());
}

function buildGroupLinkGuideMessage() {
    return `앱 계정 연결하기

1. 해빛스쿨 앱 프로필에서 연결 코드 만들기
2. 여기에 !연결 코드 입력 (예: !연결 ABCD1234)

코드는 10분 동안만 쓸 수 있어요.
연결을 끊으려면 !연결 해제 를 입력해 주세요.`;
}

function buildSuccessMessage(result) {
    const movedNotice = result.reason === 'ok_moved'
        ? '\n이전 닉네임에 남아 있던 연결은 정리했어요.'
        : '';

    return `${result.displayName}님 연결 완료!${movedNotice}

이제 사용할 수 있어요.
- !내습관 : 내 기록 보기
- !주간 : 주간 리포트 보기
- !공유 : 최신 인증 카드 보내기`;
}

function buildFailureMessage(result) {
    switch (result.reason) {
        case 'invalid_format':
            return `연결 코드는 영문 대문자와 숫자 8자리예요.
앱 프로필에서 만든 코드를 그대로 입력해 주세요.
예시: !연결 ABCD1234`;

        case 'expired':
            return `연결 코드가 만료됐어요.
코드는 만든 뒤 10분 동안만 쓸 수 있어요.
앱 프로필에서 새 코드를 만들어 다시 입력해 주세요.`;

        case 'not_found':
            return `연결 코드를 찾지 못했어요.
이미 사용했거나 잘못 입력한 코드일 수 있어요.
앱 프로필에서 새 코드를 만들어 주세요.`;

        case 'nickname_already_linked':
            return `${result.displayName} 닉네임은 이미 앱 계정과 연결되어 있어요.

본인이 다른 계정으로 바꾸려는 거라면
!연결 해제 를 입력한 뒤 다시 연결해 주세요.`;

        case 'unavailable':
            return `지금은 계정 연결을 처리할 수 없어요.
잠시 후 다시 시도해 주세요.`;

        default:
            return `계정 연결을 처리하지 못했어요.
잠시 후 다시 시도해 주세요.`;
    }
}

async function handleGroupLink(user, args) {
    const displayName = getDisplayName(user);
    const input = String(args || '').trim();

    if (isUnlinkRequest(input)) {
        const existing = await getMapping(user);

        if (!existing) {
            return `${displayName}님은 현재 연결된 계정이 없어요.`;
        }

        await removeMapping(user);
        return `${displayName}님의 계정 연결을 해제했어요.
다시 연결하려면 앱에서 연결 코드를 만든 뒤 !연결 코드 를 입력해 주세요.`;
    }

    if (!input) {
        return buildGroupLinkGuideMessage();
    }

    const result = await linkByCode({ user, code: input, linkSource: 'messengerbot-code' });

    return result.ok ? buildSuccessMessage(result) : buildFailureMessage(result);
}

module.exports = {
    handleGroupLink,
    buildGroupLinkGuideMessage,
    isUnlinkRequest
};
