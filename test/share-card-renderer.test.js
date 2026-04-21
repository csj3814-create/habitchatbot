const test = require('node:test');
const assert = require('node:assert/strict');

const { renderShareCardPng } = require('../utils/shareCardRenderer');

test('renderShareCardPng returns a PNG buffer for Korean share content', async () => {
    const png = await renderShareCardPng({
        title: '최석재의 해빛 루틴',
        subtitle: '오늘 식단 · 운동 · 마음 흐름을 한 장으로 남겼어요.',
        date: '2026.04.21',
        points: 40,
        tags: ['식단', '운동', '마음', '52일 연속'],
        gratitudeText: '바나나와 수면 기록까지 잘 남겼다.',
        currentStreak: 52,
        media: [
            { category: '식단', type: 'image', url: '' },
            { category: '운동', type: 'image', url: '' },
            { category: '마음', type: 'image', url: '' }
        ]
    });

    assert.ok(Buffer.isBuffer(png));
    assert.ok(png.length > 1000);
    assert.equal(png[0], 0x89);
    assert.equal(png[1], 0x50);
    assert.equal(png[2], 0x4E);
    assert.equal(png[3], 0x47);
});
