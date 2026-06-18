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

function buildKakaoBody(utterance) {
    return {
        userRequest: {
            utterance,
            user: {
                id: 'kakao-user-1',
                properties: {
                    nickname: '테스트 사용자'
                }
            }
        }
    };
}

test('kakao help commands return immediately without habit logging or Gemini session', async () => {
    let habitLogCalls = 0;
    let chatSessionCalls = 0;
    let guideCalls = 0;
    let appCardCalls = 0;

    const { createKakaoRouter } = loadWithMocks(
        path.join(__dirname, '..', 'routes', 'kakao.js'),
        {
            '../utils/kakaoTemplate': {
                buildKakaoResponse: (text) => ({ template: { outputs: [{ simpleText: { text } }] } }),
                buildKakaoGuideResponse: (text) => {
                    guideCalls += 1;
                    return { template: { outputs: [{ simpleText: { text } }], quickReplies: [{ messageText: '!앱' }] } };
                },
                buildKakaoAppCardResponse: () => {
                    appCardCalls += 1;
                    return { template: { outputs: [{ basicCard: { title: 'APP_CARD' } }], quickReplies: [{ messageText: '!오늘' }] } };
                },
                buildKakaoShareCardResponse: () => {
                    throw new Error('share response should not be built');
                },
                buildKakaoConnectCardResponse: () => {
                    throw new Error('connect response should not be built');
                }
            },
            '../utils/chatIdentity': {
                createChatIdentity: ({ platform, userId, displayName, legacySender }) => ({
                    platform,
                    userId,
                    displayName,
                    legacySender
                })
            },
            '../commands/today': { handleToday: async () => 'TODAY' },
            '../commands/myHabits': { handleMyHabits: async () => 'HABITS' },
            '../commands/weekly': { handleWeekly: async () => 'WEEKLY' },
            '../commands/classStatus': { handleClassStatus: async () => 'CLASS' },
            '../commands/guide': {
                handleGuide: async () => 'GUIDE'
            },
            '../commands/register': { handleRegister: async () => 'REGISTER' },
            '../commands/ranking': { handleRanking: async () => 'RANK' },
            '../commands/categoryHabits': {
                handleDiet: async () => 'DIET',
                handleExercise: async () => 'EXERCISE',
                handleMind: async () => 'MIND'
            },
            '../commands/addFriend': {
                handleAddFriend: async () => 'FRIEND',
                handleMyCode: async () => 'MYCODE'
            },
            '../commands/connect': {
                handleConnect: async () => ({ type: 'text', text: 'CONNECT' })
            },
            '../commands/share': {
                handleShare: async () => ({ type: 'text', text: 'SHARE' })
            },
            '../commands/haebit': {
                handleHaebit: async () => 'HAEBIT',
                handleHaebitVideo: async () => 'HAEBIT_VIDEO'
            }
        }
    );

    const router = createKakaoRouter({
        db: {},
        getChatSession() {
            chatSessionCalls += 1;
            throw new Error('getChatSession should not be called for help commands');
        },
        checkAndLogHabits: async () => {
            habitLogCalls += 1;
        },
        isAllowedImageUrl: () => true
    });

    const guideResponse = await postJsonToRouter(router, buildKakaoBody('!도움말'));
    assert.equal(guideResponse.status, 200);
    assert.equal(guideResponse.json.template.outputs[0].simpleText.text, 'GUIDE');
    assert.equal(guideResponse.json.template.quickReplies[0].messageText, '!앱');

    const appResponse = await postJsonToRouter(router, buildKakaoBody('!앱'));
    assert.equal(appResponse.status, 200);
    assert.equal(appResponse.json.template.outputs[0].basicCard.title, 'APP_CARD');
    assert.equal(appResponse.json.template.quickReplies[0].messageText, '!오늘');

    assert.equal(habitLogCalls, 0);
    assert.equal(chatSessionCalls, 0);
    assert.equal(guideCalls, 1);
    assert.equal(appCardCalls, 1);
});

