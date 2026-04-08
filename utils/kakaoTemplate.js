/**
 * Kakao skill response builders.
 */

const YOUTUBE_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/g;
const KAKAO_TEXT_MAX = 300;
const DEFAULT_APP_URL = 'https://habitschool.web.app';
const DEFAULT_GALLERY_URL = 'https://habitschool.web.app/#gallery';

function truncateForKakao(text) {
    const source = String(text || '');
    if (source.length <= KAKAO_TEXT_MAX) {
        return source;
    }

    const truncated = source.slice(0, KAKAO_TEXT_MAX);
    const endings = ['.\n', '!\n', '?\n', '. ', '! ', '? ', '.\r', '!\r', '?\r'];
    let bestEnd = -1;

    endings.forEach((ending) => {
        const index = truncated.lastIndexOf(ending);
        if (index > 80 && index > bestEnd) {
            bestEnd = index + ending.length - 1;
        }
    });

    if (bestEnd > 80) {
        return source.slice(0, bestEnd + 1).trimEnd();
    }

    return `${truncated.trimEnd()}...`;
}

function buildDefaultQuickReplies() {
    return [
        { label: '내 습관 보기', action: 'message', messageText: '!내습관' }
    ];
}

function buildGuideQuickReplies() {
    return [
        { label: '앱 열기', action: 'message', messageText: '!앱' },
        { label: '오늘 보기', action: 'message', messageText: '!오늘' },
        { label: '내습관', action: 'message', messageText: '!내습관' },
        { label: '공유', action: 'message', messageText: '!공유' }
    ];
}

function buildKakaoResponse(text) {
    const fullText = String(text || '');
    const regex = new RegExp(YOUTUBE_REGEX.source, 'g');
    const videoIds = [];
    let match;

    while ((match = regex.exec(fullText)) !== null) {
        videoIds.push(match[1]);
    }

    const cleanText = truncateForKakao(
        fullText.replace(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)[a-zA-Z0-9_-]{11}[^\s]*/g, '').trim()
        || '추천 영상을 확인해 보세요.'
    );

    if (videoIds.length > 0) {
        const videoId = videoIds[0];
        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

        return {
            version: '2.0',
            template: {
                outputs: [
                    { simpleText: { text: cleanText } },
                    {
                        basicCard: {
                            title: '해빛코치 추천 영상',
                            description: '아래 버튼을 눌러 바로 시청해 보세요.',
                            thumbnail: { imageUrl: thumbnailUrl },
                            buttons: [
                                { action: 'webLink', label: '영상 보러 가기', webLinkUrl: videoUrl }
                            ]
                        }
                    }
                ],
                quickReplies: buildDefaultQuickReplies()
            }
        };
    }

    return {
        version: '2.0',
        template: {
            outputs: [{ simpleText: { text: truncateForKakao(fullText) } }],
            quickReplies: buildDefaultQuickReplies()
        }
    };
}

function buildKakaoShareCardResponse({ title, description, imageUrl, webLinkUrl }) {
    return {
        version: '2.0',
        template: {
            outputs: [
                {
                    basicCard: {
                        title: title || '내 해빛 공유 카드',
                        description: description || '오늘의 기록을 카드로 정리했어요.',
                        thumbnail: {
                            imageUrl
                        },
                        buttons: [
                            {
                                action: 'webLink',
                                label: '앱에서 보기',
                                webLinkUrl: webLinkUrl || 'https://habitschool.web.app/#gallery'
                            }
                        ]
                    }
                }
            ],
            quickReplies: [
                { label: '내습관 보기', action: 'message', messageText: '!내습관' },
                { label: '주간 리포트', action: 'message', messageText: '!주간' }
            ]
        }
    };
}

function buildKakaoGuideResponse(text) {
    return {
        version: '2.0',
        template: {
            outputs: [{ simpleText: { text: truncateForKakao(text) } }],
            quickReplies: buildGuideQuickReplies()
        }
    };
}

function buildKakaoAppCardResponse({
    title = '해빛스쿨 웹앱',
    description = '로그인 후 기록하고\n갤러리와 친구 활동 확인',
    appUrl = DEFAULT_APP_URL,
    galleryUrl = DEFAULT_GALLERY_URL
} = {}) {
    return {
        version: '2.0',
        template: {
            outputs: [
                {
                    basicCard: {
                        title,
                        description,
                        buttons: [
                            {
                                action: 'webLink',
                                label: '앱 열기',
                                webLinkUrl: appUrl
                            },
                            {
                                action: 'webLink',
                                label: '갤러리 보기',
                                webLinkUrl: galleryUrl
                            }
                        ]
                    }
                }
            ],
            quickReplies: [
                { label: '오늘 보기', action: 'message', messageText: '!오늘' },
                { label: '내습관', action: 'message', messageText: '!내습관' },
                { label: '공유', action: 'message', messageText: '!공유' }
            ]
        }
    };
}

function buildKakaoConnectCardResponse({ title, description, webLinkUrl, buttonLabel = '앱에서 연결하기' }) {
    return {
        version: '2.0',
        template: {
            outputs: [
                {
                    basicCard: {
                        title: title || '앱에서 연결 완료하기',
                        description: description || '버튼을 눌러 해빛스쿨 앱에서 연결을 마무리해 주세요.',
                        buttons: [
                            {
                                action: 'webLink',
                                label: buttonLabel,
                                webLinkUrl
                            }
                        ]
                    }
                }
            ],
            quickReplies: [
                { label: '연결 도움말', action: 'message', messageText: '!등록' },
                { label: '내습관 보기', action: 'message', messageText: '!내습관' }
            ]
        }
    };
}

module.exports = {
    buildKakaoResponse,
    buildKakaoGuideResponse,
    buildKakaoAppCardResponse,
    buildKakaoShareCardResponse,
    buildKakaoConnectCardResponse
};
