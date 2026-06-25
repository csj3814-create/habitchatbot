const config = require('../config');
const { getMapping, getDisplayName } = require('../modules/userMapping');
const {
    getLatestShareableRecord,
    createHaebitShareToken,
    getHaebitVideoPayload
} = require('../modules/appFirebase');
const {
    getHaebitVideoJobStatus,
    startHaebitVideoJob
} = require('../utils/haebitVideoRenderer');

function buildHaebitShareUrl(token) {
    const baseUrl = String(config.RENDER_URL || '').replace(/\/+$/, '');
    return `${baseUrl}/${encodeURIComponent(token)}`;
}

function buildHaebitVideoUrl(token) {
    const baseUrl = String(config.RENDER_URL || '').replace(/\/+$/, '');
    return `${baseUrl}/video/${encodeURIComponent(token)}`;
}

async function createHaebitShare(user) {
    const displayName = getDisplayName(user);
    const mapping = await getMapping(user);

    if (!mapping) {
        return {
            error: `${displayName}님, 아직 해빛스쿨 계정이 연결되지 않았어요.\n앱 프로필에서 연결 코드를 만든 뒤 !등록 코드로 먼저 연결해 주세요.`
        };
    }

    const record = await getLatestShareableRecord(mapping.googleUid);
    if (!record) {
        return {
            error: '공유할 하루 기록을 아직 찾지 못했어요.\n오늘 식단, 운동, 마음 기록 중 하나 이상 남긴 뒤 !해빛 또는 !하루영상 을 다시 입력해 주세요.'
        };
    }

    const token = await createHaebitShareToken({
        googleUid: mapping.googleUid,
        record,
        kakaoUserKey: user?.userId || ''
    });

    return { displayName, token };
}

async function handleHaebit(user) {
    const result = await createHaebitShare(user);
    if (result.error) {
        return result.error;
    }

    const { displayName, token } = result;
    const shareUrl = buildHaebitShareUrl(token);

    return [
        `${displayName}님의 해빛 기록 공유 링크예요.`,
        shareUrl,
        '',
        '로그인 없이 하루 기록을 볼 수 있고, 댓글/좋아요/식단/운동을 누르면 해빛스쿨로 이어져요.'
    ].join('\n');
}

async function handleHaebitVideo(user) {
    const result = await createHaebitShare(user);
    if (result.error) {
        return result.error;
    }

    const existingJob = getHaebitVideoJobStatus(result.token);
    let jobStatus = existingJob;

    if (existingJob.status !== 'processing' && existingJob.status !== 'ready') {
        try {
            const payload = await getHaebitVideoPayload(result.token);
            if (!payload) {
                return '공개 가능한 최근 3일 기록을 찾지 못했어요.\n오늘 기록을 공개 설정으로 남긴 뒤 다시 !하루영상 을 입력해 주세요.';
            }
            jobStatus = startHaebitVideoJob(result.token, payload);
        } catch (error) {
            console.error('[HaebitVideo] failed to queue video job:', error);
            return '영상 만들기를 시작하지 못했어요.\n잠시 뒤 !하루영상 을 다시 입력해 주세요.';
        }
    }

    const statusCopy = jobStatus.status === 'ready'
        ? '영상이 이미 완성되어 링크에서 바로 재생하거나 다운로드할 수 있어요.'
        : '서버가 백그라운드에서 영상을 만들기 시작했어요.';

    return [
        `${result.displayName}님의 최근 3일 해빛 영상 준비 링크예요.`,
        buildHaebitVideoUrl(result.token),
        '',
        statusCopy,
        '링크는 진행 상황과 완성된 영상 다운로드만 보여줘요. 링크를 여러 번 열어도 새로 만들지 않아요.',
        '보통 1~3분 정도 걸리며, 기록이 많으면 조금 더 걸릴 수 있어요.'
    ].join('\n');
}

module.exports = {
    handleHaebit,
    handleHaebitVideo,
    buildHaebitShareUrl,
    buildHaebitVideoUrl
};
