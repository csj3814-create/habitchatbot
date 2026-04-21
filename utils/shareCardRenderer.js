const path = require('node:path');

const axios = require('axios');
const fontkit = require('fontkit');
const sharp = require('sharp');

const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1080;
const MEDIA_RADIUS = 34;
const MEDIA_PANEL = { left: 48, top: 300, width: 984, height: 540 };
const MEDIA_GAP = 20;
const TAG_ROW_Y = 852;
const NOTE_PANEL = { left: 48, top: 904, width: 984, height: 136 };
const FONT_FILES = {
    regular: path.join(__dirname, '..', 'assets', 'fonts', 'NotoSansCJKkr-Regular.otf'),
    bold: path.join(__dirname, '..', 'assets', 'fonts', 'NotoSansCJKkr-Bold.otf')
};

const loadedFonts = new Map();

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
        const xOffsetUnits = position.xOffset;
        const yOffsetUnits = position.yOffset;
        const pathData = glyph.path.toSVG();
        const pathSvg = `<path d="${pathData}" transform="translate(${startXUnits + cursorUnits + xOffsetUnits} ${yOffsetUnits})" />`;
        cursorUnits += position.xAdvance;
        return pathSvg;
    }).join('');

    return `
        <g transform="translate(0 ${y}) scale(${scale} -${scale})" fill="${fill}"${opacity < 1 ? ` fill-opacity="${opacity}"` : ''}>
            ${paths}
        </g>
    `;
}

function buildPill(text, x, y, tone = 'light') {
    const fontSize = 22;
    const width = Math.max(126, Math.min(280, Math.ceil(getTextWidth(text, fontSize, 'bold') + 48)));
    const fill = tone === 'accent' ? 'rgba(251,191,36,0.20)' : 'rgba(255,255,255,0.12)';
    const stroke = tone === 'accent' ? 'rgba(251,191,36,0.38)' : 'rgba(255,255,255,0.16)';
    const color = tone === 'accent' ? '#FEF3C7' : '#F8FAFC';

    return `
        <g transform="translate(${x} ${y})">
            <rect width="${width}" height="52" rx="26" fill="${fill}" stroke="${stroke}" />
            ${buildTextPath(text, {
                x: width / 2,
                y: 34,
                fontSize,
                fill: color,
                weight: 'bold',
                align: 'center'
            })}
        </g>
    `;
}

function buildTag(tag, x, y) {
    const text = truncateText(tag, 12);
    const fontSize = 18;
    const width = Math.max(112, Math.min(240, Math.ceil(getTextWidth(text, fontSize, 'bold') + 38)));

    return `
        <g transform="translate(${x} ${y})">
            <rect width="${width}" height="44" rx="22" fill="rgba(15,23,42,0.68)" stroke="rgba(255,255,255,0.08)" />
            ${buildTextPath(text, {
                x: width / 2,
                y: 28,
                fontSize,
                fill: '#F8FAFC',
                weight: 'bold',
                align: 'center'
            })}
        </g>
    `;
}

function centerInRange(start, span, content) {
    return start + Math.floor((span - content) / 2);
}

function getMediaFrames(count) {
    if (count <= 1) {
        const size = 540;
        return [{
            left: centerInRange(MEDIA_PANEL.left, MEDIA_PANEL.width, size),
            top: MEDIA_PANEL.top,
            width: size,
            height: size
        }];
    }

    if (count === 2) {
        const size = 460;
        const left = centerInRange(MEDIA_PANEL.left, MEDIA_PANEL.width, (size * 2) + MEDIA_GAP);
        const top = centerInRange(MEDIA_PANEL.top, MEDIA_PANEL.height, size);
        return [
            { left, top, width: size, height: size },
            { left: left + size + MEDIA_GAP, top, width: size, height: size }
        ];
    }

    if (count === 3) {
        const large = 540;
        const small = 260;
        const left = centerInRange(MEDIA_PANEL.left, MEDIA_PANEL.width, large + MEDIA_GAP + small);
        return [
            { left, top: MEDIA_PANEL.top, width: large, height: large },
            { left: left + large + MEDIA_GAP, top: MEDIA_PANEL.top, width: small, height: small },
            {
                left: left + large + MEDIA_GAP,
                top: MEDIA_PANEL.top + small + MEDIA_GAP,
                width: small,
                height: small
            }
        ];
    }

    const size = 260;
    const left = centerInRange(MEDIA_PANEL.left, MEDIA_PANEL.width, (size * 2) + MEDIA_GAP);
    return [
        { left, top: MEDIA_PANEL.top, width: size, height: size },
        { left: left + size + MEDIA_GAP, top: MEDIA_PANEL.top, width: size, height: size },
        { left, top: MEDIA_PANEL.top + size + MEDIA_GAP, width: size, height: size },
        {
            left: left + size + MEDIA_GAP,
            top: MEDIA_PANEL.top + size + MEDIA_GAP,
            width: size,
            height: size
        }
    ];
}

