/**
 * !업데이트 — the newest entry of the app's CHANGELOG.md, shaped for the room.
 *
 * The app repo keeps CHANGELOG.md and the public changelog page in step, so
 * the markdown is the source and the page is the "자세히 보기" link.
 *
 * Read through the GitHub contents API first: raw.githubusercontent.com is
 * cached for 5 minutes and ignores cache-busting queries, and this command is
 * run right after a changelog push. The API allows 60 unauthenticated calls an
 * hour per IP, so raw stays as the fallback.
 */

const axios = require('axios');

const CHANGELOG_SOURCES = [
    {
        url: 'https://api.github.com/repos/csj3814-create/habitschool/contents/CHANGELOG.md?ref=main',
        headers: { accept: 'application/vnd.github.raw+json' }
    },
    {
        url: 'https://raw.githubusercontent.com/csj3814-create/habitschool/main/CHANGELOG.md',
        headers: {}
    }
];
const CHANGELOG_PAGE_URL = 'https://habitschool.web.app/changelog';
const FETCH_TIMEOUT_MS = 5000;

const TAG_ICONS = { 신규: '🆕', 개선: '✨', 수정: '🔧' };
const HEADING = /^##\s+(v\d+)\s*·\s*(\d{4})-(\d{2})-(\d{2})\s*[—-]\s*(.+?)\s*$/;
const TAGGED_ITEM = /^\[([^\]]+)\]\s*(.*)$/;

async function fetchChangelog({ client = axios } = {}) {
    let lastError;
    for (const source of CHANGELOG_SOURCES) {
        try {
            const response = await client.get(source.url, {
                headers: { 'user-agent': 'habitchatbot/1.0', ...source.headers },
                responseType: 'text',
                timeout: FETCH_TIMEOUT_MS
            });
            return String(response.data);
        } catch (error) {
            lastError = error;
            console.warn(`[Changelog] ${source.url} failed:`, error.message);
        }
    }
    throw lastError;
}

// "**[개선]** **점수가 같은 기준으로 매겨집니다.** 설명..." -> first sentence only.
function summarizeItem(line) {
    const text = line.replace(/^-\s*/, '').replace(/\*\*/g, '').trim();
    const tagged = text.match(TAGGED_ITEM);
    const tag = tagged ? tagged[1].trim() : '';
    const body = tagged ? tagged[2] : text;
    const firstSentence = body.match(/^.*?[.!?](?=\s|$)/);

    return { tag, text: (firstSentence ? firstSentence[0] : body).trim() };
}

function parseLatestRelease(markdown) {
    const lines = String(markdown || '').split(/\r?\n/);
    const start = lines.findIndex((line) => HEADING.test(line));
    if (start === -1) return null;

    const [, version, , month, day, title] = lines[start].match(HEADING);
    const items = [];
    for (const line of lines.slice(start + 1)) {
        if (line.startsWith('## ')) break;
        if (/^-\s+/.test(line)) items.push(summarizeItem(line));
    }

    return { version, date: `${Number(month)}/${Number(day)}`, title, items };
}

function formatRelease(release) {
    const lines = [`📢 해빛스쿨 ${release.version} 업데이트 (${release.date})`, release.title, ''];
    for (const item of release.items) {
        lines.push(`${TAG_ICONS[item.tag] || '•'} ${item.text}`);
    }
    lines.push('', `자세히 보기: ${CHANGELOG_PAGE_URL}`);
    return lines.join('\n');
}

async function handleChangelog(options = {}) {
    try {
        const release = parseLatestRelease(await fetchChangelog(options));
        if (!release) {
            return '업데이트 내용을 찾지 못했어요.\nCHANGELOG.md 맨 위 형식을 확인해 주세요.';
        }
        return formatRelease(release);
    } catch (error) {
        console.warn('[Changelog] Could not load the changelog:', error.message);
        return `업데이트 내용을 불러오지 못했어요.\n${CHANGELOG_PAGE_URL} 에서 확인해 주세요.`;
    }
}

module.exports = { fetchChangelog, formatRelease, handleChangelog, parseLatestRelease };
