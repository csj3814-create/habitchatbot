const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');

function loadWithMocks(targetPath, mocks) {
    const resolvedTarget = require.resolve(targetPath);
    const targetDir = path.dirname(resolvedTarget);
    const originals = new Map();

    for (const [request, mockExports] of Object.entries(mocks)) {
        const resolvedDependency = require.resolve(request, { paths: [targetDir] });
        originals.set(resolvedDependency, require.cache[resolvedDependency]);
        require.cache[resolvedDependency] = {
            id: resolvedDependency,
            filename: resolvedDependency,
            loaded: true,
            exports: mockExports
        };
    }

    delete require.cache[resolvedTarget];

    try {
        return require(targetPath);
    } finally {
        delete require.cache[resolvedTarget];

        for (const [resolvedDependency, original] of originals.entries()) {
            if (original) {
                require.cache[resolvedDependency] = original;
            } else {
                delete require.cache[resolvedDependency];
            }
        }
    }
}

async function postJsonToRouter(router, body) {
    const express = require('express');
    const app = express();
    app.use(express.json());
    app.use('/', router);

    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();

    try {
        const response = await fetch(`http://127.0.0.1:${port}/`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body)
        });

        return {
            status: response.status,
            json: await response.json()
        };
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
}

function buildRouterMocks(overrides = {}) {
    return {
        '../utils/apiKeyAuth': {
            apiKeyAuth: (req, res, next) => next()
        },
        '../utils/chatIdentity': {
            createChatIdentity: ({ platform, userId, displayName, legacySender, room }) => ({
                platform,
                userId,
                displayName,
                legacySender,
                room
            })
        },
        '../commands/today': { handleToday: async () => 'TODAY' },
        '../commands/myHabits': { handleMyHabits: async () => 'HABITS' },
        '../commands/weekly': { handleWeekly: async () => 'WEEKLY' },
        '../commands/classStatus': { handleClassStatus: async () => 'CLASS' },
        '../commands/ranking': { handleRanking: async () => 'RANK' },
        '../commands/bestRecords': {
            resolveBestRecordsPeriod: () => null,
            handleBestRecords: async () => 'BEST'
        },
        '../commands/youtubeRecommendation': {
            handleYoutubeRecommendation: async () => 'YOUTUBE'
        },
        '../commands/guide': {
            handleGuide: async () => 'GUIDE',
            handleApp: async () => 'APP'
        },
        '../commands/categoryHabits': {
            handleDiet: async () => 'DIET',
            handleExercise: async () => 'EXERCISE',
            handleMind: async () => 'MIND'
        },
        '../commands/addFriend': {
            handleAddFriend: async () => 'FRIEND',
            handleMyCode: async () => 'MYCODE'
        },
        '../commands/groupLink': {
            handleGroupLink: async () => 'GROUP_LINK',
            buildGroupLinkGuideMessage: () => 'LINK_GUIDE'
        },
        '../commands/share': {
            handleShare: async () => ({ type: 'text', text: 'SHARE' })
        },
        '../commands/haebit': {
            handleHaebit: async () => 'HAEBIT',
            handleHaebitVideo: async () => 'HAEBIT_VIDEO'
        },
        '../modules/appFirebase': {
            getUserRecords: async () => []
        },
        '../modules/userMapping': {
            getMapping: async () => null,
            getDisplayName: (user) => user.displayName
        },
        '../modules/statsHelpers': {
            hasDiet: () => false,
            hasExercise: () => false,
            hasMind: () => false
        },
        ...overrides
    };
}

test('messengerbot dispatches commands from any room, by design', async () => {
    // Documents accepted behavior, not an aspiration. MessengerBot R v0.7.29a
    // reports `room` as the notification title, which is the speaker's nickname
    // for this open chat, so `room` cannot identify a room and nothing here
    // filters on it. Room separation is an operating agreement: 해빛스쿨 uses
    // `!`, 해피닥터 uses `~`. If this test ever starts failing because a room
    // check was added, confirm a stable room identifier exists first.
    let dispatched = 0;

    const { createMessengerbotRouter } = loadWithMocks(
        path.join(__dirname, '..', 'routes', 'messengerbot.js'),
        buildRouterMocks({
            '../commands/today': {
                handleToday: async () => {
                    dispatched += 1;
                    return 'TODAY';
                }
            }
        })
    );

    const router = createMessengerbotRouter({
        getChatSession() {
            throw new Error('getChatSession should not be called for a fixed command');
        }
    });

    // The same open chat reports a different `room` per speaker.
    for (const room of ['릴리', 'Lemon', '최석재 응급의학과 전문의 유퀴즈 의사', '', undefined]) {
        const response = await postJsonToRouter(router, {
            room,
            msg: '!오늘',
            sender: '테스트 사용자',
            isGroupChat: true
        });

        assert.equal(response.status, 200, `unexpected status for room ${JSON.stringify(room)}`);
        assert.equal(response.json.reply, 'TODAY');
    }

    assert.equal(dispatched, 5);
});