test('kakao freeform prompt treats the user as a Habits School student', async () => {
    let capturedPrompt = null;

    const { createKakaoRouter } = loadWithMocks(
        path.join(__dirname, '..', 'routes', 'kakao.js'),
        {
            '../utils/kakaoTemplate': {
                buildKakaoResponse: (text) => ({ template: { outputs: [{ simpleText: { text } }] } }),
                buildKakaoGuideResponse: (text) => ({ template: { outputs: [{ simpleText: { text } }] } }),
                buildKakaoAppCardResponse: () => ({ template: { outputs: [{ basicCard: { title: 'APP_CARD' } }] } }),
                buildKakaoShareCardResponse: () => ({ template: { outputs: [{ simpleText: { text: 'SHARE' } }] } }),
                buildKakaoConnectCardResponse: () => ({ template: { outputs: [{ simpleText: { text: 'CONNECT' } }] } })
            },
            '../utils/chatIdentity': {
                createChatIdentity: ({ platform, userId, displayName, legacySender }) => ({
                    platform,
                    userId,
                    displayName,
                    legacySender
                })
            },
            '../commands/today': { handleToday: async () => 'TODAY' },
            '../commands/myHabits': { handleMyHabits: async () => 'HABITS' },
            '../commands/weekly': { handleWeekly: async () => 'WEEKLY' },
            '../commands/classStatus': { handleClassStatus: async () => 'CLASS' },
            '../commands/guide': { handleGuide: async () => 'GUIDE' },
            '../commands/register': { handleRegister: async () => 'REGISTER' },
            '../commands/ranking': { handleRanking: async () => 'RANK' },
            '../commands/categoryHabits': {
                handleDiet: async () => 'DIET',
                handleExercise: async () => 'EXERCISE',
                handleMind: async () => 'MIND'
            },
            '../commands/addFriend': {
                handleAddFriend: async () => 'FRIEND',
                handleMyCode: async () => 'MYCODE'
            },
            '../commands/connect': {
                handleConnect: async () => ({ type: 'text', text: 'CONNECT' })
            },
            '../commands/share': {
                handleShare: async () => ({ type: 'text', text: 'SHARE' })
            },
            '../commands/haebit': {
                handleHaebit: async () => 'HAEBIT',
                handleHaebitVideo: async () => 'HAEBIT_VIDEO'
            }
        }
    );

    const router = createKakaoRouter({
        db: {},
        getChatSession() {
            return {
                async sendMessage(prompt) {
                    capturedPrompt = Array.isArray(prompt) ? prompt[0] : prompt;
                    return {
                        response: {
                            text: () => 'AI'
                        }
                    };
                }
            };
        },
        checkAndLogHabits: async () => {},
        isAllowedImageUrl: () => true
    });

    const response = await postJsonToRouter(router, {
        userRequest: {
            utterance: '!안녕하세요',
            user: {
                id: 'kakao-user-1',
                properties: {
                    nickname: '최석재 코치'
                }
            }
        }
    });

    assert.equal(response.status, 200);
    assert.equal(response.json.template.outputs[0].simpleText.text, 'AI');
    assert.match(capturedPrompt, /해빛스쿨 학생/);
    assert.match(capturedPrompt, /'최석재님'/);
    assert.match(capturedPrompt, /절대 '최석재 코치님', '코치님', '선생님'이라고 부르지 마세요/);
    assert.doesNotMatch(capturedPrompt, /이름을 부를 때는 '최석재 코치님'/);
});

