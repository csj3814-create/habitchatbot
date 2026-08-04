/**
 * Fixed YouTube links used by deterministic chat commands.
 */

const MEDITATION_VIDEO_URL = 'https://youtu.be/dcftmD1qVDs';
const HAEBIT_INTRO_VIDEO_URL = 'https://youtu.be/kusU9zROdhc';

function handleMeditationVideo() {
    return [
        '명상의 장점과 호흡법의 의미를 설명하고 함께 실제로 해보는 영상이에요.',
        '잠깐 멈추고 호흡을 따라가면서 몸과 마음을 같이 정리해 보세요.',
        MEDITATION_VIDEO_URL
    ].join('\n');
}

function handleHaebitIntroVideo() {
    return [
        '해빛스쿨을 3분 안에 이해할 수 있는 소개 영상이에요.',
        '약들약 출연 영상에서 해빛스쿨이 어떤 방식으로 습관을 돕는지 자세히 설명했어요.',
        HAEBIT_INTRO_VIDEO_URL
    ].join('\n');
}

module.exports = {
    HAEBIT_INTRO_VIDEO_URL,
    MEDITATION_VIDEO_URL,
    handleHaebitIntroVideo,
    handleMeditationVideo
};
