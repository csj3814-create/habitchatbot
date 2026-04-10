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
                            timeout() {
                                return this;
                            },
                            post() {
                                return {
                                    body() {
                                        return {
                                            text() {
                                                return JSON.stringify({ reply: 'SERVER_REPLY' });
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
        logs
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
    assert.deepEqual(replies, ['SERVER_REPLY']);
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
