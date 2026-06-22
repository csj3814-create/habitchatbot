const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const axios = require('axios');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const fontkit = require('fontkit');
const sharp = require('sharp');

const VIDEO_WIDTH = 720;
const VIDEO_HEIGHT = 1280;
const VIDEO_FPS = 30;
const MAX_MEDIA_COUNT = 9;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_VIDEO_BYTES = 30 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 30 * 1024 * 1024;
const VIDEO_CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_CACHE_ENTRIES = 6;
const BGM_SAMPLE_RATE = 44100;
const BGM_BPM = 124;
const ALLOWED_MEDIA_HOSTS = [
    'firebasestorage.googleapis.com',
    'storage.googleapis.com'
];
const FONT_FILES = {
    regular: path.join(__dirname, '..', 'assets', 'fonts', 'NotoSansCJKkr-Regular.otf'),
    bold: path.join(__dirname, '..', 'assets', 'fonts', 'NotoSansCJKkr-Bold.otf')
};

const loadedFonts = new Map();
const videoJobs = new Map();

function midiToFrequency(note) {
    return 440 * (2 ** ((note - 69) / 12));
}

function buildEnergeticBgmWav(durationSeconds, sampleRate = BGM_SAMPLE_RATE) {
    const duration = Math.max(1, Math.min(90, Number(durationSeconds) || 1));
    const frameCount = Math.ceil(duration * sampleRate);
    const channelCount = 2;
    const bytesPerSample = 2;
    const dataSize = frameCount * channelCount * bytesPerSample;
    const buffer = Buffer.alloc(44 + dataSize);
    const beatDuration = 60 / BGM_BPM;
    const eighthDuration = beatDuration / 2;
    const roots = [65.41, 55, 43.65, 49];
    const leadNotes = [72, 76, 79, 76, 74, 77, 81, 77, 69, 72, 76, 72, 71, 74, 79, 74];
    let noiseState = 0x6d2b79f5;

    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(channelCount, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * channelCount * bytesPerSample, 28);
    buffer.writeUInt16LE(channelCount * bytesPerSample, 32);
    buffer.writeUInt16LE(bytesPerSample * 8, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);

    for (let index = 0; index < frameCount; index += 1) {
        const time = index / sampleRate;
        const beatIndex = Math.floor(time / beatDuration);
        const beatLocal = time - (beatIndex * beatDuration);
        const beatInBar = beatIndex % 4;
        const barIndex = Math.floor(beatIndex / 4);
        const eighthIndex = Math.floor(time / eighthDuration);
        const eighthLocal = time - (eighthIndex * eighthDuration);
        const root = roots[barIndex % roots.length];
        const leadFrequency = midiToFrequency(leadNotes[eighthIndex % leadNotes.length]);

        noiseState = (Math.imul(noiseState, 1664525) + 1013904223) >>> 0;
        const noise = (noiseState / 0x7fffffff) - 1;

        const kickEnvelope = beatLocal < 0.22 ? Math.exp(-18 * beatLocal) : 0;
        const kickFrequency = 52 + (95 * Math.exp(-24 * beatLocal));
        const kick = Math.sin(2 * Math.PI * kickFrequency * beatLocal) * kickEnvelope * 0.62;

        const snareEnvelope = (beatInBar === 1 || beatInBar === 3) && beatLocal < 0.2
            ? Math.exp(-17 * beatLocal)
            : 0;
        const snare = (
            (noise * 0.42)
            + (Math.sin(2 * Math.PI * 185 * beatLocal) * 0.18)
        ) * snareEnvelope;

        const hatLocal = time % eighthDuration;
        const hatEnvelope = hatLocal < 0.07 ? Math.exp(-58 * hatLocal) : 0;
        const hatAccent = eighthIndex % 2 === 1 ? 1 : 0.72;
        const hat = noise * hatEnvelope * 0.16 * hatAccent;

        const bassEnvelope = Math.min(1, beatLocal / 0.018) * Math.exp(-3.4 * beatLocal);
        const bass = (
            Math.sin(2 * Math.PI * root * time)
            + (0.28 * Math.sin(2 * Math.PI * root * 2 * time))
        ) * bassEnvelope * 0.19;

        const leadEnvelope = Math.min(1, eighthLocal / 0.025) * Math.exp(-4.5 * eighthLocal);
        const lead = (
            Math.sin(2 * Math.PI * leadFrequency * time)
            + (0.22 * Math.sin(2 * Math.PI * leadFrequency * 2 * time))
        ) * leadEnvelope * 0.115;

        const chordThirdRatio = barIndex % 4 === 0 || barIndex % 4 === 3 ? 1.2599 : 1.1892;
        const chord = (
            Math.sin(2 * Math.PI * root * 2 * time)
            + Math.sin(2 * Math.PI * root * 2 * chordThirdRatio * time)
            + Math.sin(2 * Math.PI * root * 3 * time)
        ) * 0.025;

        const fadeIn = Math.min(1, time / 0.7);
        const fadeOut = Math.min(1, Math.max(0, (duration - time) / 1.1));
        const master = fadeIn * fadeOut;
        const leadPan = eighthIndex % 2 === 0 ? 0.82 : 1.08;
        const base = kick + snare + hat + bass + chord;
        const left = Math.tanh((base + (lead * leadPan)) * master * 0.78);
        const right = Math.tanh((base + (lead * (1.9 - leadPan))) * master * 0.78);
        const offset = 44 + (index * channelCount * bytesPerSample);

        buffer.writeInt16LE(Math.round(left * 32767), offset);
        buffer.writeInt16LE(Math.round(right * 32767), offset + bytesPerSample);
    }

    return buffer;
}