test('messengerbot always blocks connect and register commands in shared rooms', async () => {
    const { createMessengerbotRouter } = loadWithMocks(
        path.join(__dirname, '..', 'routes', 'messengerbot.js'),
        {
            '../utils/apiKeyAuth': {
                apiKeyAuth: (req, res, next) => next()
            },
            '../utils/chatIdentity': {
                createChatIdentity: ({ platform, userId, displayName, legacySender, room }) => ({
                    platform,
                    userId,
                    displayName,
                    legacySender,
                    room
                })
            },
            '../commands/today': { handleToday: async () => 'TODAY' },
            '../commands/myHabits': { handleMyHabits: async () => 'HABITS' },
            '../commands/weekly': { handleWeekly: async () => 'WEEKLY' },
            '../commands/classStatus': { handleClassStatus: async () => 'CLASS' },
            '../commands/ranking': { handleRanking: async () => 'RANK' },
            '../commands/guide': {
                handleGuide: async () => 'GUIDE',
                handleApp: async () => 'APP'
            },
            '../commands/categoryHabits': {
                handleDiet: async () => 'DIET',
                handleExercise: async () => 'EXERCISE',
                handleMind: async () => 'MIND'
            },
            '../commands/addFriend': {
                handleAddFriend: async () => 'FRIEND',
                handleMyCode: async () => 'MYCODE'
            },
            '../commands/groupLink': {
                handleGroupLink: async () => 'GROUP_LINK',
                buildGroupLinkGuideMessage: () => 'LINK_GUIDE'
            },
            '../commands/share': {
                handleShare: async () => ({ type: 'text', text: 'SHARE' })
            },
            '../commands/haebit': {
                handleHaebit: async () => 'HAEBIT',
                handleHaebitVideo: async () => 'HAEBIT_VIDEO'
            },
            '../modules/appFirebase': {
                getUserRecords: async () => []
            },
            '../modules/userMapping': {
                getMapping: async () => null,
                getDisplayName: (user) => user.displayName
            },
            '../modules/statsHelpers': {
                hasDiet: () => false,
                hasExercise: () => false,
                hasMind: () => false
            }
        }
    );

    const router = createMessengerbotRouter({
        db: {
            ref() {
                throw new Error('db.ref should not be called for blocked commands');
            }
        },
        getChatSession() {
            throw new Error('getChatSession should not be called for blocked commands');
        },
        checkAndLogHabits: async () => {}
    });

    // `!연결` with no code must never emit a magic link into a shared room:
    // anyone reading could click it and attach their own account to this nickname.
    const connectResponse = await postJsonToRouter(router, {
        room: 'open-chat',
        msg: '!연결',
        sender: '테스트 사용자',
        isGroupChat: false
    });

    assert.equal(connectResponse.status, 200);
    assert.equal(connectResponse.json.reply, 'LINK_GUIDE');
    assert.doesNotMatch(JSON.stringify(connectResponse.json), /http/);

    // A code, however, is proof the speaker already holds it.
    for (const msg of ['!연결 ABCD1234', '!등록 ABCD1234', '!연결 해제', '!등록 해제']) {
        const response = await postJsonToRouter(router, {
            room: 'open-chat',
            msg,
            sender: '테스트 사용자',
            isGroupChat: false
        });

        assert.equal(response.status, 200, `unexpected status for ${msg}`);
        assert.equal(response.json.reply, 'GROUP_LINK', `unexpected reply for ${msg}`);
    }
});

