const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadMessengerbotScript() {
    const scriptPath = path.join(__dirname, '..', 'messengerbot_script.js');
    const source = fs.readFileSync(scriptPath, 'utf8');
    const requests = [];
    const logs = [];
    const timeouts = [];

    function Thread(callback) {
        this.callback = callback;
    }

    Thread.prototype.start = function start() {
        this.callback();
    };

    Thread.sleep = function sleep() {};

    const context = {
        JSON,
        Log: {
            i(message) {
                logs.push({ level: 'info', message });
            },
            e(message) {
                logs.push({ level: 'error', message });
            }
        },
        java: {
            lang: {
                Thread
            }
        },
        org: {
            jsoup: {
                Jsoup: {
                    connect() {
                        return {
                            header() {
                                return this;
                            },
                            requestBody(body) {
                                requests.push(JSON.parse(body));
                                return this;
                            },
                            ignoreContentType() {
                                return this;
                            },
                            timeout(value) {
                                timeouts.push(value);
                                return this;
                            },
                            post() {
                                return {
                                    body() {
                                        return {
                                            text() {
                                                return JSON.stringify({
                                                    reply: 'SERVER_REPLY',
                                                    followups: ['FOLLOWUP_REPLY']
                                                });
                                            }
                                        };
                                    }
                                };
                            }
                        };
                    }
                }
            }
        }
    };

    vm.runInNewContext(source, context, { filename: scriptPath });

    return {
        response: context.response,
        requests,
        logs,
        timeouts
    };
}

function createReplier() {
    const replies = [];

    return {
        replies,
        replier: {
            reply(message) {
                replies.push(message);
            }
        }
    };
}

test('messengerbot script only sends onboarding replies for open-chat bot welcome messages', () => {
    const { response, requests } = loadMessengerbotScript();
    const { replier, replies } = createReplier();

    response(
        '최석재',
        '식습관 운동습관 잠습관\n꼭 바꾸고 싶다\n이젠 진정한 치유의 길로\n들어서고 싶다\n그럼 한번 시작해 봅시다 ^^',
        '오픈채팅봇',
        false,
        replier
    );

    assert.equal(requests.length, 0);
    assert.equal(replies.length, 1);
    assert.match(replies[0], /새로 오신 분 환영합니다/);
});

test('messengerbot script forwards open-chat bot scheduled !오늘 posts to the server', () => {
    const { response, requests } = loadMessengerbotScript();
    const { replier, replies } = createReplier();

    response(
        '최석재',
        '!오늘\n저녁 인증 체크 부탁드려요!',
        '오픈채팅봇',
        false,
        replier
    );

    assert.equal(requests.length, 1);
    assert.deepEqual(requests[0], {
        room: '최석재',
        msg: '오늘',
        sender: '오픈채팅봇',
        isGroupChat: false
    });
    assert.deepEqual(replies, ['SERVER_REPLY', 'FOLLOWUP_REPLY']);
});

test('messengerbot script forwards open-chat bot scheduled best-record posts as canonical commands', () => {
    const { response, requests } = loadMessengerbotScript();
    const { replier } = createReplier();

    response(
        '최석재',
        '!지난주 베스트\n지난 한 주의 베스트 3를 발표합니다.',
        '오픈채팅봇',
        false,
        replier
    );

    response(
        '최석재',
        '!월간베스트\n지난달 기록 성적입니다.',
        '오픈채팅봇',
        false,
        replier
    );

    assert.equal(requests.length, 2);
    assert.equal(requests[0].msg, '지난주베스트');
    assert.equal(requests[1].msg, '지난달베스트');
});

test('messengerbot script ignores non-command open-chat bot announcements that are not welcome messages', () => {
    const { response, requests } = loadMessengerbotScript();
    const { replier, replies } = createReplier();

    response(
        '최석재',
        '오늘 밤 9시에 공지가 올라갑니다.',
        '오픈채팅봇',
        false,
        replier
    );

    assert.equal(requests.length, 0);
    assert.equal(replies.length, 0);
});

test('the tracked phone script carries no real API key', () => {
    // The key lived in this tracked file and was therefore public. Anyone holding
    // it can POST to /api/messengerbot directly with any `sender` they choose,
    // which includes unlinking another member's account. Keep the repo copy a
    // placeholder and fill the real value in on the handset.
    const source = fs.readFileSync(
        path.join(__dirname, '..', 'messengerbot_script.js'),
        'utf8'
    );

    const match = source.match(/const\s+API_KEY\s*=\s*"([^"]*)"/);
    assert.ok(match, 'API_KEY assignment should exist');

    const value = match[1];
    assert.ok(
        /^[A-Z_]+$/.test(value),
        `API_KEY must stay a placeholder in the repo, found ${JSON.stringify(value)}`
    );
    assert.doesNotMatch(
        value,
        /^[0-9a-f]{16,}$/i,
        'API_KEY looks like a real secret'
    );
});

test('messengerbot script waits long enough for a Render cold start', () => {
    const { response, timeouts } = loadMessengerbotScript();
    const { replier } = createReplier();

    response('최석재', '!오늘', '테스트 사용자', true, replier);

    assert.equal(timeouts.length, 1);
    // Render reports 50s or more to wake an idle instance. A 15s timeout failed
    // on every cold start.
    assert.ok(
        timeouts[0] >= 60000,
        `expected at least a 60s timeout, got ${timeouts[0]}ms`
    );
});

test('messengerbot script sends follow-up replies after the primary reply when the server returns them', () => {
    const { response } = loadMessengerbotScript();
    const { replier, replies } = createReplier();

    response(
        '최석재',
        '!공유',
        '테스트 사용자',
        false,
        replier
    );

    assert.deepEqual(replies, ['SERVER_REPLY', 'FOLLOWUP_REPLY']);
});
