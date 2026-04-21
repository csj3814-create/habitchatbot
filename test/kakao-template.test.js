const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildKakaoGuideResponse,
    buildKakaoAppCardResponse,
    buildKakaoConnectCardResponse,
    buildKakaoShareCardResponse
} = require('../utils/kakaoTemplate');

test('buildKakaoGuideResponse adds action-first quick replies', () => {
    const result = buildKakaoGuideResponse('GUIDE');

    assert.equal(result.template.outputs[0].simpleText.text, 'GUIDE');
    assert.deepEqual(
        result.template.quickReplies.map((item) => item.messageText),
        ['!앱', '!오늘', '!내습관', '!공유']
    );
});

test('buildKakaoAppCardResponse builds app and chat buttons', () => {
    const result = buildKakaoAppCardResponse({
        title: '앱 시작',
        description: '설명',
        appUrl: 'https://habitschool.web.app',
        galleryUrl: 'https://habitschool.web.app/#gallery'
    });

    const card = result.template.outputs[0].basicCard;

    assert.equal(card.title, '앱 시작');
    assert.equal(card.description, '설명');
    assert.equal(card.thumbnail.imageUrl, 'https://habitschool.web.app/icons/og-image.png');
    assert.deepEqual(
        card.buttons.map((button) => button.webLinkUrl),
        ['https://habitschool.web.app', 'https://habitschool.web.app/#gallery']
    );
    assert.deepEqual(
        result.template.quickReplies.map((item) => item.messageText),
        ['!오늘', '!내습관', '!공유']
    );
});

test('buildKakaoAppCardResponse works with default arguments', () => {
    const result = buildKakaoAppCardResponse();
    const card = result.template.outputs[0].basicCard;

    assert.equal(card.title, '해빛스쿨 심플형 앱');
    assert.equal(card.description, '처음엔 심플형으로 시작\n식단 운동 수면 마음 기록');
    assert.equal(card.thumbnail.imageUrl, 'https://habitschool.web.app/icons/og-image.png');
    assert.deepEqual(
        card.buttons.map((button) => button.webLinkUrl),
        ['https://habitschool.web.app/simple/', 'https://habitschool.web.app/#gallery']
    );
    assert.deepEqual(
        card.buttons.map((button) => button.label),
        ['앱 열기', '갤러리 보기']
    );
});

test('buildKakaoConnectCardResponse includes a public thumbnail image', () => {
    const result = buildKakaoConnectCardResponse({
        title: '연결 완료',
        description: '앱에서 연결을 마무리해 주세요.',
        webLinkUrl: 'https://habitschool.web.app/connect'
    });

    const card = result.template.outputs[0].basicCard;

    assert.equal(card.title, '연결 완료');
    assert.equal(card.description, '앱에서 연결을 마무리해 주세요.');
    assert.equal(card.thumbnail.imageUrl, 'https://habitschool.web.app/icons/og-image.png');
    assert.deepEqual(
        card.buttons.map((button) => button.webLinkUrl),
        ['https://habitschool.web.app/connect']
    );
});

test('buildKakaoShareCardResponse sends the image first and follows with an invite link', () => {
    const result = buildKakaoShareCardResponse({
        title: '내 해빛 공유 카드',
        description: '오늘의 해빛 흐름을 카드로 정리했어요.',
        imageUrl: 'https://habitchatbot.example.com/api/share-card/share-token-1.png',
        inviteUrl: 'https://habitschool.web.app/?ref=ABC123',
        shareCode: 'ABC123'
    });

    assert.equal(
        result.template.outputs[0].simpleImage.imageUrl,
        'https://habitchatbot.example.com/api/share-card/share-token-1.png'
    );
    assert.equal(result.template.outputs[0].simpleImage.altText, '내 해빛 공유 카드');
    assert.match(result.template.outputs[1].simpleText.text, /https:\/\/habitschool\.web\.app\/\?ref=ABC123/);
    assert.match(result.template.outputs[1].simpleText.text, /ABC123 코드가 함께 적용돼요/);
    assert.deepEqual(
        result.template.quickReplies.map((item) => item.messageText),
        ['!내습관', '!주간', '!내코드']
    );
});