test('messengerbot never logs a submitted link code', async () => {
    const { createMessengerbotRouter } = loadWithMocks(
        path.join(__dirname, '..', 'routes', 'messengerbot.js'),
        buildRouterMocks()
    );

    const router = createMessengerbotRouter({
        getChatSession() {
            throw new Error('getChatSession should not be called for link commands');
        }
    });

    const logged = [];
    const originalLog = console.log;
    console.log = (...args) => logged.push(args.join(' '));

    try {
        await postJsonToRouter(router, {
            room: 'open-chat',
            msg: '!연결 SECRET12',
            sender: '테스트 사용자',
            isGroupChat: false
        });
    } finally {
        console.log = originalLog;
    }

    assert.ok(logged.length > 0, 'the request should still be logged');
    for (const line of logged) {
        assert.doesNotMatch(line, /SECRET12/);
    }
    assert.ok(logged.some((line) => line.includes('<redacted>')));
});

test('messengerbot freeform prompt uses student honorific guidance', async () => {
    let capturedPrompt = null;

    const { createMessengerbotRouter } = loadWithMocks(
        path.join(__dirname, '..', 'routes', 'messengerbot.js'),
        {
            '../utils/apiKeyAuth': {
                apiKeyAuth: (req, res, next) => next()
            },
            '../utils/chatIdentity': {
                createChatIdentity: ({ platform, userId, displayName, legacySender, room }) => ({
                    platform,
                    userId,
                    displayName,
                    legacySender,
                    room
                })
            },
            '../commands/today': { handleToday: async () => 'TODAY' },
            '../commands/myHabits': { handleMyHabits: async () => 'HABITS' },
            '../commands/weekly': { handleWeekly: async () => 'WEEKLY' },
            '../commands/classStatus': { handleClassStatus: async () => 'CLASS' },
            '../commands/ranking': { handleRanking: async () => 'RANK' },
            '../commands/guide': {
                handleGuide: async () => 'GUIDE',
                handleApp: async () => 'APP'
            },
            '../commands/categoryHabits': {
                handleDiet: async () => 'DIET',
                handleExercise: async () => 'EXERCISE',
                handleMind: async () => 'MIND'
            },
            '../commands/addFriend': {
                handleAddFriend: async () => 'FRIEND',
                handleMyCode: async () => 'MYCODE'
            },
            '../commands/groupLink': {
                handleGroupLink: async () => 'GROUP_LINK',
                buildGroupLinkGuideMessage: () => 'LINK_GUIDE'
            },
            '../commands/share': {
                handleShare: async () => ({ type: 'text', text: 'SHARE' })
            },
            '../commands/haebit': {
                handleHaebit: async () => 'HAEBIT',
                handleHaebitVideo: async () => 'HAEBIT_VIDEO'
            },
            '../modules/appFirebase': {
                getUserRecords: async () => []
            },
            '../modules/userMapping': {
                getMapping: async () => null,
                getDisplayName: (user) => user.displayName
            },
            '../modules/statsHelpers': {
                hasDiet: () => false,
                hasExercise: () => false,
                hasMind: () => false
            }
        }
    );

    const router = createMessengerbotRouter({
        db: {
            ref() {
                throw new Error('db.ref should not be called for freeform prompts');
            }
        },
        getChatSession() {
            return {
                async sendMessage(prompt) {
                    capturedPrompt = prompt;
                    return {
                        response: {
                            text: () => 'AI'
                        }
                    };
                }
            };
        },
        checkAndLogHabits: async () => {}
    });

    const response = await postJsonToRouter(router, {
        room: 'open-chat',
        msg: '안녕하세요',
        sender: '최석재 코치',
        isGroupChat: false
    });

    assert.equal(response.status, 200);
    assert.equal(response.json.reply, 'AI');
    assert.match(capturedPrompt, /해빛스쿨 학생/);
    assert.match(capturedPrompt, /'최석재님'/);
    assert.match(capturedPrompt, /절대 '최석재 코치님', '코치님', '선생님'이라고 부르지 마세요/);
    assert.doesNotMatch(capturedPrompt, /이름을 부를 때는 '최석재 코치님'/);
});

