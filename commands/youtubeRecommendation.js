/**
 * Daily recommendation from the configured YouTube playlist.
 */

const admin = require('firebase-admin');

const config = require('../config');
const { fetchYouTubePlaylistVideos } = require('../utils/youtubePlaylist');

const HISTORY_ROOT = 'daily_youtube_recommendations';

function trimText(value) {
    return String(value || '').trim();
}

function formatKstDate(date = new Date()) {
    return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
}

function sanitizeFirebaseKey(value) {
    return trimText(value).replace(/[.#$\/\[\]]/g, '_');
}

function normalizeSummaryText(text, limit = 120) {
    const cleaned = trimText(text)
        .replace(/https?:\/\/\S+/g, '')
        .replace(/#[^\s#]+/g, '')
        .replace(/\s+/g, ' ');

    if (!cleaned) return '';
    if (cleaned.length <= limit) return cleaned;

    const sliced = cleaned.slice(0, limit);
    const lastSpace = sliced.lastIndexOf(' ');
    const safeEnd = lastSpace > 60 ? lastSpace : limit;
    return `${sliced.slice(0, safeEnd).trimEnd()}...`;
}

function getHistoryPath(playlistId) {
    return `${HISTORY_ROOT}/${sanitizeFirebaseKey(playlistId)}`;
}

function getDb(options = {}) {
    return options.db || admin.database();
}

async function loadRecommendationHistory(db, playlistId) {
    const snapshot = await db.ref(getHistoryPath(playlistId)).once('value');
    return snapshot.val() || {};
}

function selectVideoForDate(videos, history, dateStr) {
    const todayEntry = history?.dates?.[dateStr];
    if (todayEntry?.videoId) {
        const currentVideo = videos.find((video) => video.videoId === todayEntry.videoId);
        return {
            video: currentVideo || todayEntry,
            reused: true
        };
    }

    const recommendedVideos = history?.videos || {};
    const nextVideo = videos.find((video) => !recommendedVideos[video.videoId]);

    return {
        video: nextVideo || null,
        reused: false
    };
}

async function saveRecommendation(db, playlistId, dateStr, video) {
    const path = getHistoryPath(playlistId);
    const entry = {
        videoId: video.videoId,
        title: video.title || '',
        url: video.url || '',
        author: video.author || '',
        published: video.published || '',
        recommendedAt: new Date().toISOString()
    };

    await db.ref(path).update({
        [`dates/${dateStr}`]: entry,
        [`videos/${video.videoId}`]: {
            firstRecommendedDate: dateStr,
            title: entry.title,
            url: entry.url,
            author: entry.author,
            published: entry.published
        }
    });

    return entry;
}

function buildYoutubeRecommendationMessage(video, options = {}) {
    const title = trimText(video?.title) || '추천 영상';
    const author = trimText(video?.author);
    const description = normalizeSummaryText(video?.description || title);
    const url = trimText(video?.url) || `https://www.youtube.com/watch?v=${video?.videoId || ''}`;
    const heading = options.heading || '오늘의 추천 영상';
    const lines = [heading, title];

    if (author) {
        lines.push(`채널: ${author}`);
    }

    if (description && description !== title) {
        lines.push(description);
    }

    if (url) {
        lines.push(url);
    }

    return lines.join('\n');
}

async function handleYoutubeRecommendation(options = {}) {
    const enabled = options.enabled ?? config.DAILY_YOUTUBE_RECOMMENDATION_ENABLED;
    if (!enabled) {
        return options.silentWhenDisabled ? '' : '오늘의 영상 추천 기능이 꺼져 있어요.';
    }

    const playlistId = options.playlistId || config.DAILY_YOUTUBE_PLAYLIST_ID;
    const dateStr = options.dateStr || formatKstDate(options.now || new Date());

    try {
        const videos = await (options.fetchVideos || fetchYouTubePlaylistVideos)(playlistId);
        if (!Array.isArray(videos) || videos.length === 0) {
            return '오늘의 추천 영상을 찾지 못했어요.\n플레이리스트에 공개 영상이 있는지 확인해 주세요.';
        }

        const db = getDb(options);
        const history = await loadRecommendationHistory(db, playlistId);
        const { video, reused } = selectVideoForDate(videos, history, dateStr);

        if (!video) {
            return '오늘의 추천 영상\n아직 새로 추천할 영상이 없어요. 플레이리스트에 새 영상이 올라오면 다시 소개할게요.';
        }

        const selected = reused ? video : await saveRecommendation(db, playlistId, dateStr, video);
        const fullVideo = videos.find((item) => item.videoId === selected.videoId) || selected;

        return buildYoutubeRecommendationMessage(fullVideo);
    } catch (error) {
        console.warn('[YouTubeRecommendation] Failed to build recommendation:', error.message);
        return '오늘의 추천 영상을 불러오지 못했어요.\n잠시 뒤 !영상추천 으로 다시 확인해 주세요.';
    }
}

module.exports = {
    buildYoutubeRecommendationMessage,
    formatKstDate,
    getHistoryPath,
    handleYoutubeRecommendation,
    loadRecommendationHistory,
    saveRecommendation,
    selectVideoForDate
};