function getFont(weight = 'regular') {
    const key = weight === 'bold' ? 'bold' : 'regular';
    if (!loadedFonts.has(key)) {
        loadedFonts.set(key, fontkit.openSync(FONT_FILES[key]));
    }
    return loadedFonts.get(key);
}

function truncateText(value, limit) {
    const text = String(value || '').trim();
    if (text.length <= limit) {
        return text;
    }
    return `${text.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

function wrapTextLines(value, lineLength, maxLines) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (!text) {
        return [];
    }

    const lines = [];
    let current = '';

    for (const char of [...text]) {
        const candidate = current + char;
        if (candidate.length > lineLength && current) {
            lines.push(current.trim());
            current = char === ' ' ? '' : char;
        } else {
            current = candidate;
        }
    }

    if (current.trim()) {
        lines.push(current.trim());
    }

    if (lines.length > 1 && [...lines.at(-1)].length <= 2) {
        const previousChars = [...lines.at(-2)];
        const lastLine = lines.at(-1);
        const moveCount = Math.min(2, Math.max(0, previousChars.length - 4));

        if (moveCount > 0) {
            lines[lines.length - 2] = previousChars.slice(0, -moveCount).join('').trim();
            lines[lines.length - 1] = `${previousChars.slice(-moveCount).join('')}${lastLine}`.trim();
        }
    }

    if (lines.length <= maxLines) {
        return lines;
    }

    return [
        ...lines.slice(0, maxLines - 1),
        truncateText(`${lines[maxLines - 1]} ${lines.slice(maxLines).join(' ')}`, lineLength)
    ];
}

function getTextWidth(text, fontSize, weight = 'regular') {
    const font = getFont(weight);
    const run = font.layout(String(text || ''));
    const widthUnits = run.positions.reduce((sum, position) => sum + position.xAdvance, 0);
    return widthUnits * (fontSize / font.unitsPerEm);
}

function buildTextPath(text, {
    x,
    y,
    fontSize,
    fill,
    weight = 'regular',
    align = 'left',
    opacity = 1
}) {
    const content = String(text || '');
    if (!content) {
        return '';
    }

    const font = getFont(weight);
    const run = font.layout(content);
    const scale = fontSize / font.unitsPerEm;
    const widthUnits = run.positions.reduce((sum, position) => sum + position.xAdvance, 0);
    let startXUnits = x / scale;

    if (align === 'center') {
        startXUnits -= widthUnits / 2;
    } else if (align === 'right') {
        startXUnits -= widthUnits;
    }

    let cursorUnits = 0;
    const paths = run.glyphs.map((glyph, index) => {
        const position = run.positions[index];
        const pathData = glyph.path.toSVG();
        const pathSvg = `<path d="${pathData}" transform="translate(${startXUnits + cursorUnits + position.xOffset} ${position.yOffset})" />`;
        cursorUnits += position.xAdvance;
        return pathSvg;
    }).join('');

    return `
        <g transform="translate(0 ${y}) scale(${scale} -${scale})" fill="${fill}"${opacity < 1 ? ` fill-opacity="${opacity}"` : ''}>
            ${paths}
        </g>
    `;
}

function buildPill(text, x, y) {
    const fontSize = 23;
    const width = Math.max(120, Math.min(250, Math.ceil(getTextWidth(text, fontSize, 'bold') + 44)));
    return `
        <g transform="translate(${x} ${y})">
            <rect width="${width}" height="50" rx="25" fill="#E9F7F2" />
            ${buildTextPath(text, {
                x: width / 2,
                y: 33,
                fontSize,
                fill: '#176B57',
                weight: 'bold',
                align: 'center'
            })}
        </g>
    `;
}

function buildSlideSvg({ eyebrow, title, body = '', tags = [], accent = '#1F8A70' }) {
    const titleLines = wrapTextLines(title, 12, 3);
    const bodyLines = wrapTextLines(body, 21, 6);
    const titleStartY = 350 - ((titleLines.length - 1) * 35);
    const bodyStartY = 650;
    let pillX = 58;
    const pills = tags.slice(0, 3).map((tag) => {
        const pill = buildPill(truncateText(tag, 11), pillX, 1000);
        pillX += Math.min(250, Math.max(120, getTextWidth(tag, 23, 'bold') + 44)) + 12;
        return pill;
    }).join('');

    return `
        <svg width="${VIDEO_WIDTH}" height="${VIDEO_HEIGHT}" viewBox="0 0 ${VIDEO_WIDTH} ${VIDEO_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
            <rect width="${VIDEO_WIDTH}" height="${VIDEO_HEIGHT}" fill="#F5F7F2" />
            <rect x="42" y="42" width="636" height="1196" rx="26" fill="#FFFFFF" stroke="#E1E6DE" stroke-width="2" />
            <rect x="58" y="74" width="72" height="72" rx="16" fill="${accent}" />
            ${buildTextPath('H', {
                x: 94,
                y: 125,
                fontSize: 40,
                fill: '#FFFFFF',
                weight: 'bold',
                align: 'center'
            })}
            ${buildTextPath(eyebrow, {
                x: 58,
                y: 222,
                fontSize: 28,
                fill: accent,
                weight: 'bold'
            })}
            ${titleLines.map((line, index) => buildTextPath(line, {
                x: 58,
                y: titleStartY + (index * 74),
                fontSize: 58,
                fill: '#18202C',
                weight: 'bold'
            })).join('')}
            ${bodyLines.map((line, index) => buildTextPath(line, {
                x: 58,
                y: bodyStartY + (index * 49),
                fontSize: 32,
                fill: '#59616D',
                weight: 'regular'
            })).join('')}
            ${pills}
            ${buildTextPath('해빛스쿨', {
                x: 58,
                y: 1168,
                fontSize: 26,
                fill: '#24334F',
                weight: 'bold'
            })}
            ${buildTextPath('오늘의 작은 기록이 내일의 루틴이 됩니다.', {
                x: 58,
                y: 1205,
                fontSize: 21,
                fill: '#7B828D'
            })}
        </svg>
    `;
}

function isAllowedMediaUrl(value) {
    try {
        const url = new URL(String(value || ''));
        return url.protocol === 'https:'
            && ALLOWED_MEDIA_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
    } catch (_) {
        return false;
    }
}

async function downloadRemoteMedia(url, filePath, type) {
    if (!isAllowedMediaUrl(url)) {
        throw new Error('Unsupported media URL.');
    }

    const maxBytes = type === 'video' ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
    const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 20000,
        maxContentLength: maxBytes,
        maxBodyLength: maxBytes,
        validateStatus: (status) => status >= 200 && status < 300
    });
    const buffer = Buffer.from(response.data);

    if (buffer.length === 0 || buffer.length > maxBytes) {
        throw new Error('Media file is empty or too large.');
    }

    await fs.writeFile(filePath, buffer);
    return filePath;
}

function runFfmpeg(args, {
    ffmpegPath = ffmpegInstaller.path,
    timeoutMs = 90000
} = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(ffmpegPath, args, {
            windowsHide: true,
            stdio: ['ignore', 'ignore', 'pipe']
        });
        let stderr = '';
        let settled = false;

        const finish = (error) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            if (error) reject(error);
            else resolve();
        };

        child.stderr.on('data', (chunk) => {
            stderr = `${stderr}${chunk}`.slice(-12000);
        });
        child.once('error', finish);
        child.once('close', (code) => {
            if (code === 0) {
                finish();
            } else {
                finish(new Error(`FFmpeg exited with code ${code}: ${stderr}`));
            }
        });

        const timer = setTimeout(() => {
            child.kill('SIGKILL');
            finish(new Error('FFmpeg timed out.'));
        }, timeoutMs);
    });
}

async function renderTextSlide(filePath, options) {
    const svg = buildSlideSvg(options);
    await sharp(Buffer.from(svg)).png().toFile(filePath);
}

function getCategoryAccent(category) {
    if (category === '식단') return '#E44F36';
    if (category === '운동') return '#2767B0';
    if (category === '마음') return '#7A4EAB';
    return '#1F8A70';
}

function buildMediaFrameSvg(item = {}) {
    const accent = getCategoryAccent(item.category);
    const dateLabel = item.dateLabel || '최근 3일';
    const category = item.category || '해빛 기록';
    const label = item.label || '오늘의 기록';

    return `
        <svg width="${VIDEO_WIDTH}" height="${VIDEO_HEIGHT}" viewBox="0 0 ${VIDEO_WIDTH} ${VIDEO_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
            <rect width="${VIDEO_WIDTH}" height="${VIDEO_HEIGHT}" fill="#F3F6F1" />
            <rect x="0" y="0" width="18" height="${VIDEO_HEIGHT}" fill="${accent}" />
            <rect x="42" y="42" width="636" height="1196" rx="26" fill="#FFFFFF" stroke="#DDE5DD" stroke-width="2" />
            <rect x="58" y="68" width="62" height="62" rx="14" fill="${accent}" />
            ${buildTextPath('H', {
                x: 89,
                y: 113,
                fontSize: 34,
                fill: '#FFFFFF',
                weight: 'bold',
                align: 'center'
            })}
            ${buildTextPath(dateLabel, {
                x: 646,
                y: 106,
                fontSize: 25,
                fill: '#59616D',
                weight: 'bold',
                align: 'right'
            })}
            <rect x="60" y="174" width="600" height="864" rx="22" fill="#E7F0EA" />
            <rect x="60" y="174" width="600" height="10" rx="5" fill="${accent}" />
            <rect x="60" y="1058" width="136" height="42" rx="21" fill="${accent}" fill-opacity="0.12" />
            ${buildTextPath(category, {
                x: 128,
                y: 1087,
                fontSize: 21,
                fill: accent,
                weight: 'bold',
                align: 'center'
            })}
            ${buildTextPath(label, {
                x: 60,
                y: 1152,
                fontSize: 34,
                fill: '#1D2939',
                weight: 'bold'
            })}
            ${buildTextPath('최근 3일의 습관을 한 편의 이야기로', {
                x: 60,
                y: 1193,
                fontSize: 21,
                fill: '#7B828D'
            })}
            <rect x="624" y="1074" width="12" height="12" rx="3" fill="${accent}" />
            <rect x="644" y="1074" width="12" height="12" rx="3" fill="#D9E2DA" />
        </svg>
    `;
}

async function renderMediaBackground(filePath, item) {
    await sharp(Buffer.from(buildMediaFrameSvg(item))).png().toFile(filePath);
}

async function renderPhotoSlide(sourcePath, filePath, item) {
    const image = await sharp(sourcePath)
        .rotate()
        .resize(600, 864, {
            fit: 'contain',
            background: '#E7F0EA',
            withoutEnlargement: false
        })
        .png()
        .toBuffer();
    const background = await sharp(Buffer.from(buildMediaFrameSvg(item))).png().toBuffer();

    await sharp(background)
        .composite([{ input: image, left: 60, top: 174 }])
        .png()
        .toFile(filePath);
}

async function createImageSegment(imagePath, outputPath, durationSeconds) {
    await runFfmpeg([
        '-y',
        '-loop', '1',
        '-framerate', String(VIDEO_FPS),
        '-i', imagePath,
        '-t', String(durationSeconds),
        '-vf', `scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT},fps=${VIDEO_FPS},setsar=1,format=yuv420p`,
        '-an',
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '24',
        '-pix_fmt', 'yuv420p',
        outputPath
    ]);
}

async function createVideoSegment(inputPath, backgroundPath, outputPath) {
    await runFfmpeg([
        '-y',
        '-loop', '1',
        '-framerate', String(VIDEO_FPS),
        '-i', backgroundPath,
        '-i', inputPath,
        '-t', '5',
        '-filter_complex',
        `[1:v]scale=600:864:force_original_aspect_ratio=decrease,pad=600:864:(ow-iw)/2:(oh-ih)/2:color=0xE7F0EA[clip];[0:v][clip]overlay=60:174:shortest=1,fps=${VIDEO_FPS},setsar=1,format=yuv420p[v]`,
        '-map', '[v]',
        '-an',
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '24',
        '-pix_fmt', 'yuv420p',
        outputPath
    ]);
}

function buildVideoTimeline(payload) {
    const media = Array.isArray(payload?.galleryMedia)
        ? payload.galleryMedia.slice(0, MAX_MEDIA_COUNT)
        : [];
    const timeline = [{
        kind: 'text',
        duration: 2.4,
        eyebrow: payload?.date || '오늘의 기록',
        title: payload?.pageTitle || payload?.title || '오늘의 해빛 기록',
        body: payload?.subtitle || '',
        tags: payload?.tags || []
    }];

    media.forEach((item) => {
        const hasVideoSource = item?.type === 'video'
            && item?.url
            && (!item?.thumbUrl || item.url !== item.thumbUrl);
        const kind = hasVideoSource ? 'video' : 'image';

        timeline.push({
            kind,
            duration: kind === 'video' ? 5 : 2.5,
            url: kind === 'video' ? item.url : (item?.thumbUrl || item?.url || ''),
            fallbackUrl: item?.thumbUrl || '',
            category: item?.category || '해빛 기록',
            label: item?.label || '오늘의 기록',
            dateLabel: item?.dateLabel || ''
        });
    });

    const gratitudeEntries = Array.isArray(payload?.gratitudeEntries) && payload.gratitudeEntries.length > 0
        ? payload.gratitudeEntries
        : (payload?.gratitudeText ? [{ date: payload.date || '', text: payload.gratitudeText }] : []);

    gratitudeEntries.slice(0, 3).forEach((entry) => {
        timeline.push({
            kind: 'text',
            duration: 4,
            eyebrow: entry.date ? `${entry.date} 감사일기` : '감사일기',
            title: '감사한 마음을 기록했어요',
            body: `“${truncateText(entry.text, 150)}”`,
            tags: ['마음 습관'],
            accent: '#E44F36'
        });
    });

    timeline.push({
        kind: 'text',
        duration: 2.4,
        eyebrow: '오늘도 해빛 완료',
        title: '작은 기록을 계속 이어가요',
        body: '식단, 운동, 마음 습관을 해빛스쿨에서 함께 기록해 보세요.',
        tags: ['해빛스쿨']
    });

    return timeline;
}

function reportProgress(onProgress, progress, message) {
    try {
        onProgress(Math.max(0, Math.min(100, Math.round(progress))), message);
    } catch (_) {
        // Progress reporting must never interrupt rendering.
    }
}

async function renderHaebitVideo(payload, {
    downloadMedia = downloadRemoteMedia,
    onProgress = () => {}
} = {}) {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'haebit-video-'));

    try {
        reportProgress(onProgress, 3, '최근 3일 기록을 정리하고 있어요.');
        const timeline = buildVideoTimeline(payload);
        const segmentPaths = [];
        const segmentDurations = [];
        reportProgress(onProgress, 7, '사진과 영상 장면을 준비하고 있어요.');

        for (let index = 0; index < timeline.length; index += 1) {
            const item = timeline[index];
            const segmentPath = path.join(tempDir, `segment-${String(index).padStart(2, '0')}.mp4`);

            if (item.kind === 'text') {
                const slidePath = path.join(tempDir, `slide-${index}.png`);
                await renderTextSlide(slidePath, item);
                await createImageSegment(slidePath, segmentPath, item.duration);
                segmentPaths.push(segmentPath);
                segmentDurations.push(item.duration);
                reportProgress(
                    onProgress,
                    7 + (((index + 1) / timeline.length) * 66),
                    item.eyebrow?.includes('감사일기')
                        ? '감사일기 장면을 만들고 있어요.'
                        : '이야기 장면을 만들고 있어요.'
                );
                continue;
            }

            try {
                const sourcePath = path.join(tempDir, `source-${index}.${item.kind === 'video' ? 'mp4' : 'jpg'}`);
                await downloadMedia(item.url, sourcePath, item.kind);

                if (item.kind === 'video') {
                    const backgroundPath = path.join(tempDir, `video-frame-${index}.png`);
                    await renderMediaBackground(backgroundPath, item);
                    await createVideoSegment(sourcePath, backgroundPath, segmentPath);
                } else {
                    const slidePath = path.join(tempDir, `photo-${index}.png`);
                    await renderPhotoSlide(sourcePath, slidePath, item);
                    await createImageSegment(slidePath, segmentPath, item.duration);
                }
                segmentPaths.push(segmentPath);
                segmentDurations.push(item.duration);
            } catch (error) {
                if (item.kind !== 'video' || !item.fallbackUrl || item.fallbackUrl === item.url) {
                    console.warn(`[HaebitVideo] Skipped media ${index}:`, error.message);
                    continue;
                }

                try {
                    const fallbackPath = path.join(tempDir, `fallback-${index}.jpg`);
                    const slidePath = path.join(tempDir, `fallback-slide-${index}.png`);
                    await downloadMedia(item.fallbackUrl, fallbackPath, 'image');
                    await renderPhotoSlide(fallbackPath, slidePath, item);
                    await createImageSegment(slidePath, segmentPath, 2.5);
                    segmentPaths.push(segmentPath);
                    segmentDurations.push(2.5);
                } catch (fallbackError) {
                    console.warn(`[HaebitVideo] Skipped fallback ${index}:`, fallbackError.message);
                }
            }

            reportProgress(
                onProgress,
                7 + (((index + 1) / timeline.length) * 66),
                item.kind === 'video'
                    ? '운동 영상을 편집하고 있어요.'
                    : '기록 사진을 디자인하고 있어요.'
            );
        }

        if (segmentPaths.length === 0) {
            throw new Error('No video segments could be created.');
        }

        const concatPath = path.join(tempDir, 'segments.txt');
        const videoOnlyPath = path.join(tempDir, 'haebit-day-video.mp4');
        const bgmPath = path.join(tempDir, 'haebit-bgm.wav');
        const outputPath = path.join(tempDir, 'haebit-day.mp4');
        const concatBody = segmentPaths
            .map((segmentPath) => `file '${segmentPath.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`)
            .join('\n');
        await fs.writeFile(concatPath, concatBody, 'utf8');
        reportProgress(onProgress, 76, '장면을 한 편의 영상으로 잇고 있어요.');
        await runFfmpeg([
            '-y',
            '-f', 'concat',
            '-safe', '0',
            '-i', concatPath,
            '-c', 'copy',
            '-movflags', '+faststart',
            videoOnlyPath
        ]);

        const estimatedDuration = segmentDurations.reduce((sum, duration) => sum + duration, 0) + 0.5;
        reportProgress(onProgress, 86, '에너지 넘치는 배경음악을 만들고 있어요.');
        await fs.writeFile(bgmPath, buildEnergeticBgmWav(estimatedDuration));
        reportProgress(onProgress, 92, '영상과 음악을 합치고 있어요.');
        await runFfmpeg([
            '-y',
            '-i', videoOnlyPath,
            '-i', bgmPath,
            '-map', '0:v:0',
            '-map', '1:a:0',
            '-c:v', 'copy',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-shortest',
            '-movflags', '+faststart',
            outputPath
        ]);

        const output = await fs.readFile(outputPath);
        if (output.length === 0 || output.length > MAX_OUTPUT_BYTES) {
            throw new Error('Generated video is empty or too large.');
        }
        reportProgress(onProgress, 100, '하루 영상이 완성됐어요.');
        return output;
    } finally {
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
}