test('messengerbot share command replies with the app share-card link only', async () => {
    const { createMessengerbotRouter } = loadWithMocks(
        path.join(__dirname, '..', 'routes', 'messengerbot.js'),
        {
            '../utils/apiKeyAuth': {
                apiKeyAuth: (req, res, next) => next()
            },
            '../utils/chatIdentity': {
                createChatIdentity: ({ platform, userId, displayName, legacySender, room }) => ({
                    platform,
                    userId,
                    displayName,
                    legacySender,
                    room
                })
            },
            '../commands/today': { handleToday: async () => 'TODAY' },
            '../commands/myHabits': { handleMyHabits: async () => 'HABITS' },
            '../commands/weekly': { handleWeekly: async () => 'WEEKLY' },
            '../commands/classStatus': { handleClassStatus: async () => 'CLASS' },
            '../commands/ranking': { handleRanking: async () => 'RANK' },
            '../commands/guide': {
                handleGuide: async () => 'GUIDE',
                handleApp: async () => 'APP'
            },
            '../commands/categoryHabits': {
                handleDiet: async () => 'DIET',
                handleExercise: async () => 'EXERCISE',
                handleMind: async () => 'MIND'
            },
            '../commands/addFriend': {
                handleAddFriend: async () => 'FRIEND',
                handleMyCode: async () => 'MYCODE'
            },
            '../commands/groupLink': {
                handleGroupLink: async () => 'GROUP_LINK',
                buildGroupLinkGuideMessage: () => 'LINK_GUIDE'
            },
            '../commands/share': {
                handleShare: async () => ({ type: 'text', text: 'SHARE_LINK' })
            },
            '../commands/haebit': {
                handleHaebit: async () => 'HAEBIT',
                handleHaebitVideo: async () => 'HAEBIT_VIDEO'
            },
            '../modules/appFirebase': {
                getUserRecords: async () => []
            },
            '../modules/userMapping': {
                getMapping: async () => null,
                getDisplayName: (user) => user.displayName
            },
            '../modules/statsHelpers': {
                hasDiet: () => false,
                hasExercise: () => false,
                hasMind: () => false
            }
        }
    );

    const router = createMessengerbotRouter({
        db: {
            ref() {
                throw new Error('db.ref should not be called for share command');
            }
        },
        getChatSession() {
            throw new Error('getChatSession should not be called for share command');
        },
        checkAndLogHabits: async () => {}
    });

    const response = await postJsonToRouter(router, {
        room: 'open-chat',
        msg: '!공유',
        sender: '테스트 사용자',
        isGroupChat: false
    });

    assert.equal(response.status, 200);
    assert.equal(response.json.reply, 'SHARE_LINK');
    // The follow-up bubble carried the invite line under the rendered image.
    // With no image there is one message and nothing to follow it with.
    assert.equal(response.json.followups, undefined);
});

