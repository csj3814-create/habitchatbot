const test = require('node:test');
const assert = require('node:assert/strict');
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
        return require(resolvedTarget);
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

function createSnapshot(id, data) {
    return {
        id,
        exists: data !== null && data !== undefined,
        data: () => data
    };
}

function createFakeFriendDb({ myUid, myData, targetUid, targetData, friendshipData }) {
    const writes = [];
    let notificationId = 0;
    const friendshipId = [myUid, targetUid].sort().join('__');

    return {
        writes,
        collection(name) {
            if (name === 'users') {
                return {
                    where(field, operator, value) {
                        assert.equal(field, 'referralCode');
                        assert.equal(operator, '==');

                        return {
                            limit(count) {
                                assert.equal(count, 1);

                                return {
                                    async get() {
                                        if (targetData && value === targetData.referralCode) {
                                            return {
                                                empty: false,
                                                docs: [{ id: targetUid, data: () => targetData }]
                                            };
                                        }

                                        return { empty: true, docs: [] };
                                    }
                                };
                            }
                        };
                    }
                };
            }

            if (name === 'notifications') {
                return {
                    doc() {
                        notificationId += 1;
                        return { path: `notifications/${notificationId}` };
                    }
                };
            }

            throw new Error(`Unexpected collection: ${name}`);
        },
        doc(docPath) {
            return { path: docPath };
        },
        async runTransaction(handler) {
            const txWrites = [];
            const tx = {
                async get(ref) {
                    if (ref.path === `users/${myUid}`) {
                        return createSnapshot(myUid, myData);
                    }

                    if (ref.path === `users/${targetUid}`) {
                        return createSnapshot(targetUid, targetData);
                    }

                    if (ref.path === `friendships/${friendshipId}`) {
                        return createSnapshot(friendshipId, friendshipData);
                    }

                    throw new Error(`Unexpected tx.get path: ${ref.path}`);
                },
                set(ref, data, options) {
                    txWrites.push({ path: ref.path, data, options });
                }
            };

            const result = await handler(tx);
            writes.push(...txWrites);
            return result;
        }
    };
}

const adminMock = {
    firestore: {
        FieldValue: {
            serverTimestamp: () => 'SERVER_TIMESTAMP'
        },
        Timestamp: {
            fromDate: (date) => ({
                toMillis: () => date.getTime(),
                iso: date.toISOString()
            })
        }
    }
};

test('handleRegister shows link-code guidance for an unlinked user', async () => {
    const { handleRegister } = loadWithMocks(
        path.join(__dirname, '..', 'commands', 'register.js'),
        {
            '../modules/appFirebase': {
                consumeChatbotLinkCode: async () => null
            },
            '../modules/userMapping': {
                registerUser: async () => {},
                getMapping: async () => null,
                removeMapping: async () => {},
                getDisplayName: (user) => user.displayName
            }
        }
    );

    const result = await handleRegister({ displayName: '테스트' }, '');
    assert.match(result, /!등록 ABCD1234/);
    assert.match(result, /!연결/);
});

test('handleRegister consumes a valid code and stores the mapping', async () => {
    let capturedRegistration = null;

    const { handleRegister } = loadWithMocks(
        path.join(__dirname, '..', 'commands', 'register.js'),
        {
            '../modules/appFirebase': {
                consumeChatbotLinkCode: async (code) => {
                    assert.equal(code, 'ABCD1234');
                    return {
                        uid: 'app-user-1',
                        email: 'linked@example.com',
                        displayName: '연결 사용자'
                    };
                }
            },
            '../modules/userMapping': {
                registerUser: async (...args) => {
                    capturedRegistration = args;
                },
                getMapping: async () => null,
                removeMapping: async () => {},
                getDisplayName: (user) => user.displayName
            }
        }
    );

    const user = { displayName: '채팅 사용자', platform: 'kakao', userId: 'kakao-1' };
    const result = await handleRegister(user, 'abcd1234');

    assert.match(result, /!내습관/);
    assert.deepEqual(capturedRegistration, [user, 'linked@example.com', 'app-user-1']);
});

test('handleMyCode returns an invite link and fallback friend code', async () => {
    const { handleMyCode } = loadWithMocks(
        path.join(__dirname, '..', 'commands', 'addFriend.js'),
        {
            'firebase-admin': adminMock,
            '../modules/appFirebase': {
                initAppFirebase: () => ({
                    doc(docPath) {
                        assert.equal(docPath, 'users/app-user-1');
                        return {
                            async get() {
                                return createSnapshot('app-user-1', {
                                    referralCode: 'ABC123',
                                    displayName: '초대 사용자'
                                });
                            }
                        };
                    }
                })
            },
            '../modules/userMapping': {
                getMapping: async () => ({ googleUid: 'app-user-1' }),
                getDisplayName: (user) => user.displayName
            }
        }
    );

    const result = await handleMyCode({ displayName: '테스트 사용자' });

    assert.match(result, /https:\/\/habitschool\.web\.app\/\?ref=ABC123/);
    assert.match(result, /친구 코드: ABC123/);
    assert.match(result, /!친구 ABC123/);
});

