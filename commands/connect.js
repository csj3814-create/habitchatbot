const { getMapping, getDisplayName } = require('../modules/userMapping');
const { createChatbotConnectToken } = require('../modules/chatbotConnect');

async function handleConnect(user) {
    const displayName = getDisplayName(user);
    const existing = await getMapping(user);

    if (existing) {
        return {
            type: 'text',
            text: `${displayName}님은 이미 해빛스쿨 계정이 연결되어 있어요.\n다른 계정으로 바꾸려면 !등록 해제 후 다시 !연결 을 입력해 주세요.`
        };
    }

    const connectToken = await createChatbotConnectToken(user);

    return {
        type: 'connect-card',
        title: '앱에서 연결 완료하기',
        description: '버튼을 누르면 해빛스쿨 앱이 열리고, 로그인된 계정으로 바로 연결할 수 있어요. 링크는 10분 동안 유효해요.',
        webLinkUrl: connectToken.webLinkUrl,
        buttonLabel: '앱에서 연결하기',
        expiresAt: connectToken.expiresAt
    };
}

module.exports = {
    handleConnect
};
