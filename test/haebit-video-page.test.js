const test = require('node:test');
const assert = require('node:assert/strict');

const { renderHaebitVideoProgressPage } = require('../utils/haebitVideoPage');

test('renderHaebitVideoProgressPage polls status without starting generation', () => {
    const html = renderHaebitVideoProgressPage({
        shareCode: 'abc123XY',
        title: '최근 3일 해빛 영상'
    });

    assert.match(html, /id="percent">0%/);
    assert.match(html, /\/video\/' \+ encodeURIComponent\(shareCode\) \+ '\/status/);
    assert.match(html, /\/v\/' \+ encodeURIComponent\(shareCode\) \+ '\.mp4/);
    assert.doesNotMatch(html, /\/video\/' \+ encodeURIComponent\(shareCode\) \+ '\/start/);
    assert.doesNotMatch(html, /fetch\(startUrl/);
    assert.match(html, /채팅 명령에서 영상 만들기를 시작/);
    assert.match(html, /채팅방에서 !하루영상 을 다시 입력/);
    assert.match(html, /percent\.textContent = '.+?'/);
    assert.match(html, /job\.status === 'idle'/);
});