test('handleAddFriend allows a new request even when the user already has many friends', async () => {
    const db = createFakeFriendDb({
        myUid: 'me',
        myData: {
            referralCode: 'ME0001',
            displayName: '나',
            friends: Array.from({ length: 10 }, (_, index) => `friend-${index}`)
        },
        targetUid: 'target',
        targetData: {
            referralCode: 'ABC123',
            displayName: '상대',
            friends: []
        },
        friendshipData: null
    });

    const { handleAddFriend } = loadWithMocks(
        path.join(__dirname, '..', 'commands', 'addFriend.js'),
        {
            'firebase-admin': adminMock,
            '../modules/appFirebase': {
                initAppFirebase: () => db
            },
            '../modules/userMapping': {
                getMapping: async () => ({ googleUid: 'me' }),
                getDisplayName: (user) => user.displayName
            }
        }
    );

    const result = await handleAddFriend({ displayName: '보내는 사람' }, 'ABC123');

    assert.match(result, /친구 요청을 보냈어요/);
    assert.ok(db.writes.some((write) => write.path.startsWith('friendships/')));
    assert.ok(db.writes.some((write) => write.path.startsWith('notifications/')));
});

test('handleAddFriend no longer mentions a global max-friends cap when users are already connected', async () => {
    const db = createFakeFriendDb({
        myUid: 'me',
        myData: {
            referralCode: 'ME0001',
            displayName: '나',
            friends: ['target']
        },
        targetUid: 'target',
        targetData: {
            referralCode: 'ABC123',
            displayName: '상대',
            friends: ['me']
        },
        friendshipData: {
            status: 'active'
        }
    });

    const { handleAddFriend } = loadWithMocks(
        path.join(__dirname, '..', 'commands', 'addFriend.js'),
        {
            'firebase-admin': adminMock,
            '../modules/appFirebase': {
                initAppFirebase: () => db
            },
            '../modules/userMapping': {
                getMapping: async () => ({ googleUid: 'me' }),
                getDisplayName: (user) => user.displayName
            }
        }
    );

    const result = await handleAddFriend({ displayName: '보내는 사람' }, 'ABC123');

    assert.match(result, /현재 친구 수: 1명/);
    assert.doesNotMatch(result, /\/3/);
});

test('handleShare asks the user to link their account first', async () => {
    const { handleShare } = loadWithMocks(
        path.join(__dirname, '..', 'commands', 'share.js'),
        {
            '../config': { RENDER_URL: 'https://habitchatbot.example.com' },
            '../modules/userMapping': {
                getMapping: async () => null,
                getDisplayName: (user) => user.displayName
            },
            '../modules/appFirebase': {
                getShareCardPayload: async () => null,
                createShareCardToken: async () => 'unused'
            }
        }
    );

    const result = await handleShare({ displayName: '테스트 사용자', userId: 'kakao-1' });

    assert.equal(result.type, 'text');
    assert.match(result.text, /!등록/);
});

test('handleShare explains when no shareable record exists yet', async () => {
    const { handleShare } = loadWithMocks(
        path.join(__dirname, '..', 'commands', 'share.js'),
        {
            '../config': { RENDER_URL: 'https://habitchatbot.example.com' },
            '../modules/userMapping': {
                getMapping: async () => ({ googleUid: 'app-user-1' }),
                getDisplayName: (user) => user.displayName
            },
            '../modules/appFirebase': {
                getShareCardPayload: async () => null,
                createShareCardToken: async () => 'unused'
            }
        }
    );

    const result = await handleShare({ displayName: '테스트 사용자', userId: 'kakao-1' });

    assert.equal(result.type, 'text');
    assert.match(result.text, /!공유/);
});