test('messengerbot routes static video links and haebit record alias without Gemini', async () => {
    const { createMessengerbotRouter } = loadWithMocks(
        path.join(__dirname, '..', 'routes', 'messengerbot.js'),
        {
            '../utils/apiKeyAuth': {
                apiKeyAuth: (req, res, next) => next()
            },
            '../utils/chatIdentity': {
                createChatIdentity: ({ platform, userId, displayName, legacySender, room }) => ({
                    platform,
                    userId,
                    displayName,
                    legacySender,
                    room
                })
            },
            '../commands/today': { handleToday: async () => 'TODAY' },
            '../commands/myHabits': { handleMyHabits: async () => 'HABITS' },
            '../commands/weekly': { handleWeekly: async () => 'WEEKLY' },
            '../commands/classStatus': { handleClassStatus: async () => 'CLASS' },
            '../commands/ranking': { handleRanking: async () => 'RANK' },
            '../commands/guide': {
                handleGuide: async () => 'GUIDE',
                handleApp: async () => 'APP'
            },
            '../commands/categoryHabits': {
                handleDiet: async () => 'DIET',
                handleExercise: async () => 'EXERCISE',
                handleMind: async () => 'MIND'
            },
            '../commands/addFriend': {
                handleAddFriend: async () => 'FRIEND',
                handleMyCode: async () => 'MYCODE'
            },
            '../commands/groupLink': {
                handleGroupLink: async () => 'GROUP_LINK',
                buildGroupLinkGuideMessage: () => 'LINK_GUIDE'
            },
            '../commands/share': {
                handleShare: async () => ({ type: 'text', text: 'SHARE' })
            },
            '../commands/haebit': {
                handleHaebit: async () => 'https://habitchatbot.onrender.com/abc123XY',
                handleHaebitVideo: async () => 'https://habitchatbot.onrender.com/video/abc123XY'
            },
            '../modules/appFirebase': {
                getUserRecords: async () => []
            },
            '../modules/userMapping': {
                getMapping: async () => null,
                getDisplayName: (user) => user.displayName
            },
            '../modules/statsHelpers': {
                hasDiet: () => false,
                hasExercise: () => false,
                hasMind: () => false
            }
        }
    );

    const router = createMessengerbotRouter({
        db: {
            ref() {
                throw new Error('db.ref should not be called for static video or haebit commands');
            }
        },
        getChatSession() {
            throw new Error('getChatSession should not be called for static video or haebit commands');
        },
        checkAndLogHabits: async () => {
            throw new Error('checkAndLogHabits should not be called for static video or haebit commands');
        }
    });

    const response = await postJsonToRouter(router, {
        room: 'open-chat',
        msg: '!해빛',
        sender: '테스트 사용자',
        isGroupChat: false
    });

    assert.equal(response.status, 200);
    assert.match(response.json.reply, /https:\/\/youtu\.be\/kusU9zROdhc/);

    const meditationResponse = await postJsonToRouter(router, {
        room: 'open-chat',
        msg: '!명상',
        sender: '테스트 사용자',
        isGroupChat: false
    });

    assert.equal(meditationResponse.status, 200);
    assert.match(meditationResponse.json.reply, /https:\/\/youtu\.be\/dcftmD1qVDs/);

    const recordResponse = await postJsonToRouter(router, {
        room: 'open-chat',
        msg: '!해빛기록',
        sender: '테스트 사용자',
        isGroupChat: false
    });

    assert.equal(recordResponse.status, 200);
    assert.equal(recordResponse.json.reply, 'https://habitchatbot.onrender.com/abc123XY');

    const videoResponse = await postJsonToRouter(router, {
        room: 'open-chat',
        msg: '!해빛영상',
        sender: '테스트 사용자',
        isGroupChat: false
    });

    assert.equal(videoResponse.status, 200);
    assert.equal(videoResponse.json.reply, 'https://habitchatbot.onrender.com/video/abc123XY');
});

test('messengerbot routes scheduled best-record commands without Gemini', async () => {
    let capturedPeriod = null;
    const { createMessengerbotRouter } = loadWithMocks(
        path.join(__dirname, '..', 'routes', 'messengerbot.js'),
        {
            '../utils/apiKeyAuth': {
                apiKeyAuth: (req, res, next) => next()
            },
            '../utils/chatIdentity': {
                createChatIdentity: ({ platform, userId, displayName, legacySender, room }) => ({
                    platform,
                    userId,
                    displayName,
                    legacySender,
                    room
                })
            },
            '../commands/today': { handleToday: async () => 'TODAY' },
            '../commands/myHabits': { handleMyHabits: async () => 'HABITS' },
            '../commands/weekly': { handleWeekly: async () => 'WEEKLY' },
            '../commands/classStatus': { handleClassStatus: async () => 'CLASS' },
            '../commands/ranking': { handleRanking: async () => 'RANK' },
            '../commands/bestRecords': {
                resolveBestRecordsPeriod: (command) => (
                    String(command).split(/\r?\n/)[0].replace(/\s+/g, '') === '지난주베스트' ? 'week' : null
                ),
                handleBestRecords: async (period) => {
                    capturedPeriod = period;
                    return 'BEST_RECORDS';
                }
            },
            '../commands/guide': {
                handleGuide: async () => 'GUIDE',
                handleApp: async () => 'APP'
            },
            '../commands/categoryHabits': {
                handleDiet: async () => 'DIET',
                handleExercise: async () => 'EXERCISE',
                handleMind: async () => 'MIND'
            },
            '../commands/addFriend': {
                handleAddFriend: async () => 'FRIEND',
                handleMyCode: async () => 'MYCODE'
            },
            '../commands/groupLink': {
                handleGroupLink: async () => 'GROUP_LINK',
                buildGroupLinkGuideMessage: () => 'LINK_GUIDE'
            },
            '../commands/share': {
                handleShare: async () => ({ type: 'text', text: 'SHARE' })
            },
            '../commands/haebit': {
                handleHaebit: async () => 'HAEBIT',
                handleHaebitVideo: async () => 'HAEBIT_VIDEO'
            },
            '../modules/appFirebase': {
                getUserRecords: async () => []
            },
            '../modules/userMapping': {
                getMapping: async () => null,
                getDisplayName: (user) => user.displayName
            },
            '../modules/statsHelpers': {
                hasDiet: () => false,
                hasExercise: () => false,
                hasMind: () => false
            }
        }
    );

    const router = createMessengerbotRouter({
        db: {
            ref() {
                throw new Error('db.ref should not be called for scheduled best commands');
            }
        },
        getChatSession() {
            throw new Error('getChatSession should not be called for scheduled best commands');
        },
        checkAndLogHabits: async () => {
            throw new Error('checkAndLogHabits should not be called for scheduled best commands');
        }
    });

    const response = await postJsonToRouter(router, {
        room: 'open-chat',
        msg: '!지난주베스트\n지난 한 주의 베스트 3를 발표합니다.',
        sender: '오픈채팅봇',
        isGroupChat: false
    });

    assert.equal(response.status, 200);
    assert.equal(capturedPeriod, 'week');
    assert.equal(response.json.reply, 'BEST_RECORDS');
});

