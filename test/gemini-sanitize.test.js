const test = require('node:test');
const assert = require('node:assert/strict');

const { sanitizeModelText, SYSTEM_INSTRUCTION } = require('../utils/gemini');

// Captured from the 해빛스쿨 group chat: gemini-2.5-flash put its tool call and
// its English reasoning in front of the answer, and every member saw it.
const LEAKED_BUTTER = `tool_code
print(google_search.search(queries=['땅콩버터 건강 영향', '일반 버터 건강 영향', '땅콩버터 vs 일반 버터 영양 비교', '땅콩버터와 심혈관 건강', '버터와 포화지방']))
thought
The user, "건강을 위해님," is asking for a comparison of the health impacts of peanut butter and regular butter. I need to explain the key nutritional differences, focusing on fat types (saturated vs. unsaturated), protein content, and potential benefits/drawbacks of each. I should also continue to encourage the user's positive habits (consistent meal logging) and gently nudge towards areas for improvement (exercise and mindfulness).건강을 위해님, 땅콩버터와 일반 버터가 신체 건강에 어떤 영향을 미치는지 비교해서 궁금하시군요! 정말 좋은 질문이에요.`;

test('strips the tool_code and thought scaffolding, keeping the answer', () => {
    const cleaned = sanitizeModelText(LEAKED_BUTTER);

    assert.ok(cleaned.startsWith('건강을 위해님, 땅콩버터와'), `got: ${cleaned.slice(0, 60)}`);
    assert.doesNotMatch(cleaned, /tool_code/);
    assert.doesNotMatch(cleaned, /google_search/);
    assert.doesNotMatch(cleaned, /The user, /);
    assert.doesNotMatch(cleaned, /saturated/);
});

test('strips a tool_code block that has no thought block after it', () => {
    const cleaned = sanitizeModelText(
        `tool_code\nprint(google_search.search(queries=['버터 건강 영향', '버터 포화지방']))\n버터요? 고소하고 맛있죠!`
    );

    assert.equal(cleaned, '버터요? 고소하고 맛있죠!');
});

test('leaves an ordinary Korean answer completely untouched', () => {
    for (const answer of [
        '아이고, 버터요? 🧈 고소하고 정말 맛있죠! 😊\n\n버터를 아예 먹지 말아야 하는 건 아니에요.',
        '민수님 연결 완료!\n\n이제 사용할 수 있어요.\n- !내습관 : 내 기록 보기',
        '오늘도 기록 잘 하셨네요. 내일도 화이팅이에요!'
    ]) {
        assert.equal(sanitizeModelText(answer), answer.trim());
    }
});

test('never invents a reply when there is nothing to salvage', () => {
    assert.equal(sanitizeModelText(''), '');
    assert.equal(sanitizeModelText(null), '');
    assert.equal(sanitizeModelText(undefined), '');
});

test('a sentence that merely mentions the words is not treated as scaffolding', () => {
    // The guard is anchored to the start, so ordinary prose survives.
    const answer = '그 생각(thought)도 좋아요! tool_code 같은 건 신경쓰지 마세요.';
    assert.equal(sanitizeModelText(answer), answer);
});

test('the system prompt forbids leaking internal steps and states the service is real', () => {
    assert.match(SYSTEM_INSTRUCTION, /내부 과정 노출 금지/);
    assert.match(SYSTEM_INSTRUCTION, /tool_code/);
    // A leaked thought called 해빛스쿨 "a fictional entity for this persona".
    assert.match(SYSTEM_INSTRUCTION, /해빛스쿨은 실제 서비스입니다/);
});