test('handleShare returns a share-card payload with a tokenized image URL', async () => {
    const { handleShare } = loadWithMocks(
        path.join(__dirname, '..', 'commands', 'share.js'),
        {
            '../config': { RENDER_URL: 'https://habitchatbot.example.com/' },
            '../modules/userMapping': {
                getMapping: async () => ({ googleUid: 'app-user-1' }),
                getDisplayName: (user) => user.displayName
            },
            '../modules/appFirebase': {
                getShareCardPayload: async () => ({
                    subtitle: '오늘의 해빛 요약을 카드로 정리했어요.',
                    appUrl: 'https://habitschool.web.app/#gallery'
                }),
                createShareCardToken: async ({ googleUid, kakaoUserKey }) => {
                    assert.equal(googleUid, 'app-user-1');
                    assert.equal(kakaoUserKey, 'kakao-1');
                    return 'share-token-1';
                }
            }
        }
    );

    const result = await handleShare({ displayName: '테스트 사용자', userId: 'kakao-1' });

    assert.equal(result.type, 'share-card');
    assert.equal(result.imageUrl, 'https://habitchatbot.example.com/api/share-card/share-token-1.png');
    assert.equal(result.webLinkUrl, 'https://habitschool.web.app/#gallery');
});

test('handleConnect returns a deep-link card for an unlinked user', async () => {
    const { handleConnect } = loadWithMocks(
        path.join(__dirname, '..', 'commands', 'connect.js'),
        {
            '../modules/userMapping': {
                getMapping: async () => null,
                getDisplayName: (user) => user.displayName
            },
            '../modules/chatbotConnect': {
                createChatbotConnectToken: async (user) => {
                    assert.equal(user.userId, 'kakao-1');
                    return {
                        token: 'connect-token-1',
                        expiresAt: '2026-04-05T00:10:00.000Z',
                        webLinkUrl: 'https://habitschool.web.app/?chatbotConnectToken=connect-token-1#profile'
                    };
                }
            }
        }
    );

    const result = await handleConnect({ displayName: '테스트 사용자', userId: 'kakao-1', platform: 'kakao' });

    assert.equal(result.type, 'connect-card');
    assert.equal(result.webLinkUrl, 'https://habitschool.web.app/?chatbotConnectToken=connect-token-1#profile');
    assert.equal(result.expiresAt, '2026-04-05T00:10:00.000Z');
});

test('handleConnect explains when the user is already linked', async () => {
    const { handleConnect } = loadWithMocks(
        path.join(__dirname, '..', 'commands', 'connect.js'),
        {
            '../modules/userMapping': {
                getMapping: async () => ({ googleUid: 'app-user-1', googleEmail: 'linked@example.com' }),
                getDisplayName: (user) => user.displayName
            },
            '../modules/chatbotConnect': {
                createChatbotConnectToken: async () => {
                    throw new Error('should not be called');
                }
            }
        }
    );

    const result = await handleConnect({ displayName: '테스트 사용자', userId: 'kakao-1', platform: 'kakao' });

    assert.equal(result.type, 'text');
    assert.match(result.text, /!등록/);
    assert.match(result.text, /!연결/);
});

test('handleGuide includes the web-app entry URL and short connect guidance', async () => {
    const { handleGuide } = loadWithMocks(
        path.join(__dirname, '..', 'commands', 'guide.js'),
        {}
    );

    const result = await handleGuide('테스트 사용자');

    assert.match(result, /로그인 후 기록하면 시작돼요/);
    assert.match(result, /심플형 앱/);
    assert.match(result, /https:\/\/habitschool\.web\.app\/simple\//);
    assert.match(result, /식단 운동 수면 마음 기록/);
    assert.match(result, /갤러리 친구 활동 확인/);
    assert.match(result, /필요할 때만\s*!연결/);
});

test('handleApp keeps the app-start copy short and points to the web app', async () => {
    const { handleApp } = loadWithMocks(
        path.join(__dirname, '..', 'commands', 'guide.js'),
        {}
    );

    const result = await handleApp();

    assert.match(result, /심플형 앱/);
    assert.match(result, /앱에서 할 일/);
    assert.match(result, /https:\/\/habitschool\.web\.app\/simple\//);
    assert.match(result, /갤러리 보기/);
    assert.match(result, /친구 초대 관리/);
    assert.match(result, /!오늘 !내습관 !주간 !공유/);
});

test('buildDirectChatOnlyMessage explains that connect commands are 1:1 only', async () => {
    const { buildDirectChatOnlyMessage } = loadWithMocks(
        path.join(__dirname, '..', 'commands', 'connect.js'),
        {
            '../modules/userMapping': {
                getMapping: async () => null,
                getDisplayName: (user) => user.displayName
            },
            '../modules/chatbotConnect': {
                createChatbotConnectToken: async () => {
                    throw new Error('should not be called');
                }
            }
        }
    );

    const result = buildDirectChatOnlyMessage();

    assert.match(result, /1:1/);
    assert.match(result, /!연결/);
    assert.match(result, /pf\.kakao\.com\/_QDZZX\/chat/);
    assert.doesNotMatch(result, /!등록/);
});