test('messengerbot routes YouTube recommendation commands without Gemini', async () => {
    let recommendationCalls = 0;
    const { createMessengerbotRouter } = loadWithMocks(
        path.join(__dirname, '..', 'routes', 'messengerbot.js'),
        {
            '../utils/apiKeyAuth': {
                apiKeyAuth: (req, res, next) => next()
            },
            '../utils/chatIdentity': {
                createChatIdentity: ({ platform, userId, displayName, legacySender, room }) => ({
                    platform,
                    userId,
                    displayName,
                    legacySender,
                    room
                })
            },
            '../commands/today': { handleToday: async () => 'TODAY' },
            '../commands/myHabits': { handleMyHabits: async () => 'HABITS' },
            '../commands/weekly': { handleWeekly: async () => 'WEEKLY' },
            '../commands/classStatus': { handleClassStatus: async () => 'CLASS' },
            '../commands/ranking': { handleRanking: async () => 'RANK' },
            '../commands/bestRecords': {
                resolveBestRecordsPeriod: () => null,
                handleBestRecords: async () => 'BEST'
            },
            '../commands/youtubeRecommendation': {
                handleYoutubeRecommendation: async () => {
                    recommendationCalls += 1;
                    return 'YOUTUBE_RECOMMENDATION';
                }
            },
            '../commands/guide': {
                handleGuide: async () => 'GUIDE',
                handleApp: async () => 'APP'
            },
            '../commands/categoryHabits': {
                handleDiet: async () => 'DIET',
                handleExercise: async () => 'EXERCISE',
                handleMind: async () => 'MIND'
            },
            '../commands/addFriend': {
                handleAddFriend: async () => 'FRIEND',
                handleMyCode: async () => 'MYCODE'
            },
            '../commands/groupLink': {
                handleGroupLink: async () => 'GROUP_LINK',
                buildGroupLinkGuideMessage: () => 'LINK_GUIDE'
            },
            '../commands/share': {
                handleShare: async () => ({ type: 'text', text: 'SHARE' })
            },
            '../commands/haebit': {
                handleHaebit: async () => 'HAEBIT',
                handleHaebitVideo: async () => 'HAEBIT_VIDEO'
            },
            '../modules/appFirebase': {
                getUserRecords: async () => []
            },
            '../modules/userMapping': {
                getMapping: async () => null,
                getDisplayName: (user) => user.displayName
            },
            '../modules/statsHelpers': {
                hasDiet: () => false,
                hasExercise: () => false,
                hasMind: () => false
            }
        }
    );

    const router = createMessengerbotRouter({
        db: {
            ref() {
                throw new Error('db.ref should not be called for YouTube recommendation commands');
            }
        },
        getChatSession() {
            throw new Error('getChatSession should not be called for YouTube recommendation commands');
        },
        checkAndLogHabits: async () => {
            throw new Error('checkAndLogHabits should not be called for YouTube recommendation commands');
        }
    });

    const response = await postJsonToRouter(router, {
        room: 'open-chat',
        msg: '!추천영상',
        sender: '테스트 사용자',
        isGroupChat: false
    });

    assert.equal(response.status, 200);
    assert.equal(recommendationCalls, 1);
    assert.equal(response.json.reply, 'YOUTUBE_RECOMMENDATION');
});
