const config = require('../config');
const { getMapping, getDisplayName } = require('../modules/userMapping');
const { getShareCardPayload, createShareCardToken } = require('../modules/appFirebase');

function buildShareImageUrl(token) {
    const baseUrl = String(config.RENDER_URL || '').replace(/\/+$/, '');
    return `${baseUrl}/api/share-card/${token}.png`;
}

async function handleShare(user) {
    const displayName = getDisplayName(user);
    const mapping = await getMapping(user);

    if (!mapping) {
        return {
            type: 'text',
            text: `${displayName}님은 아직 해빛스쿨 계정이 연결되지 않았어요.\n먼저 앱 프로필에서 연결 코드를 만든 뒤 !등록 코드 로 연결해 주세요.`
        };
    }

    const payload = await getShareCardPayload(mapping.googleUid);
    if (!payload) {
        return {
            type: 'text',
            text: `공유할 최신 기록을 아직 찾지 못했어요.\n앱에서 오늘 식단, 운동, 마음 기록 중 하나 이상 남긴 뒤 다시 !공유 를 입력해 주세요.`
        };
    }

    const token = await createShareCardToken({
        googleUid: mapping.googleUid,
        kakaoUserKey: user?.userId || ''
    });

    const description = payload.subtitle || '오늘의 해빛 흐름을 카드로 정리했어요.';

    return {
        type: 'share-card',
        title: '내 해빛 공유 카드',
        description: description.length > 80 ? `${description.slice(0, 79).trimEnd()}…` : description,
        imageUrl: buildShareImageUrl(token),
        webLinkUrl: payload.appUrl,
        payload
    };
}

module.exports = {
    handleShare
};
