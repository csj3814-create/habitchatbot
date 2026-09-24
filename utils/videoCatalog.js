/**
 * 최석재 전문의 출연 영상 catalog + the reply tag the coach uses to pick one.
 *
 * The full catalog (400+ titles, ~13.6k tokens) is too big to ride along on
 * every Gemini request. Instead the titles are embedded once per process, each
 * question pulls its closest few by cosine similarity, and only that shortlist
 * goes into the prompt. The model picks one and ends its reply with
 * `[영상:<videoId>]`; the server swaps that for a real link. An id outside the
 * catalog simply drops out, so a hallucinated link can't reach the room.
 *
 * data/videoCatalog.json is refreshed weekly by
 * .github/workflows/update-video-catalog.yml (scripts/update_video_catalog.js).
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');

const CATALOG = require('../data/videoCatalog.json');

const BY_ID = new Map(CATALOG.map((video) => [video.id, video]));
const VIDEO_TAG = /\[\s*영상\s*[:：]\s*([A-Za-z0-9_-]{11})\s*\]/g;
const DISPLAY_TITLE_LIMIT = 45;
const EMBEDDING_MODEL = 'gemini-embedding-001';
const EMBEDDING_DIMENSIONS = 256;
const EMBED_BATCH_SIZE = 100;
const CANDIDATE_COUNT = 5;

function cleanTitle(title) {
    return String(title || '')
        .replace(/#[^\s#]+/g, '')
        .replace(/\s*[|｜]\s*/g, ' | ')
        .replace(/\s+/g, ' ')
        .replace(/(\s*\|\s*)+$/, '')
        .trim();
}

function getVideoUrl(video) {
    return video.kind === 'shorts'
        ? `https://youtube.com/shorts/${video.id}`
        : `https://youtu.be/${video.id}`;
}

function shortenTitle(title) {
    const cleaned = cleanTitle(title);
    // "본제목 | 출연자 EP. 24" -> keep the headline when the rest won't fit.
    const headline = cleaned.split(' | ')[0];
    if (cleaned.length > DISPLAY_TITLE_LIMIT && headline.length <= DISPLAY_TITLE_LIMIT) {
        return headline;
    }
    return cleaned.length > DISPLAY_TITLE_LIMIT
        ? `${cleaned.slice(0, DISPLAY_TITLE_LIMIT).replace(/[\s|]+$/, '')}...`
        : cleaned;
}

function normalize(values) {
    const length = Math.hypot(...values) || 1;
    return values.map((value) => value / length);
}

function dot(a, b) {
    let sum = 0;
    for (let i = 0; i < a.length; i += 1) sum += a[i] * b[i];
    return sum;
}

function createEmbedder(apiKey = process.env.GEMINI_API_KEY) {
    const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: EMBEDDING_MODEL });
    const toRequest = (text, taskType) => ({
        content: { role: 'user', parts: [{ text }] },
        taskType,
        outputDimensionality: EMBEDDING_DIMENSIONS
    });

    return {
        async embedDocuments(texts) {
            const vectors = [];
            for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
                const batch = texts.slice(i, i + EMBED_BATCH_SIZE);
                const { embeddings } = await model.batchEmbedContents({
                    requests: batch.map((text) => toRequest(text, 'RETRIEVAL_DOCUMENT'))
                });
                vectors.push(...embeddings.map((embedding) => embedding.values));
            }
            return vectors;
        },
        async embedQuery(text) {
            const { embedding } = await model.embedContent(toRequest(text, 'RETRIEVAL_QUERY'));
            return embedding.values;
        }
    };
}

/**
 * Shortlists catalog videos for a question. Title vectors are built lazily on
 * first use and kept for the life of the process; a failed build is retried on
 * the next question rather than cached.
 */
function createVideoMatcher({ catalog = CATALOG, embedder, candidateCount = CANDIDATE_COUNT } = {}) {
    let indexPromise = null;
    let activeEmbedder = embedder;

    function getEmbedder() {
        activeEmbedder = activeEmbedder || createEmbedder();
        return activeEmbedder;
    }

    function loadIndex() {
        if (!indexPromise) {
            indexPromise = getEmbedder()
                .embedDocuments(catalog.map((video) => cleanTitle(video.title)))
                .then((vectors) => vectors.map(normalize))
                .catch((error) => {
                    indexPromise = null;
                    throw error;
                });
        }
        return indexPromise;
    }

    async function findCandidates(question) {
        const [index, query] = await Promise.all([
            loadIndex(),
            getEmbedder().embedQuery(String(question || '').slice(0, 500))
        ]);
        const queryVector = normalize(query);

        return catalog
            .map((video, i) => ({ video, score: dot(index[i], queryVector) }))
            .sort((a, b) => b.score - a.score)
            .slice(0, candidateCount)
            .map(({ video }) => video);
    }

    /**
     * Prompt block for this question, or '' when matching isn't available --
     * the reply then just goes out without a video.
     */
    async function buildCandidatePrompt(question) {
        try {
            const candidates = await findCandidates(question);
            if (candidates.length === 0) return '';

            return [
                '[추천 후보 영상 (최석재 전문의 출연, 질문과 가까운 순)]',
                ...candidates.map((video) => `${video.id} ${cleanTitle(video.title)}`),
                '[답변 마지막 줄에 위 후보 중 답변과 가장 관련 높은 영상 1개를 [영상:ID] 형식으로 꼭 붙여 주세요.]'
            ].join('\n');
        } catch (error) {
            console.warn('[VideoCatalog] Candidate lookup failed:', error.message);
            return '';
        }
    }

    return { buildCandidatePrompt, findCandidates, warmUp: () => loadIndex().catch(() => {}) };
}

/**
 * Pull every `[영상:..]` tag out of the reply. The last valid one wins.
 */
function extractVideoRecommendation(text) {
    let video = null;
    const body = String(text || '').replace(VIDEO_TAG, (_, id) => {
        video = BY_ID.get(id) || video;
        return '';
    });

    return {
        text: body.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim(),
        video
    };
}

function formatVideoRecommendation(video) {
    return `📺 추천 영상: ${shortenTitle(video.title)}\n${getVideoUrl(video)}`;
}

/**
 * Model reply -> room reply: strip the tag, then append the real link.
 * `footer` (e.g. a short !연결 nudge) sits between the answer and the video.
 */
function renderCoachReply(text, { footer = '' } = {}) {
    const { text: body, video } = extractVideoRecommendation(text);
    return [body, footer, video && formatVideoRecommendation(video)].filter(Boolean).join('\n\n');
}

module.exports = {
    CATALOG,
    cleanTitle,
    createVideoMatcher,
    extractVideoRecommendation,
    formatVideoRecommendation,
    getVideoUrl,
    renderCoachReply
};
