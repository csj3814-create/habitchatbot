const config = require('../config');
const { getMapping, getDisplayName } = require('../modules/userMapping');
const { getLatestShareableRecord, createHaebitShareToken } = require('../modules/appFirebase');

function buildHaebitShareUrl(token) {
    const baseUrl = String(config.RENDER_URL || '').replace(/\/+$/, '');
    return `${baseUrl}/${encodeURIComponent(token)}`;
}

async function handleHaebit(user) {
    const displayName = getDisplayName(user);
    const mapping = await getMapping(user);

    if (!mapping) {
        return `${displayName}님, 아직 해빛스쿨 계정이 연결되지 않았어요.\n앱 프로필에서 연결 코드를 만든 뒤 !등록 코드로 먼저 연결해 주세요.`;
    }

    const record = await getLatestShareableRecord(mapping.googleUid);
    if (!record) {
        return `공유할 하루 기록을 아직 찾지 못했어요.\n오늘 식단, 운동, 마음 기록 중 하나 이상 남긴 뒤 !해빛을 다시 입력해 주세요.`;
    }

    const token = await createHaebitShareToken({
        googleUid: mapping.googleUid,
        record,
        kakaoUserKey: user?.userId || ''
    });

    const shareUrl = buildHaebitShareUrl(token);

    return [
        `${displayName}님의 해빛 기록 공유 링크예요.`,
        shareUrl,
        '',
        '로그인 없이 하루 기록을 볼 수 있고, 댓글/좋아요/식단/운동을 누르면 해빛스쿨로 이어져요.'
    ].join('\n');
}

module.exports = {
    handleHaebit,
    buildHaebitShareUrl
};