function buildBaseSvg(payload, frames) {
    const pills = [];
    let pillX = 72;

    if (payload.date) {
        pills.push(buildPill(payload.date, pillX, 244));
        pillX += Math.max(126, Math.min(280, Math.ceil(getTextWidth(payload.date, 22, 'bold') + 48))) + 14;
    }

    if (payload.points !== null && payload.points !== undefined) {
        const pointLabel = `${payload.points}P`;
        pills.push(buildPill(pointLabel, pillX, 244, 'accent'));
        pillX += Math.max(126, Math.min(280, Math.ceil(getTextWidth(pointLabel, 22, 'bold') + 48))) + 14;
    }

    if (payload.currentStreak > 0) {
        const streakLabel = `${payload.currentStreak}일 연속`;
        pills.push(buildPill(streakLabel, pillX, 244));
    }

    const quoteLines = wrapTextLines(
        payload.gratitudeText
            ? `“${truncateText(payload.gratitudeText, 94)}”`
            : '좋은 흐름, 같이 이어가요.',
        28,
        2
    );

    let tagX = 72;
    const tagSvg = (payload.tags || []).slice(0, 4).map((tag) => {
        const text = truncateText(tag, 12);
        const width = Math.max(112, Math.min(240, Math.ceil(getTextWidth(text, 18, 'bold') + 38)));
        const svg = buildTag(tag, tagX, TAG_ROW_Y);
        tagX += width + 12;
        return svg;
    }).join('');

    const frameSvg = frames.map((frame) => `
        <rect x="${frame.left}" y="${frame.top}" width="${frame.width}" height="${frame.height}" rx="${MEDIA_RADIUS}" fill="rgba(255,255,255,0.06)" />
    `).join('');

    return `
        <svg width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#0B1220" />
                    <stop offset="52%" stop-color="#18273E" />
                    <stop offset="100%" stop-color="#22334C" />
                </linearGradient>
                <linearGradient id="panel" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="rgba(255,255,255,0.14)" />
                    <stop offset="100%" stop-color="rgba(255,255,255,0.08)" />
                </linearGradient>
                <linearGradient id="note" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#F8FAFC" />
                    <stop offset="100%" stop-color="#E2E8F0" />
                </linearGradient>
                <radialGradient id="amber" cx="0%" cy="100%" r="100%">
                    <stop offset="0%" stop-color="rgba(251,191,36,0.55)" />
                    <stop offset="100%" stop-color="rgba(251,191,36,0)" />
                </radialGradient>
                <radialGradient id="sky" cx="100%" cy="0%" r="100%">
                    <stop offset="0%" stop-color="rgba(96,165,250,0.22)" />
                    <stop offset="100%" stop-color="rgba(96,165,250,0)" />
                </radialGradient>
            </defs>

            <rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" rx="56" fill="url(#bg)" />
            <rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" rx="56" fill="url(#amber)" />
            <rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" rx="56" fill="url(#sky)" />

            <circle cx="930" cy="116" r="176" fill="rgba(148,163,184,0.12)" />
            <circle cx="160" cy="1010" r="210" fill="rgba(251,191,36,0.18)" />
            <circle cx="872" cy="154" r="72" fill="rgba(255,255,255,0.04)" />

            ${buildTextPath('HABIT SCHOOL', { x: 72, y: 92, fontSize: 24, fill: '#CBD5E1', weight: 'bold' })}
            ${buildTextPath('DAILY SHARE', { x: 72, y: 136, fontSize: 18, fill: '#F59E0B', weight: 'bold' })}
            ${buildTextPath(truncateText(payload.title, 28), { x: 72, y: 204, fontSize: 62, fill: '#F8FAFC', weight: 'bold' })}

            ${pills.join('')}

            <rect
                x="${MEDIA_PANEL.left}"
                y="${MEDIA_PANEL.top}"
                width="${MEDIA_PANEL.width}"
                height="${MEDIA_PANEL.height}"
                rx="40"
                fill="url(#panel)"
                stroke="rgba(255,255,255,0.08)"
            />
            ${frameSvg}

            ${tagSvg}

            <rect
                x="${NOTE_PANEL.left}"
                y="${NOTE_PANEL.top}"
                width="${NOTE_PANEL.width}"
                height="${NOTE_PANEL.height}"
                rx="36"
                fill="url(#note)"
            />
            ${buildTextPath('오늘 남긴 한 줄', { x: 72, y: 946, fontSize: 24, fill: '#334155', weight: 'bold' })}
            ${quoteLines.map((line, index) => buildTextPath(line, {
                x: 72,
                y: 986 + (index * 32),
                fontSize: 28,
                fill: '#0F172A',
                weight: 'bold'
            })).join('')}
        </svg>
    `;
}

