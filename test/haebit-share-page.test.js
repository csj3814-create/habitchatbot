const test = require('node:test');
const assert = require('node:assert/strict');

const { renderHaebitSharePage, safeHttpUrl } = require('../utils/haebitSharePage');
const {
    buildHaebitSharePayloadFromRecord,
    buildHaebitVideoPayloadFromRecords
} = require('../modules/appFirebase');

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
    assert.match(html, /\/video\/abc123XY/);
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

test('buildHaebitVideoPayloadFromRecords keeps all public media across three days', () => {
    const records = ['2026-06-16', '2026-06-17', '2026-06-18'].map((date, dayIndex) => ({
        id: `uid-1_${date}`,
        date,
        diet: {
            breakfastUrl: `https://firebasestorage.googleapis.com/day-${dayIndex}-breakfast.jpg`,
            lunchUrl: `https://firebasestorage.googleapis.com/day-${dayIndex}-lunch.jpg`,
            dinnerUrl: `https://firebasestorage.googleapis.com/day-${dayIndex}-dinner.jpg`,
            snackUrl: `https://firebasestorage.googleapis.com/day-${dayIndex}-snack.jpg`
        },
        exercise: {
            strengthList: [{
                videoUrl: `https://firebasestorage.googleapis.com/day-${dayIndex}-exercise.mp4`,
                videoThumbUrl: `https://firebasestorage.googleapis.com/day-${dayIndex}-exercise.jpg`
            }]
        },
        sleepAndMind: {
            gratitude: `${date} 감사일기`
        }
    }));

    records[1].shareSettings = { hideExercise: true };
    const payload = buildHaebitVideoPayloadFromRecords('uid-1', records, {
        displayName: '민수'
    });

    assert.equal(payload.sourceDays.length, 3);
    assert.equal(payload.gratitudeEntries.length, 3);
    assert.equal(payload.galleryMedia.length, 14);
    assert.deepEqual(
        [...new Set(payload.galleryMedia.map((item) => item.dateLabel))],
        ['2026.06.16', '2026.06.17', '2026.06.18']
    );
    assert.equal(
        payload.galleryMedia.some((item) => item.url.includes('day-1-exercise.mp4')),
        false
    );
    assert.equal(
        payload.galleryMedia.some((item) => item.url.includes('day-0-exercise.mp4')),
        true
    );
    assert.equal(
        payload.galleryMedia.some((item) => item.url.includes('day-2-exercise.mp4')),
        true
    );
    assert.match(payload.pageTitle, /최근 3일/);
});
