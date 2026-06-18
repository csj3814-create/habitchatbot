const test = require('node:test');
const assert = require('node:assert/strict');

const { renderHaebitSharePage, safeHttpUrl } = require('../utils/haebitSharePage');
const { buildHaebitSharePayloadFromRecord } = require('../modules/appFirebase');

test('renderHaebitSharePage escapes public record text and wires login actions', () => {
    const html = renderHaebitSharePage({
        token: 'abc123XY',
        pageTitle: '민수 <script>alert(1)</script>의 하루 해빛 기록',
        subtitle: '식단과 운동을 정리했어요.',
        date: '2026.06.04',
        points: 25,
        tags: ['식단', '운동'],
        inviteUrl: 'https://habitschool.web.app/?ref=ABC123',
        galleryMedia: [{
            url: 'https://cdn.example.com/meal.jpg',
            thumbUrl: 'https://cdn.example.com/meal-thumb.jpg',
            category: '식단',
            label: '아침'
        }],
        sections: [{
            key: 'diet',
            title: '식단',
            summary: '1개 식단 인증',
            ctaLabel: '나도 식단 기록하기',
            media: []
        }]
    });

    assert.match(html, /민수 &lt;script&gt;alert\(1\)&lt;\/script&gt;의 하루 해빛 기록/);
    assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
    assert.match(html, /https:\/\/cdn\.example\.com\/meal-thumb\.jpg/);
    assert.match(html, /data-login-action/);
    assert.match(html, /https:\/\/habitschool\.web\.app\/\?ref=ABC123/);
    assert.match(html, /좋아요/);
    assert.match(html, /댓글 달기/);
    assert.match(html, /나도 식단 기록하기/);
    assert.match(html, /\/v\/abc123XY\.mp4/);
    assert.match(html, /하루 영상/);
});

test('safeHttpUrl rejects non-http links in public page media', () => {
    assert.equal(safeHttpUrl('javascript:alert(1)'), '');
    assert.equal(safeHttpUrl('data:text/html,hi'), '');
    assert.equal(safeHttpUrl('https://habitschool.web.app/simple/'), 'https://habitschool.web.app/simple/');
});

test('buildHaebitSharePayloadFromRecord respects public share settings', () => {
    const payload = buildHaebitSharePayloadFromRecord('uid-1', {
        id: 'uid-1_2026-06-04',
        date: '2026-06-04',
        userName: '민수',
        shareSettings: {
            hideIdentity: true,
            hideExercise: true
        },
        diet: {
            breakfastUrl: 'https://cdn.example.com/breakfast.jpg'
        },
        exercise: {
            cardioImageUrl: 'https://cdn.example.com/run.jpg'
        },
        metrics: {
            weight: 72,
            glucose: 90
        }
    }, {
        displayName: '민수',
        referralCode: 'ABC123'
    });

    assert.equal(payload.userName, '익명 학생');
    assert.equal(payload.sections.some((section) => section.key === 'diet'), true);
    assert.equal(payload.sections.some((section) => section.key === 'exercise'), false);
    assert.equal(payload.sections.some((section) => section.key === 'metrics'), false);
    assert.equal(payload.galleryMedia.some((media) => media.url.includes('run.jpg')), false);
    assert.equal(payload.inviteUrl, 'https://habitschool.web.app/?ref=ABC123');
});
