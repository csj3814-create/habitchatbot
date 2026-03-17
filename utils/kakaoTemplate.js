/**
 * utils/kakaoTemplate.js
 * 카카오 오픈빌더 응답 템플릿 생성 유틸리티
 */

const YOUTUBE_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/g;

/**
 * AI 텍스트 응답을 카카오 오픈빌더 템플릿으로 변환
 * - 유튜브 링크 포함 시 BasicCard 템플릿 사용
 * - 일반 텍스트는 simpleText 템플릿 사용
 */
function buildKakaoResponse(text) {
    const videoIds = [];
    let match;
    const regex = new RegExp(YOUTUBE_REGEX.source, 'g');

    while ((match = regex.exec(text)) !== null) {
        videoIds.push(match[1]);
    }

    const cleanText = text
        .replace(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)[a-zA-Z0-9_-]{11}[^\s]*/g, '')
        .trim() || "추천 영상을 확인해 보세요!";

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
                            title: "💪 코치님의 추천 영상",
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
            outputs: [{ simpleText: { text } }],
            quickReplies
        }
    };
}

module.exports = { buildKakaoResponse };
