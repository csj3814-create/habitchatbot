/**
 * YouTube playlist RSS helpers.
 */

const axios = require('axios');
const { XMLParser } = require('fast-xml-parser');

const YOUTUBE_WATCH_BASE = 'https://www.youtube.com/watch?v=';

function trimText(value) {
    return String(value || '').trim();
}

function toArray(value) {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
}

function getText(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string' || typeof value === 'number') return trimText(value);
    if (typeof value === 'object') {
        return trimText(value['#text'] || value.__text || value.text || '');
    }
    return '';
}

function buildPlaylistFeedUrl(playlistId) {
    const normalized = trimText(playlistId);
    if (!normalized) {
        throw new Error('YouTube playlist id is required.');
    }

    return `https://www.youtube.com/feeds/videos.xml?playlist_id=${encodeURIComponent(normalized)}`;
}

function parseYouTubePlaylistFeed(xml) {
    const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '',
        trimValues: true
    });
    const parsed = parser.parse(String(xml || ''));
    const feed = parsed?.feed;
    const entries = toArray(feed?.entry);

    return entries
        .map((entry) => {
            const videoId = trimText(entry?.['yt:videoId']);
            if (!videoId) return null;

            const mediaGroup = entry?.['media:group'] || {};
            const link = Array.isArray(entry?.link) ? entry.link[0] : entry?.link;
            const author = entry?.author || {};
            const title = getText(entry?.title);
            const description = getText(mediaGroup?.['media:description']);
            const published = trimText(entry?.published);
            const updated = trimText(entry?.updated);
            const url = trimText(link?.href) || `${YOUTUBE_WATCH_BASE}${videoId}`;
            const thumbnail = mediaGroup?.['media:thumbnail'];
            const thumbnailUrl = trimText(Array.isArray(thumbnail) ? thumbnail[0]?.url : thumbnail?.url);

            return {
                videoId,
                title,
                url,
                author: getText(author?.name),
                channelUrl: trimText(author?.uri),
                published,
                updated,
                description,
                thumbnailUrl
            };
        })
        .filter(Boolean)
        .sort((a, b) => String(b.published || '').localeCompare(String(a.published || '')));
}

async function fetchYouTubePlaylistVideos(playlistId, options = {}) {
    const url = buildPlaylistFeedUrl(playlistId);
    const client = options.client || axios;
    const response = await client.get(url, {
        responseType: 'text',
        timeout: options.timeoutMs || 10000,
        headers: {
            'user-agent': 'habitchatbot/1.0'
        }
    });

    return parseYouTubePlaylistFeed(response.data);
}

module.exports = {
    buildPlaylistFeedUrl,
    fetchYouTubePlaylistVideos,
    parseYouTubePlaylistFeed
};
