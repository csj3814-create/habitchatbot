const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeStudentName, buildStudentAddressPrompt } = require('../utils/addressing');
const { SYSTEM_INSTRUCTION, DEFAULT_CHAT_HISTORY } = require('../utils/gemini');

test('normalizeStudentName strips trailing coach honorifics from student names', () => {
    assert.equal(normalizeStudentName('최석재 코치'), '최석재');
    assert.equal(normalizeStudentName('최석재 코치님'), '최석재');
    assert.equal(normalizeStudentName('최석재 선생님'), '최석재');
    assert.equal(normalizeStudentName('최석재'), '최석재');
});

test('buildStudentAddressPrompt enforces 이름+님 and forbids coach honorifics', () => {
    const prompt = buildStudentAddressPrompt('최석재 코치');

    assert.match(prompt, /해빛스쿨 학생/);
    assert.match(prompt, /'최석재님'/);
    assert.match(prompt, /절대 '최석재 코치님', '코치님', '선생님'이라고 부르지 마세요/);
});

test('gemini honorific rules treat the user as a student, not a coach', () => {
    assert.match(SYSTEM_INSTRUCTION, /사용자는 해빛스쿨 학생/);
    assert.match(SYSTEM_INSTRUCTION, /절대 '코치님', 'OOO 코치님', '선생님'이라고 부르지 마세요/);
    assert.match(SYSTEM_INSTRUCTION, /이름\+님 또는 그냥 님/);
    assert.equal(DEFAULT_CHAT_HISTORY[0].parts[0].text, '안녕하세요!');
    assert.doesNotMatch(DEFAULT_CHAT_HISTORY[0].parts[0].text, /코치님/);
});
