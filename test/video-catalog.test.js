const test = require('node:test');
const assert = require('node:assert/strict');

const {
    CATALOG,
    cleanTitle,
    createVideoMatcher,
    extractVideoRecommendation,
    getVideoUrl,
    renderCoachReply
} = require('../utils/videoCatalog');
const { SYSTEM_INSTRUCTION } = require('../utils/gemini');

const longVideo = CATALOG.find((video) => video.kind === 'long');
const shortVideo = CATALOG.find((video) => video.kind === 'shorts');

// Fake embedder: one axis per keyword, so similarity is keyword overlap.
const KEYWORDS = ['당뇨', '치매', '뒤꿈치'];
const vectorFor = (text) => KEYWORDS.map((word) => (text.includes(word) ? 1 : 0.01));

test('catalog covers both playlists with unique ids', () => {
    assert.ok(longVideo && shortVideo);
    assert.equal(new Set(CATALOG.map((video) => video.id)).size, CATALOG.length);
});

test('system instruction no longer carries the catalog or the old third-party links', () => {
    assert.doesNotMatch(SYSTEM_INSTRUCTION, new RegExp(longVideo.id));
    assert.doesNotMatch(SYSTEM_INSTRUCTION, /swRNeYw1JkY/);
    assert.match(SYSTEM_INSTRUCTION, /\[추천 후보 영상\]/);
});

test('long-form and shorts get their own link shapes', () => {
    assert.equal(getVideoUrl(longVideo), `https://youtu.be/${longVideo.id}`);
    assert.equal(getVideoUrl(shortVideo), `https://youtube.com/shorts/${shortVideo.id}`);
});

test('the tag becomes a real link and never reaches the room', () => {
    const reply = renderCoachReply(`물 많이 드세요 😊\n[영상: ${shortVideo.id}]`, { footer: 'NUDGE' });

    assert.doesNotMatch(reply, /\[영상/);
    assert.ok(reply.startsWith('물 많이 드세요 😊\n\nNUDGE\n\n📺 추천 영상: '));
    assert.ok(reply.endsWith(getVideoUrl(shortVideo)));
});

test('an id outside the catalog is dropped instead of producing a link', () => {
    const { text, video } = extractVideoRecommendation('답변\n[영상:AAAAAAAAAAA]');

    assert.equal(text, '답변');
    assert.equal(video, null);
});

test('matcher shortlists the closest titles and embeds the catalog once', async () => {
    const catalog = [
        { kind: 'long', id: 'aaaaaaaaaaa', title: '당뇨 전단계 신호 #최석재' },
        { kind: 'long', id: 'bbbbbbbbbbb', title: '치매 초기 증상' },
        { kind: 'shorts', id: 'ccccccccccc', title: '뒤꿈치 통증' }
    ];
    let documentCalls = 0;
    const matcher = createVideoMatcher({
        catalog,
        candidateCount: 2,
        embedder: {
            async embedDocuments(texts) {
                documentCalls += 1;
                return texts.map(vectorFor);
            },
            async embedQuery(text) {
                return vectorFor(text);
            }
        }
    });

    const first = await matcher.findCandidates('요즘 깜빡깜빡 치매 걱정');
    await matcher.findCandidates('밥 먹고 졸려요 당뇨?');
    const prompt = await matcher.buildCandidatePrompt('발 뒤꿈치가 아파요');

    assert.equal(first[0].id, 'bbbbbbbbbbb');
    assert.equal(first.length, 2);
    assert.equal(documentCalls, 1);
    assert.match(prompt, /^\[추천 후보 영상/);
    assert.match(prompt.split('\n')[1], /^ccccccccccc 뒤꿈치 통증$/);
    assert.equal(cleanTitle(catalog[0].title), '당뇨 전단계 신호');
});

test('matcher failure leaves the reply without a video and retries later', async () => {
    let fail = true;
    const matcher = createVideoMatcher({
        catalog: [{ kind: 'long', id: 'aaaaaaaaaaa', title: '당뇨' }],
        embedder: {
            async embedDocuments(texts) {
                if (fail) throw new Error('quota');
                return texts.map(vectorFor);
            },
            async embedQuery(text) {
                return vectorFor(text);
            }
        }
    });

    assert.equal(await matcher.buildCandidatePrompt('당뇨'), '');
    fail = false;
    assert.match(await matcher.buildCandidatePrompt('당뇨'), /aaaaaaaaaaa/);
});
