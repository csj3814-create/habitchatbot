const test = require('node:test');
const assert = require('node:assert/strict');

const { renderHaebitVideoProgressPage } = require('../utils/haebitVideoPage');

test('renderHaebitVideoProgressPage shows progress immediately and polls job status', () => {
    const html = renderHaebitVideoProgressPage({
        shareCode: 'abc123XY',
        title: '최근 3일 해빛 영상'
    });

    assert.match(html, /id="percent">0%/);
    assert.match(html, /1~3분/);
    assert.match(html, /\/video\/' \+ encodeURIComponent\(shareCode\) \+ '\/start/);
    assert.match(html, /\/video\/' \+ encodeURIComponent\(shareCode\) \+ '\/status/);
    assert.match(html, /\/v\/' \+ encodeURIComponent\(shareCode\) \+ '\.mp4/);
    assert.match(html, /percent\.textContent = '완성'/);
    assert.match(html, /job\.status === 'idle'/);
    assert.match(html, /사진 · 운동 · 감사일기/);
});