function pruneVideoJobs(now = Date.now()) {
    for (const [key, job] of videoJobs.entries()) {
        if (job.status !== 'processing' && job.expiresAt <= now) {
            videoJobs.delete(key);
        }
    }

    while (videoJobs.size > MAX_CACHE_ENTRIES) {
        const removable = [...videoJobs.entries()]
            .find(([, job]) => job.status !== 'processing');
        if (!removable) {
            break;
        }
        videoJobs.delete(removable[0]);
    }
}

function getHaebitVideoJobStatus(shareCode) {
    const key = String(shareCode || '').trim();
    const now = Date.now();
    pruneVideoJobs(now);
    const job = videoJobs.get(key);

    if (!job) {
        return {
            status: 'idle',
            progress: 0,
            message: '영상 제작을 시작할 준비가 됐어요.'
        };
    }

    return {
        status: job.status,
        progress: job.progress,
        message: job.message,
        startedAt: job.startedAt,
        updatedAt: job.updatedAt
    };
}

function getCompletedHaebitVideo(shareCode) {
    const key = String(shareCode || '').trim();
    pruneVideoJobs();
    const job = videoJobs.get(key);
    return job?.status === 'ready' ? job.buffer : null;
}

function startHaebitVideoJob(shareCode, payload, {
    renderVideo = renderHaebitVideo
} = {}) {
    const key = String(shareCode || '').trim();
    const now = Date.now();
    pruneVideoJobs(now);

    const existing = videoJobs.get(key);
    if (existing?.status === 'processing' || existing?.status === 'ready') {
        return getHaebitVideoJobStatus(key);
    }

    const job = {
        status: 'processing',
        progress: 1,
        message: '최근 3일 기록을 불러오고 있어요.',
        startedAt: new Date(now).toISOString(),
        updatedAt: new Date(now).toISOString(),
        expiresAt: now + VIDEO_CACHE_TTL_MS,
        buffer: null,
        promise: null
    };
    videoJobs.set(key, job);

    job.promise = renderVideo(payload, {
        onProgress(progress, message) {
            const activeJob = videoJobs.get(key);
            if (!activeJob || activeJob.status !== 'processing') {
                return;
            }
            activeJob.progress = Math.max(activeJob.progress, progress);
            activeJob.message = message || activeJob.message;
            activeJob.updatedAt = new Date().toISOString();
        }
    })
        .then((buffer) => {
            const activeJob = videoJobs.get(key);
            if (!activeJob) {
                return buffer;
            }
            activeJob.status = 'ready';
            activeJob.progress = 100;
            activeJob.message = '하루 영상이 완성됐어요.';
            activeJob.buffer = buffer;
            activeJob.updatedAt = new Date().toISOString();
            activeJob.expiresAt = Date.now() + VIDEO_CACHE_TTL_MS;
            pruneVideoJobs();
            return buffer;
        })
        .catch((error) => {
            const activeJob = videoJobs.get(key);
            if (activeJob) {
                activeJob.status = 'error';
                activeJob.message = '영상 제작 중 문제가 생겼어요. 다시 시도해 주세요.';
                activeJob.updatedAt = new Date().toISOString();
                activeJob.expiresAt = Date.now() + (5 * 60 * 1000);
                activeJob.error = error;
            }
            console.error('[HaebitVideo] background render error:', error);
            return null;
        });

    return getHaebitVideoJobStatus(key);
}

async function renderCachedHaebitVideo(shareCode, payload) {
    const key = String(shareCode || '').trim();
    startHaebitVideoJob(key, payload);
    const job = videoJobs.get(key);

    if (job.status === 'ready') {
        return job.buffer;
    }

    const buffer = await job.promise;
    if (!buffer) {
        throw job.error || new Error('Video generation failed.');
    }
    return buffer;
}

module.exports = {
    buildEnergeticBgmWav,
    buildVideoTimeline,
    isAllowedMediaUrl,
    renderHaebitVideo,
    renderCachedHaebitVideo,
    startHaebitVideoJob,
    getHaebitVideoJobStatus,
    getCompletedHaebitVideo
};