function buildPlaceholderTile(item, frame) {
    const isVideo = item?.type === 'video';
    const accent = isVideo ? '#60A5FA' : '#F59E0B';
    const icon = isVideo
        ? `<path d="M${frame.width / 2 - 32} ${frame.height / 2 - 44} L${frame.width / 2 + 44} ${frame.height / 2} L${frame.width / 2 - 32} ${frame.height / 2 + 44} Z" fill="#FFFFFF" fill-opacity="0.88" />`
        : `<circle cx="${frame.width / 2}" cy="${frame.height / 2}" r="36" fill="#FFFFFF" fill-opacity="0.82" />`;

    return Buffer.from(`
        <svg width="${frame.width}" height="${frame.height}" viewBox="0 0 ${frame.width} ${frame.height}" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="placeholder" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#18273E" />
                    <stop offset="100%" stop-color="#31445F" />
                </linearGradient>
            </defs>
            <rect width="${frame.width}" height="${frame.height}" rx="${MEDIA_RADIUS}" fill="url(#placeholder)" />
            <circle cx="${Math.max(72, frame.width * 0.22)}" cy="${Math.max(72, frame.height * 0.22)}" r="${Math.min(52, frame.width * 0.14)}" fill="${accent}" fill-opacity="0.2" />
            <circle cx="${frame.width * 0.82}" cy="${frame.height * 0.78}" r="${Math.min(68, frame.width * 0.18)}" fill="#FFFFFF" fill-opacity="0.06" />
            <rect x="${frame.width / 2 - 68}" y="${frame.height / 2 - 68}" width="136" height="136" rx="40" fill="${accent}" fill-opacity="0.2" />
            ${icon}
        </svg>
    `);
}

function buildMediaOverlaySvg(frames) {
    return Buffer.from(`
        <svg width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
            ${frames.map((frame) => `
                <rect
                    x="${frame.left}"
                    y="${frame.top}"
                    width="${frame.width}"
                    height="${frame.height}"
                    rx="${MEDIA_RADIUS}"
                    fill="none"
                    stroke="rgba(255,255,255,0.14)"
                    stroke-width="2"
                />
            `).join('')}
        </svg>
    `);
}

async function fetchRemoteBuffer(url) {
    const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 12000,
        maxContentLength: 20 * 1024 * 1024
    });
    return Buffer.from(response.data);
}

async function applyRoundedMask(buffer, width, height) {
    const mask = Buffer.from(`
        <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
            <rect width="${width}" height="${height}" rx="${MEDIA_RADIUS}" ry="${MEDIA_RADIUS}" fill="#ffffff"/>
        </svg>
    `);

    return sharp({
        create: {
            width,
            height,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 }
        }
    })
        .composite([
            { input: buffer, left: 0, top: 0 },
            { input: mask, blend: 'dest-in' }
        ])
        .png()
        .toBuffer();
}

async function renderMediaTile(item, frame) {
    try {
        if (!item?.url || item?.type === 'video') {
            return buildPlaceholderTile(item, frame);
        }

        const remoteBuffer = await fetchRemoteBuffer(item.url);
        const fitted = await sharp(remoteBuffer)
            .rotate()
            .resize(frame.width, frame.height, { fit: 'cover', position: 'centre' })
            .png()
            .toBuffer();

        return applyRoundedMask(fitted, frame.width, frame.height);
    } catch (_) {
        return buildPlaceholderTile(item, frame);
    }
}

async function renderShareCardPng(payload) {
    const safePayload = {
        title: payload?.title || '오늘의 해빛 루틴',
        subtitle: payload?.subtitle || '',
        date: payload?.date || '',
        points: payload?.points ?? null,
        tags: Array.isArray(payload?.tags) ? payload.tags : [],
        gratitudeText: payload?.gratitudeText || '',
        meditationDone: payload?.meditationDone === true,
        currentStreak: Number(payload?.currentStreak || 0),
        media: Array.isArray(payload?.media) && payload.media.length > 0
            ? payload.media.slice(0, 4)
            : [{ category: '공유', type: 'image', url: '' }]
    };

    const frames = getMediaFrames(Math.min(safePayload.media.length, 4));
    const base = sharp(Buffer.from(buildBaseSvg(safePayload, frames))).png();
    const composites = [];

    for (let index = 0; index < frames.length; index += 1) {
        const frame = frames[index];
        const item = safePayload.media[index] || { category: '공유', type: 'image', url: '' };
        const tile = await renderMediaTile(item, frame);
        composites.push({ input: tile, left: frame.left, top: frame.top });
    }

    composites.push({ input: buildMediaOverlaySvg(frames), left: 0, top: 0 });

    return base
        .composite(composites)
        .png()
        .toBuffer();
}

module.exports = {
    renderShareCardPng
};