test('kakao share command sends the image first and follows with an invite callback', async () => {
    const callbackPosts = [];

    const { createKakaoRouter } = loadWithMocks(
        path.join(__dirname, '..', 'routes', 'kakao.js'),
        {
            'axios': {
                post: async (url, payload) => {
                    callbackPosts.push({ url, payload });
                    return { status: 200 };
                }
            },
            '../utils/kakaoTemplate': {
                buildKakaoResponse: (text) => ({ template: { outputs: [{ simpleText: { text } }] } }),
                buildKakaoGuideResponse: (text) => ({ template: { outputs: [{ simpleText: { text } }] } }),
                buildKakaoAppCardResponse: () => ({ template: { outputs: [{ basicCard: { title: 'APP_CARD' } }] } }),
                buildKakaoShareImageResponse: () => ({
                    version: '2.0',
                    template: {
                        outputs: [{ simpleImage: { imageUrl: 'https://image.example/share.png', altText: 'CARD' } }]
                    }
                }),
                buildKakaoShareInviteResponse: () => ({
                    version: '2.0',
                    template: {
                        outputs: [{ simpleText: { text: 'INVITE_LINK' } }]
                    }
                }),
                buildKakaoShareCardResponse: () => ({ template: { outputs: [{ simpleText: { text: 'SYNC_SHARE' } }] } }),
                buildKakaoConnectCardResponse: () => ({ template: { outputs: [{ simpleText: { text: 'CONNECT' } }] } })
            },
            '../utils/chatIdentity': {
                createChatIdentity: ({ platform, userId, displayName, legacySender }) => ({
                    platform,
                    userId,
                    displayName,
                    legacySender
                })
            },
            '../commands/today': { handleToday: async () => 'TODAY' },
            '../commands/myHabits': { handleMyHabits: async () => 'HABITS' },
            '../commands/weekly': { handleWeekly: async () => 'WEEKLY' },
            '../commands/classStatus': { handleClassStatus: async () => 'CLASS' },
            '../commands/guide': { handleGuide: async () => 'GUIDE' },
            '../commands/register': { handleRegister: async () => 'REGISTER' },
            '../commands/ranking': { handleRanking: async () => 'RANK' },
            '../commands/categoryHabits': {
                handleDiet: async () => 'DIET',
                handleExercise: async () => 'EXERCISE',
                handleMind: async () => 'MIND'
            },
            '../commands/addFriend': {
                handleAddFriend: async () => 'FRIEND',
                handleMyCode: async () => 'MYCODE'
            },
            '../commands/connect': {
                handleConnect: async () => ({ type: 'text', text: 'CONNECT' })
            },
            '../commands/share': {
                handleShare: async () => ({ type: 'share-card', imageUrl: 'https://image.example/share.png' })
            },
            '../commands/haebit': {
                handleHaebit: async () => 'HAEBIT',
                handleHaebitVideo: async () => 'HAEBIT_VIDEO'
            }
        }
    );

    const router = createKakaoRouter({
        db: {},
        getChatSession() {
            throw new Error('getChatSession should not be called for share command');
        },
        checkAndLogHabits: async () => {
            throw new Error('checkAndLogHabits should not be called for share command');
        },
        isAllowedImageUrl: () => true
    });

    const response = await postJsonToRouter(router, {
        userRequest: {
            utterance: '!공유',
            callbackUrl: 'https://callback.example.com/reply',
            user: {
                id: 'kakao-user-1',
                properties: {
                    nickname: '테스트 사용자'
                }
            }
        }
    });

    assert.equal(response.status, 200);
    assert.equal(response.json.useCallback, true);
    assert.equal(response.json.template.outputs.length, 1);
    assert.equal(response.json.template.outputs[0].simpleImage.imageUrl, 'https://image.example/share.png');

    await new Promise((resolve) => setTimeout(resolve, 260));

    assert.equal(callbackPosts.length, 1);
    assert.equal(callbackPosts[0].url, 'https://callback.example.com/reply');
    assert.equal(callbackPosts[0].payload.template.outputs[0].simpleText.text, 'INVITE_LINK');
});

test('kakao haebit command returns a public share link without habit logging or Gemini', async () => {
    const { createKakaoRouter } = loadWithMocks(
        path.join(__dirname, '..', 'routes', 'kakao.js'),
        {
            '../utils/kakaoTemplate': {
                buildKakaoResponse: (text) => ({ template: { outputs: [{ simpleText: { text } }] } }),
                buildKakaoGuideResponse: (text) => ({ template: { outputs: [{ simpleText: { text } }] } }),
                buildKakaoAppCardResponse: () => ({ template: { outputs: [{ basicCard: { title: 'APP_CARD' } }] } }),
                buildKakaoShareImageResponse: () => ({ template: { outputs: [{ simpleImage: { imageUrl: 'SHARE_IMAGE' } }] } }),
                buildKakaoShareInviteResponse: () => ({ template: { outputs: [{ simpleText: { text: 'INVITE' } }] } }),
                buildKakaoShareCardResponse: () => ({ template: { outputs: [{ simpleText: { text: 'SHARE' } }] } }),
                buildKakaoConnectCardResponse: () => ({ template: { outputs: [{ simpleText: { text: 'CONNECT' } }] } })
            },
            '../utils/chatIdentity': {
                createChatIdentity: ({ platform, userId, displayName, legacySender }) => ({
                    platform,
                    userId,
                    displayName,
                    legacySender
                })
            },
            '../commands/today': { handleToday: async () => 'TODAY' },
            '../commands/myHabits': { handleMyHabits: async () => 'HABITS' },
            '../commands/weekly': { handleWeekly: async () => 'WEEKLY' },
            '../commands/classStatus': { handleClassStatus: async () => 'CLASS' },
            '../commands/guide': { handleGuide: async () => 'GUIDE' },
            '../commands/register': { handleRegister: async () => 'REGISTER' },
            '../commands/ranking': { handleRanking: async () => 'RANK' },
            '../commands/categoryHabits': {
                handleDiet: async () => 'DIET',
                handleExercise: async () => 'EXERCISE',
                handleMind: async () => 'MIND'
            },
            '../commands/addFriend': {
                handleAddFriend: async () => 'FRIEND',
                handleMyCode: async () => 'MYCODE'
            },
            '../commands/connect': {
                handleConnect: async () => ({ type: 'text', text: 'CONNECT' })
            },
            '../commands/share': {
                handleShare: async () => ({ type: 'text', text: 'SHARE' })
            },
            '../commands/haebit': {
                handleHaebit: async () => 'https://habitchatbot.onrender.com/abc123XY',
                handleHaebitVideo: async () => 'https://habitchatbot.onrender.com/v/abc123XY.mp4'
            }
        }
    );

    const router = createKakaoRouter({
        db: {},
        getChatSession() {
            throw new Error('getChatSession should not be called for haebit command');
        },
        checkAndLogHabits: async () => {
            throw new Error('checkAndLogHabits should not be called for haebit command');
        },
        isAllowedImageUrl: () => true
    });

    const response = await postJsonToRouter(router, buildKakaoBody('!해빛'));

    assert.equal(response.status, 200);
    assert.equal(response.json.template.outputs[0].simpleText.text, 'https://habitchatbot.onrender.com/abc123XY');

    const videoResponse = await postJsonToRouter(router, buildKakaoBody('!해빛영상'));

    assert.equal(videoResponse.status, 200);
    assert.equal(
        videoResponse.json.template.outputs[0].simpleText.text,
        'https://habitchatbot.onrender.com/v/abc123XY.mp4'
    );
});

