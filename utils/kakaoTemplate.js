/**
 * utils/kakaoTemplate.js
 * 카카오 오픈빌더 응답 템플릿 생성 유틸리티
 */

const YOUTUBE_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/g;

// 카카오 simpleText 권장 최대 글자 수 (초과 시 "전체보기" 버튼 노출)
const KAKAO_TEXT_MAX = 300;

/**
 * 텍스트를 문장 경계에서 자연스럽게 자름
 * 300자 이내로 제한, 가능하면 마지막 완성된 문장까지만 유지
 */
function truncateForKakao(text) {
    if (text.length <= KAKAO_TEXT_MAX) return text;

    const truncated = text.substring(0, KAKAO_TEXT_MAX);

    // 마지막 문장 끝 위치 탐색 (한국어 문장 종결 패턴)
    const endings = ['요.\n', '요!\n', '요?\n', '다.\n', '다!\n', '다?\n',
                     '요.', '요!', '요?', '다.', '다!', '다?', '!\n', '.\n'];
    let bestEnd = -1;
    for (const ending of endings) {
        const idx = truncated.lastIndexOf(ending);
        if (idx > 80 && idx > bestEnd) bestEnd = idx + ending.length - 1;
    }

    if (bestEnd > 80) return text.substring(0, bestEnd + 1).trimEnd();
    return truncated.trimEnd() + '...';
}

/**
 * AI 텍스트 응답을 카카오 오픈빌더 템플릿으로 변환
 * - 유튜브 링크 포함 시 BasicCard 템플릿 사용
 * - 일반 텍스트는 simpleText 템플릿 사용
 */
function buildKakaoResponse(text) {
    // 카카오 글자 수 제한 적용 (유튜브 링크 추출 전에 원본 보존)
    const displayText = truncateForKakao(text);

    const videoIds = [];
    let match;
    const regex = new RegExp(YOUTUBE_REGEX.source, 'g');

    while ((match = regex.exec(text)) !== null) {
        videoIds.push(match[1]);
    }

    const cleanText = truncateForKakao(
        text.replace(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)[a-zA-Z0-9_-]{11}[^\s]*/g, '')
            .trim() || "추천 영상을 확인해 보세요!"
    );

    const quickReplies = [
        { label: "내 인증 기록 보기 🏆", action: "message", messageText: "!내기록" }
    ];

    if (videoIds.length > 0) {
        const videoId = videoIds[0];
        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

        return {
            version: "2.0",
            template: {
                outputs: [
                    { simpleText: { text: cleanText } },
                    {
                        basicCard: {
                            title: "💪 해빛코치의 추천 영상",
                            description: "아래 버튼을 눌러 바로 시청해보세요!",
                            thumbnail: { imageUrl: thumbnailUrl },
                            buttons: [{ action: "webLink", label: "영상 보러가기 ▶️", webLinkUrl: videoUrl }]
                        }
                    }
                ],
                quickReplies
            }
        };
    }

    return {
        version: "2.0",
        template: {
            outputs: [{ simpleText: { text: displayText } }],
            quickReplies
        }
    };
}

module.exports = { buildKakaoResponse };
