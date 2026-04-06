const config = require('../config');
const { getMapping, getDisplayName } = require('../modules/userMapping');
const { createChatbotConnectToken } = require('../modules/chatbotConnect');

function buildDirectChatOnlyMessage() {
    return `보안을 위해 계정 연결 명령은 오픈톡방이나 단체방에서 사용할 수 없어요.

해빛코치 1:1 바로가기
${config.KAKAO_CHANNEL_CHAT_URL}

위 링크로 1:1 채팅방을 열고 !연결 을 입력해 주세요.`;
}

async function handleConnect(user) {
    const displayName = getDisplayName(user);
    const existing = await getMapping(user);

    if (existing) {
        return {
            type: 'text',
            text: `${displayName}님은 이미 해빛스쿨 계정과 연결되어 있어요.\n다른 계정으로 바꾸려면 !등록 해제 후 다시 !연결 을 입력해 주세요.`
        };
    }

    const connectToken = await createChatbotConnectToken(user);

    return {
        type: 'connect-card',
        title: '앱에서 연결 완료하기',
        description: '버튼을 누르면 해빛스쿨 앱이 열리고 로그인된 계정으로 바로 연결할 수 있어요. 링크는 10분 동안 유효해요.',
        webLinkUrl: connectToken.webLinkUrl,
        buttonLabel: '앱에서 연결하기',
        expiresAt: connectToken.expiresAt
    };
}

module.exports = {
    handleConnect,
    buildDirectChatOnlyMessage
};
