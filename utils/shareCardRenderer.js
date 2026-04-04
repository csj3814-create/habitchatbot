const axios = require('axios');
const sharp = require('sharp');

const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1080;
const MEDIA_RADIUS = 28;
const FONT_STACK = "Noto Sans CJK KR, Apple SD Gothic Neo, Malgun Gothic, sans-serif";

function escapeXml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function truncateText(value, limit) {
    const text = String(value || '').trim();
    if (text.length <= limit) {
        return text;
    }
    return `${text.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

function wrapTextLines(value, lineLength, maxLines) {
    const words = String(value || '').trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
        return [];
    }

    const lines = [];
    let current = '';

    words.forEach((word) => {
        const next = current ? `${current} ${word}` : word;
        if (next.length <= lineLength) {
            current = next;
            return;
        }

        if (current) {
            lines.push(current);
        }
        current = word;
    });

    if (current) {
        lines.push(current);
    }

    const wasTrimmed = lines.length > maxLines;
    return lines.slice(0, maxLines).map((line, index) => (
        index === maxLines - 1 && wasTrimmed
            ? truncateText(line, Math.max(4, lineLength - 1))
            : truncateText(line, lineLength)
    ));
}

function getMediaFrames(count) {
    if (count <= 1) {
        return [{ left: 60, top: 332, width: 960, height: 500 }];
    }

    if (count === 2) {
        return [
            { left: 60, top: 332, width: 468, height: 500 },
            { left: 552, top: 332, width: 468, height: 500 }
        ];
    }

    if (count === 3) {
        return [
            { left: 60, top: 332, width: 540, height: 500 },
            { left: 624, top: 332, width: 396, height: 242 },
            { left: 624, top: 590, width: 396, height: 242 }
        ];
    }

    return [
        { left: 60, top: 332, width: 468, height: 242 },
        { left: 552, top: 332, width: 468, height: 242 },
        { left: 60, top: 590, width: 468, height: 242 },
        { left: 552, top: 590, width: 468, height: 242 }
    ];
}

function buildPill(text, x, y, width) {
    return `
        <g transform="translate(${x} ${y})">
            <rect width="${width}" height="48" rx="24" fill="rgba(255,255,255,0.16)" stroke="rgba(255,255,255,0.18)" />
            <text x="${width / 2}" y="31" text-anchor="middle" font-family="${FONT_STACK}" font-size="20" font-weight="700" fill="#F7FAFC">${escapeXml(text)}</text>
        </g>
    `;
}

function buildTag(tag, x, y) {
    const display = truncateText(tag, 12);
    const width = Math.max(108, Math.min(220, 42 + (display.length * 18)));
    return `
        <g transform="translate(${x} ${y})">
            <rect width="${width}" height="42" rx="21" fill="rgba(11,18,32,0.78)" />
            <text x="${width / 2}" y="27" text-anchor="middle" font-family="${FONT_STACK}" font-size="18" font-weight="700" fill="#F8FAFC">${escapeXml(display)}</text>
        </g>
    `;
}

function buildBaseSvg(payload) {
    const pills = [];
    let pillX = 60;

    if (payload.date) {
        pills.push(buildPill(payload.date, pillX, 244, 176));
        pillX += 192;
    }

    if (payload.points !== null && payload.points !== undefined) {
        pills.push(buildPill(`${payload.points}P`, pillX, 244, 132));
    }

    const tags = (payload.tags || []).slice(0, 4);
    let tagX = 60;
    const tagSvg = tags.map((tag) => {
        const display = truncateText(tag, 12);
        const width = Math.max(108, Math.min(220, 42 + (display.length * 18)));
        const svg = buildTag(display, tagX, 840);
        tagX += width + 12;
        return svg;
    }).join('');

    const subtitleLines = wrapTextLines(payload.subtitle, 30, 2);
    const quote = truncateText(payload.gratitudeText || (payload.meditationDone ? '오늘의 마음 기록도 함께 담았어요.' : ''), 82);
    const quoteLines = wrapTextLines(`“${quote}”`, 42, 2);
    const footer = quote
        ? `
            <text x="60" y="932" font-family="${FONT_STACK}" font-size="26" font-weight="700" fill="#0F172A">오늘 남긴 한 줄</text>
            ${quoteLines.map((line, index) => `
                <text x="60" y="${970 + (index * 30)}" font-family="${FONT_STACK}" font-size="22" font-weight="600" fill="#334155">${escapeXml(line)}</text>
            `).join('')}
          `
        : `
            <text x="60" y="960" font-family="${FONT_STACK}" font-size="26" font-weight="700" fill="#334155">좋은 흐름, 같이 이어가요.</text>
          `;

    return `
        <svg width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#0F172A" />
                    <stop offset="45%" stop-color="#1E293B" />
                    <stop offset="100%" stop-color="#334155" />
                </linearGradient>
                <linearGradient id="panel" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#F8FAFC" stop-opacity="0.96" />
                    <stop offset="100%" stop-color="#E2E8F0" stop-opacity="0.92" />
                </linearGradient>
            </defs>

            <rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" rx="52" fill="url(#bg)" />
            <circle cx="958" cy="122" r="180" fill="rgba(148,163,184,0.18)" />
            <circle cx="128" cy="1000" r="220" fill="rgba(251,191,36,0.10)" />

            <text x="60" y="84" font-family="${FONT_STACK}" font-size="26" font-weight="800" fill="#CBD5E1" letter-spacing="3">HABIT SCHOOL</text>
            <text x="60" y="158" font-family="${FONT_STACK}" font-size="54" font-weight="900" fill="#F8FAFC">${escapeXml(truncateText(payload.title, 24))}</text>
            ${subtitleLines.map((line, index) => `
                <text x="60" y="${208 + (index * 32)}" font-family="${FONT_STACK}" font-size="26" font-weight="600" fill="#CBD5E1">${escapeXml(line)}</text>
            `).join('')}

            ${pills.join('')}

            <rect x="40" y="312" width="1000" height="544" rx="36" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.1)" />
            ${tagSvg}

            <rect x="40" y="880" width="1000" height="140" rx="34" fill="url(#panel)" />
            ${footer}
        </svg>
    `;
}

function buildPlaceholderTile(item, frame) {
    const label = item?.type === 'video' ? `${item.category} 영상` : `${item?.category || '공유'} 기록`;
    return Buffer.from(`
        <svg width="${frame.width}" height="${frame.height}" viewBox="0 0 ${frame.width} ${frame.height}" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#1E293B" />
                    <stop offset="100%" stop-color="#475569" />
                </linearGradient>
            </defs>
            <rect width="${frame.width}" height="${frame.height}" rx="${MEDIA_RADIUS}" fill="url(#g)" />
            <circle cx="${frame.width / 2}" cy="${Math.max(92, frame.height / 2 - 24)}" r="${Math.min(48, frame.width / 8)}" fill="rgba(255,255,255,0.12)" />
            <text x="${frame.width / 2}" y="${Math.max(102, frame.height / 2 - 14)}" text-anchor="middle" font-family="${FONT_STACK}" font-size="34" font-weight="800" fill="#E2E8F0">${item?.type === 'video' ? '▶' : '·'}</text>
            <text x="${frame.width / 2}" y="${Math.max(162, frame.height / 2 + 28)}" text-anchor="middle" font-family="${FONT_STACK}" font-size="24" font-weight="700" fill="#F8FAFC">${escapeXml(label)}</text>
            <text x="${frame.width / 2}" y="${Math.max(198, frame.height / 2 + 64)}" text-anchor="middle" font-family="${FONT_STACK}" font-size="18" font-weight="600" fill="#CBD5E1">이미지를 불러오지 못해 카드로 대체했어요.</text>
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
        if (item?.type === 'video') {
            return buildPlaceholderTile(item, frame);
        }

        const remoteBuffer = await fetchRemoteBuffer(item.url);
        const fitted = await sharp(remoteBuffer)
            .rotate()
            .resize(frame.width, frame.height, { fit: 'cover', position: 'centre' })
            .png()
            .toBuffer();

        return applyRoundedMask(fitted, frame.width, frame.height);
    } catch (error) {
        return buildPlaceholderTile(item, frame);
    }
}

