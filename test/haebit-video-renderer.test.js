const test = require('node:test');
const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const sharp = require('sharp');
const {
    buildEnergeticBgmWav,
    buildVideoTimeline,
    isAllowedMediaUrl,
    renderHaebitVideo,
    startHaebitVideoJob,
    getHaebitVideoJobStatus,
    getCompletedHaebitVideo
} = require('../utils/haebitVideoRenderer');

const execFileAsync = promisify(execFile);

test('buildEnergeticBgmWav creates a stereo PCM soundtrack', () => {
    const wav = buildEnergeticBgmWav(2);

    assert.equal(wav.subarray(0, 4).toString('ascii'), 'RIFF');
    assert.equal(wav.subarray(8, 12).toString('ascii'), 'WAVE');
    assert.equal(wav.readUInt16LE(22), 2);
    assert.equal(wav.readUInt32LE(24), 44100);
    assert.ok(wav.length > 300000);
});

test('buildVideoTimeline keeps all media and paginates gratitude text', () => {
    const longJournal = '오늘 하루 함께해 준 사람들과 건강하게 움직일 수 있었던 시간에 감사합니다. '.repeat(5).trim();
    const timeline = buildVideoTimeline({
        date: '2026.06.18',
        pageTitle: '민수의 하루 해빛 기록',
        subtitle: '식단과 운동을 기록했어요.',
        tags: ['식단', '운동'],
        gratitudeEntries: [
            { date: '2026.06.16', text: longJournal },
            { date: '2026.06.18', text: '셋째 날 감사일기' }
        ],
        galleryMedia: Array.from({ length: 30 }, (_, index) => ({
            type: index === 1 ? 'video' : 'image',
            url: `https://firebasestorage.googleapis.com/v0/b/example/o/${index}`,
            category: '기록',
            label: String(index + 1),
            dateLabel: `2026.06.${16 + (index % 3)}`
        }))
    });

    assert.equal(timeline[0].kind, 'text');
    const mediaSlides = timeline.filter((item) => item.kind === 'image' || item.kind === 'video');
    const gratitudeSlides = timeline.filter((item) => item.layout === 'gratitude');
    assert.equal(mediaSlides.length, 20);
    assert.ok(mediaSlides.filter((item) => item.kind === 'image').every((item) => item.duration < 2.2));
    assert.ok(mediaSlides.filter((item) => item.kind === 'video').every((item) => item.duration < 5));
    assert.ok(gratitudeSlides.length > 2);
    assert.equal(
        gratitudeSlides
            .filter((item) => item.eyebrow.includes('2026.06.16'))
            .map((item) => item.body)
            .join(' '),
        longJournal
    );
    assert.equal(timeline.at(-1).eyebrow, '오늘도 해빛 완료');
});

test('video jobs expose monotonic progress and completed output', async () => {
    const shareCode = 'job123XY';
    const status = startHaebitVideoJob(shareCode, { title: '테스트' }, {
        renderVideo: async (payload, { onProgress }) => {
            assert.equal(payload.title, '테스트');
            onProgress(20, '사진을 준비하고 있어요.');
            await new Promise((resolve) => setTimeout(resolve, 5));
            onProgress(80, '영상과 음악을 합치고 있어요.');
            return Buffer.from('video');
        }
    });

    assert.equal(status.status, 'processing');
    assert.ok(getHaebitVideoJobStatus(shareCode).progress >= 20);
    await new Promise((resolve) => setTimeout(resolve, 20));

    const completed = getHaebitVideoJobStatus(shareCode);
    assert.equal(completed.status, 'ready');
    assert.equal(completed.progress, 100);
    assert.deepEqual(getCompletedHaebitVideo(shareCode), Buffer.from('video'));
});

test('isAllowedMediaUrl only accepts configured HTTPS storage hosts', () => {
    assert.equal(isAllowedMediaUrl('https://firebasestorage.googleapis.com/v0/b/example/o/a.jpg'), true);
    assert.equal(isAllowedMediaUrl('https://storage.googleapis.com/example/a.mp4'), true);
    assert.equal(isAllowedMediaUrl('http://firebasestorage.googleapis.com/a.jpg'), false);
    assert.equal(isAllowedMediaUrl('https://example.com/a.jpg'), false);
});

test('renderHaebitVideo creates a playable MP4 from Korean text slides', { timeout: 120000 }, async () => {
    const video = await renderHaebitVideo({
        date: '2026.06.18',
        pageTitle: '테스트 사용자의 하루 해빛 기록',
        subtitle: '오늘의 작은 습관을 영상으로 정리했어요.',
        tags: ['식단', '마음'],
        gratitudeText: '오늘도 건강하게 하루를 마칠 수 있어 감사합니다.',
        galleryMedia: []
    });

    assert.ok(video.length > 10000);
    assert.ok(video.indexOf(Buffer.from('ftyp')) >= 0);
    assert.ok(video.indexOf(Buffer.from('ftyp')) < 32);
    assert.ok(video.indexOf(Buffer.from('mp4a')) > 0);
});

test('renderHaebitVideo combines a photo and exercise clip', { timeout: 120000 }, async () => {
    const video = await renderHaebitVideo({
        date: '2026.06.18',
        pageTitle: '미디어가 있는 하루 기록',
        subtitle: '사진과 운동 영상을 함께 정리했어요.',
        tags: ['식단', '운동'],
        galleryMedia: [
            {
                type: 'image',
                url: 'https://firebasestorage.googleapis.com/photo.jpg',
                category: '식단',
                label: '점심'
            },
            {
                type: 'video',
                url: 'https://firebasestorage.googleapis.com/exercise.mp4',
                category: '운동',
                label: '근력'
            }
        ]
    }, {
        downloadMedia: async (url, filePath, type) => {
            if (type === 'image') {
                await sharp({
                    create: {
                        width: 480,
                        height: 640,
                        channels: 3,
                        background: '#1F8A70'
                    }
                }).jpeg().toFile(filePath);
                return filePath;
            }

            await execFileAsync(ffmpegInstaller.path, [
                '-y',
                '-f', 'lavfi',
                '-i', 'color=c=0xE44F36:s=320x240:d=1',
                '-an',
                '-c:v', 'libx264',
                '-pix_fmt', 'yuv420p',
                filePath
            ]);
            return filePath;
        }
    });

    assert.ok(video.length > 10000);
    assert.ok(video.indexOf(Buffer.from('ftyp')) >= 0);
    assert.ok(video.indexOf(Buffer.from('mp4a')) > 0);
});
