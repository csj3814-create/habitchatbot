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
    renderHaebitVideo
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

test('buildVideoTimeline combines media and gratitude into a bounded montage', () => {
    const timeline = buildVideoTimeline({
        date: '2026.06.18',
        pageTitle: '민수의 하루 해빛 기록',
        subtitle: '식단과 운동을 기록했어요.',
        tags: ['식단', '운동'],
        gratitudeText: '오늘 함께 걸어준 친구에게 감사하다.',
        galleryMedia: Array.from({ length: 10 }, (_, index) => ({
            type: index === 1 ? 'video' : 'image',
            url: `https://firebasestorage.googleapis.com/v0/b/example/o/${index}`,
            category: '기록',
            label: String(index + 1)
        }))
    });

    assert.equal(timeline[0].kind, 'text');
    assert.equal(timeline.filter((item) => item.kind === 'image' || item.kind === 'video').length, 6);
    assert.equal(timeline.some((item) => item.eyebrow === '오늘의 감사일기'), true);
    assert.equal(timeline.at(-1).eyebrow, '오늘도 해빛 완료');
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