function buildMediaLabel(item, frame) {
    const text = truncateText(item?.type === 'video' ? `${item.category} 영상` : item?.category || '기록', 10);
    const width = Math.max(94, Math.min(180, 42 + (text.length * 18)));

    return Buffer.from(`
        <svg width="${frame.width}" height="${frame.height}" viewBox="0 0 ${frame.width} ${frame.height}" xmlns="http://www.w3.org/2000/svg">
            <g transform="translate(18 ${frame.height - 58})">
                <rect width="${width}" height="40" rx="20" fill="rgba(15,23,42,0.75)" />
                <text x="${width / 2}" y="26" text-anchor="middle" font-family="${FONT_STACK}" font-size="18" font-weight="700" fill="#F8FAFC">${escapeXml(text)}</text>
            </g>
        </svg>
    `);
}

async function renderShareCardPng(payload) {
    const safePayload = {
        title: payload?.title || '오늘의 해빛 루틴',
        subtitle: payload?.subtitle || '오늘의 해빛 흐름을 카드로 정리했어요.',
        date: payload?.date || '',
        points: payload?.points ?? null,
        tags: Array.isArray(payload?.tags) ? payload.tags : [],
        gratitudeText: payload?.gratitudeText || '',
        meditationDone: payload?.meditationDone === true,
        media: Array.isArray(payload?.media) && payload.media.length > 0
            ? payload.media.slice(0, 4)
            : [{ category: '공유', type: 'image', url: '' }]
    };

    const base = sharp(Buffer.from(buildBaseSvg(safePayload))).png();
    const composites = [];
    const frames = getMediaFrames(Math.min(safePayload.media.length, 4));

    for (let index = 0; index < frames.length; index += 1) {
        const frame = frames[index];
        const item = safePayload.media[index] || { category: '공유', type: 'image', url: '' };
        const tile = await renderMediaTile(item, frame);
        const label = buildMediaLabel(item, frame);

        composites.push({ input: tile, left: frame.left, top: frame.top });
        composites.push({ input: label, left: frame.left, top: frame.top });
    }

    return base
        .composite(composites)
        .png()
        .toBuffer();
}

module.exports = {
    renderShareCardPng
};
