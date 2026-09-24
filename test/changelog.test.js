const test = require('node:test');
const assert = require('node:assert/strict');

const { handleChangelog, parseLatestRelease } = require('../commands/changelog');

const MARKDOWN = `# Changelog

해빛스쿨의 변경 기록입니다.

## v443 · 2026-09-24 — 대사건강 점수를 기기와 상관없이 매깁니다

- **[개선]** **대사건강 점수가 어느 기기로 재도 같은 기준으로 매겨집니다.** 내장지방 레벨은 회사마다 달라요.
- **[신규]** **첫 교환은 1,400P 입니다.** 원래 2,000P 인 쿠폰이에요.
- **[수정]** **쉬고 계신 동안 예전 연속 기록이 그대로 보이던 문제**를 고쳤습니다. 이제 마지막 기록일 기준이에요.

## v436 · 2026-09-23 — 이전 버전

- **[신규]** **보이면 안 되는 항목입니다.**
`;

function clientReturning(...responses) {
    const calls = [];
    return {
        calls,
        async get(url) {
            calls.push(url);
            const next = responses.shift();
            if (next instanceof Error) throw next;
            return { data: next };
        }
    };
}

test('only the newest release is parsed, one sentence per item', () => {
    const release = parseLatestRelease(MARKDOWN);

    assert.equal(release.version, 'v443');
    assert.equal(release.date, '9/24');
    assert.equal(release.title, '대사건강 점수를 기기와 상관없이 매깁니다');
    assert.deepEqual(release.items, [
        { tag: '개선', text: '대사건강 점수가 어느 기기로 재도 같은 기준으로 매겨집니다.' },
        { tag: '신규', text: '첫 교환은 1,400P 입니다.' },
        { tag: '수정', text: '쉬고 계신 동안 예전 연속 기록이 그대로 보이던 문제를 고쳤습니다.' }
    ]);
});

test('!업데이트 reply is plain text with icons and the changelog link', async () => {
    const client = clientReturning(MARKDOWN);
    const reply = await handleChangelog({ client });

    assert.equal(
        reply,
        [
            '📢 해빛스쿨 v443 업데이트 (9/24)',
            '대사건강 점수를 기기와 상관없이 매깁니다',
            '',
            '✨ 대사건강 점수가 어느 기기로 재도 같은 기준으로 매겨집니다.',
            '🆕 첫 교환은 1,400P 입니다.',
            '🔧 쉬고 계신 동안 예전 연속 기록이 그대로 보이던 문제를 고쳤습니다.',
            '',
            '자세히 보기: https://habitschool.web.app/changelog'
        ].join('\n')
    );
    assert.doesNotMatch(reply, /\*\*|보이면 안 되는/);
    assert.match(client.calls[0], /api\.github\.com/);
});

test('falls back to raw GitHub when the API is rate limited', async () => {
    const client = clientReturning(new Error('403 rate limit'), MARKDOWN);
    const reply = await handleChangelog({ client });

    assert.match(reply, /^📢 해빛스쿨 v443/);
    assert.match(client.calls[1], /raw\.githubusercontent\.com/);
});

test('both sources down gives a short notice with the page link', async () => {
    const client = clientReturning(new Error('down'), new Error('down'));

    assert.equal(
        await handleChangelog({ client }),
        '업데이트 내용을 불러오지 못했어요.\nhttps://habitschool.web.app/changelog 에서 확인해 주세요.'
    );
});
