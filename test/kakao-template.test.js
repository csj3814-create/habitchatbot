const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildKakaoGuideResponse,
    buildKakaoAppCardResponse
} = require('../utils/kakaoTemplate');

test('buildKakaoGuideResponse adds action-first quick replies', () => {
    const result = buildKakaoGuideResponse('GUIDE');

    assert.equal(result.template.outputs[0].simpleText.text, 'GUIDE');
    assert.deepEqual(
        result.template.quickReplies.map((item) => item.messageText),
        ['!앱', '!연결', '!오늘', '!내습관']
    );
});

test('buildKakaoAppCardResponse builds app and chat buttons', () => {
    const result = buildKakaoAppCardResponse({
        title: '앱 시작',
        description: '설명',
        appUrl: 'https://habitschool.web.app',
        chatUrl: 'https://pf.kakao.com/_QDZZX/chat'
    });

    const card = result.template.outputs[0].basicCard;

    assert.equal(card.title, '앱 시작');
    assert.equal(card.description, '설명');
    assert.deepEqual(
        card.buttons.map((button) => button.webLinkUrl),
        ['https://habitschool.web.app', 'https://pf.kakao.com/_QDZZX/chat']
    );
    assert.deepEqual(
        result.template.quickReplies.map((item) => item.messageText),
        ['!연결', '!도움말', '!오늘']
    );
});

test('buildKakaoAppCardResponse works with default arguments', () => {
    const result = buildKakaoAppCardResponse();
    const card = result.template.outputs[0].basicCard;

    assert.equal(card.title, '해빛스쿨 앱 시작');
    assert.deepEqual(
        card.buttons.map((button) => button.label),
        ['앱 열기', '1:1 연결']
    );
});