test('kakao routes best-record commands without habit logging or Gemini', async () => {
    let capturedPeriod = null;

    const { createKakaoRouter } = loadWithMocks(
        path.join(__dirname, '..', 'routes', 'kakao.js'),
        {
            '../utils/kakaoTemplate': {
                buildKakaoResponse: (text) => ({ template: { outputs: [{ simpleText: { text } }] } }),
                buildKakaoGuideResponse: (text) => ({ template: { outputs: [{ simpleText: { text } }] } }),
                buildKakaoAppCardResponse: () => ({ template: { outputs: [{ basicCard: { title: 'APP_CARD' } }] } }),
                buildKakaoShareCardResponse: () => ({ template: { outputs: [{ simpleText: { text: 'SHARE' } }] } }),
                buildKakaoConnectCardResponse: () => ({ template: { outputs: [{ simpleText: { text: 'CONNECT' } }] } })
            },
            '../utils/chatIdentity': {
                createChatIdentity: ({ platform, userId, displayName, legacySender }) => ({
                    platform,
                    userId,
                    displayName,
                    legacySender
                })
            },
            '../commands/today': { handleToday: async () => 'TODAY' },
            '../commands/myHabits': { handleMyHabits: async () => 'HABITS' },
            '../commands/weekly': { handleWeekly: async () => 'WEEKLY' },
            '../commands/classStatus': { handleClassStatus: async () => 'CLASS' },
            '../commands/guide': { handleGuide: async () => 'GUIDE' },
            '../commands/register': { handleRegister: async () => 'REGISTER' },
            '../commands/ranking': { handleRanking: async () => 'RANK' },
            '../commands/bestRecords': {
                resolveBestRecordsPeriod: (command) => (
                    String(command).replace(/\s+/g, '') === '지난달베스트' ? 'month' : null
                ),
                handleBestRecords: async (period) => {
                    capturedPeriod = period;
                    return 'BEST_RECORDS';
                }
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
            '../commands/connect': {
                handleConnect: async () => ({ type: 'text', text: 'CONNECT' })
            },
            '../commands/share': {
                handleShare: async () => ({ type: 'text', text: 'SHARE' })
            },
            '../commands/haebit': {
                handleHaebit: async () => 'HAEBIT',
                handleHaebitVideo: async () => 'HAEBIT_VIDEO'
            }
        }
    );

    const router = createKakaoRouter({
        db: {},
        getChatSession() {
            throw new Error('getChatSession should not be called for best-record commands');
        },
        checkAndLogHabits: async () => {
            throw new Error('checkAndLogHabits should not be called for best-record commands');
        },
        isAllowedImageUrl: () => true
    });

    const response = await postJsonToRouter(router, buildKakaoBody('!지난달 베스트'));

    assert.equal(response.status, 200);
    assert.equal(capturedPeriod, 'month');
    assert.equal(response.json.template.outputs[0].simpleText.text, 'BEST_RECORDS');
});
