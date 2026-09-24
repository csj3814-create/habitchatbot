/**
 * Refresh data/videoCatalog.json from the two 출연 영상 playlists.
 * Runs weekly in .github/workflows/update-video-catalog.yml; run it by hand
 * to pick up a new video sooner.
 *
 *   node scripts/update_video_catalog.js
 *
 * These playlists use the short `PL` + 11 id format, which YouTube's RSS feed
 * rejects (HTTP 500/404), so this reads the playlist page and
 * follows the web client's continuation calls instead. The result is committed
 * so the server never scrapes YouTube itself; it embeds these titles at boot
 * (utils/videoCatalog.js).
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const PLAYLISTS = [
    { id: 'PLdVWJNYK0Cg8', kind: 'long' },
    { id: 'PLG8W47QZ3yXg', kind: 'shorts' }
];

const OUTPUT_PATH = path.join(__dirname, '..', 'data', 'videoCatalog.json');
const USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

function collect(node, videos, continuations) {
    if (!node || typeof node !== 'object') return;

    const lockup = node.lockupViewModel;
    if (lockup?.contentId) {
        videos.push({
            id: lockup.contentId,
            title: lockup.metadata?.lockupMetadataViewModel?.title?.content || ''
        });
    }

    const shorts = node.shortsLockupViewModel;
    if (shorts) {
        const id = shorts.onTap?.innertubeCommand?.reelWatchEndpoint?.videoId;
        if (id) videos.push({ id, title: shorts.overlayMetadata?.primaryText?.content || '' });
    }

    if (node.continuationCommand?.token) continuations.push(node.continuationCommand.token);

    for (const key of Object.keys(node)) collect(node[key], videos, continuations);
}

async function fetchPlaylist(playlistId) {
    const page = await axios.get(`https://www.youtube.com/playlist?list=${playlistId}&hl=ko`, {
        headers: { 'user-agent': USER_AGENT, 'accept-language': 'ko-KR' },
        responseType: 'text'
    });
    const html = page.data;
    const initialData = html.match(/var ytInitialData = (\{.*?\});<\/script>/s);
    const apiKey = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
    const clientVersion = html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/);
    if (!initialData || !apiKey || !clientVersion) {
        throw new Error(`Playlist page layout changed: ${playlistId}`);
    }

    const videos = [];
    const pending = [];
    collect(JSON.parse(initialData[1]), videos, pending);

    const seen = new Set();
    while (pending.length) {
        const token = pending.shift();
        if (seen.has(token)) continue;
        seen.add(token);

        const response = await axios.post(
            `https://www.youtube.com/youtubei/v1/browse?key=${apiKey[1]}`,
            {
                context: { client: { clientName: 'WEB', clientVersion: clientVersion[1], hl: 'ko', gl: 'KR' } },
                continuation: token
            },
            { headers: { 'user-agent': USER_AGENT } }
        );
        collect(response.data, videos, pending);
    }

    return [...new Map(videos.map((video) => [video.id, video])).values()];
}

function loadExisting() {
    try {
        return JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8'));
    } catch {
        return [];
    }
}

async function main() {
    const existing = loadExisting();
    const catalog = [];

    for (const playlist of PLAYLISTS) {
        const videos = await fetchPlaylist(playlist.id);
        const before = existing.filter((video) => video.kind === playlist.kind).length;

        // A half-rendered page or a consent wall looks like a playlist that lost
        // most of its videos. Refuse to commit that; a real removal of a few
        // videos still goes through.
        if (videos.length < before * 0.8) {
            throw new Error(
                `${playlist.id}: got ${videos.length} videos, had ${before}. Not overwriting.`
            );
        }

        videos.forEach((video) => {
            catalog.push({ kind: playlist.kind, id: video.id, title: video.title });
        });
        console.log(`${playlist.id} (${playlist.kind}): ${videos.length} videos (was ${before})`);
    }

    const known = new Set(existing.map((video) => video.id));
    const added = catalog.filter((video) => !known.has(video.id));
    added.forEach((video) => console.log(`+ ${video.kind} ${video.id} ${video.title}`));

    fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
    fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(catalog, null, 1)}\n`);
    console.log(`Wrote ${catalog.length} videos (${added.length} new) to ${OUTPUT_PATH}`);
}

main().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
