/**
 * Friend code helpers for Habits School chatbot.
 * `!내코드` shows the user's invite link and fallback friend code.
 * `!친구 CODE` creates a pending request that must be accepted in the app.
 */

const admin = require('firebase-admin');
const { initAppFirebase } = require('../modules/appFirebase');
const { getMapping, getDisplayName } = require('../modules/userMapping');

const CODE_REGEX = /^[A-Z0-9]{6}$/i;
const FRIEND_REQUEST_TTL_DAYS = 3;
const DEFAULT_APP_URL = 'https://habitschool.web.app';

function getUserLabel(userData, fallback = '친구') {
    return userData?.customDisplayName || userData?.displayName || fallback;
}

function buildFriendshipId(uidA, uidB) {
    return [uidA, uidB].sort().join('__');
}

function buildInviteUrl(referralCode) {
    const baseUrl = process.env.HABITSCHOOL_APP_URL || DEFAULT_APP_URL;

    try {
        const url = new URL(baseUrl);
        url.searchParams.set('ref', referralCode);
        return url.toString();
    } catch (_) {
        return `${DEFAULT_APP_URL}/?ref=${encodeURIComponent(referralCode)}`;
    }
}

function buildLinkFirstMessage(displayName) {
    return `${displayName}님은 아직 해빛스쿨 계정이 연결되지 않았어요.\n먼저 카카오 1:1 채팅에서 !연결을 입력해 주세요.\n수동 방식이 필요하면 앱에서 연결 코드를 만든 뒤 !등록 코드도 사용할 수 있어요.`;
}

async function handleMyCode(user) {
    const displayName = getDisplayName(user);
    const mapping = await getMapping(user);

    if (!mapping) {
        return buildLinkFirstMessage(displayName);
    }

    const db = initAppFirebase();
    if (!db) {
        return '앱 서버 연결 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.';
    }

    try {
        const userSnap = await db.doc(`users/${mapping.googleUid}`).get();
        if (!userSnap.exists) {
            return '앱 계정 정보를 찾을 수 없어요.';
        }

        const referralCode = userSnap.data().referralCode;
        if (!referralCode) {
            return '아직 초대 코드가 준비되지 않았어요. 앱에 다시 접속한 뒤 !내코드를 다시 확인해 주세요.';
        }

        const inviteUrl = buildInviteUrl(referralCode);

        return `내 초대 링크
────────
${inviteUrl}

이 링크를 보내면
- 아직 가입 전: 추천 가입이 기록되고 가입 후 친구 연결까지 이어져요.
- 이미 가입함: 앱에서 확인 후 바로 친구로 연결돼요.

수동으로 코드만 보내려면
친구 코드: ${referralCode}
상대가 !친구 ${referralCode} 를 입력하면 앱에서 친구 요청을 수락할 수 있어요.

친구 요청은 ${FRIEND_REQUEST_TTL_DAYS}일 동안 유효해요.`;
    } catch (error) {
        console.error('[addFriend] Failed to load my code:', error.message);
        return '초대 링크를 불러오는 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.';
    }
}

async function handleAddFriend(user, args) {
    const displayName = getDisplayName(user);

    if (!args || args.trim() === '') {
        return `친구 연결 방법
────────
가장 쉬운 방법
1. 내가 !내코드를 입력해 초대 링크를 확인해요.
2. 그 링크를 상대에게 보내요.
3. 상대가 링크를 열어 가입하거나 앱에서 확인하면 친구 연결이 진행돼요.

코드로 직접 요청하려면
!친구 ABC123

코드 요청은 앱에서 수락해야 완료되고, ${FRIEND_REQUEST_TTL_DAYS}일 동안 유지돼요.`;
    }

    const code = args.trim().toUpperCase();
    if (!CODE_REGEX.test(code)) {
        return '친구 코드는 영문과 숫자 6자리예요.\n예시: !친구 ABC123';
    }

    const myMapping = await getMapping(user);
    if (!myMapping) {
        return buildLinkFirstMessage(displayName);
    }

    const db = initAppFirebase();
    if (!db) {
        return '앱 서버 연결 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.';
    }

    try {
        const targetQuery = await db.collection('users')
            .where('referralCode', '==', code)
            .limit(1)
            .get();

        if (targetQuery.empty) {
            return `${code} 코드를 가진 사용자를 찾지 못했어요.\n코드를 다시 확인해 주세요.`;
        }

        const targetDoc = targetQuery.docs[0];
        const targetUid = targetDoc.id;
        const targetData = targetDoc.data();
        const targetName = getUserLabel(targetData);
        const myUid = myMapping.googleUid;
        const friendshipId = buildFriendshipId(myUid, targetUid);
        const nowMs = Date.now();
        const expiresAtDate = new Date(nowMs + FRIEND_REQUEST_TTL_DAYS * 24 * 60 * 60 * 1000);

        if (targetUid === myUid) {
            return '자기 자신을 친구로 추가할 수는 없어요.';
        }

        const outcome = await db.runTransaction(async (tx) => {
            const myRef = db.doc(`users/${myUid}`);
            const targetRef = db.doc(`users/${targetUid}`);
            const friendshipRef = db.doc(`friendships/${friendshipId}`);

            const [mySnap, targetSnap, friendshipSnap] = await Promise.all([
                tx.get(myRef),
                tx.get(targetRef),
                tx.get(friendshipRef)
            ]);

            if (!mySnap.exists) {
                return { status: 'missing_me' };
            }

            if (!targetSnap.exists) {
                return { status: 'missing_target' };
            }

            const myData = mySnap.data() || {};
            const targetLatestData = targetSnap.data() || {};
            const myFriends = Array.isArray(myData.friends) ? myData.friends : [];
            const targetFriends = Array.isArray(targetLatestData.friends) ? targetLatestData.friends : [];
            const friendshipData = friendshipSnap.exists ? (friendshipSnap.data() || {}) : {};
            const existingExpiresAt = friendshipData.expiresAt;
            const isExpired = friendshipData.status === 'pending'
                && existingExpiresAt?.toMillis
                && existingExpiresAt.toMillis() < nowMs;
            const isMutualFriend = friendshipData.status === 'active'
                || (myFriends.includes(targetUid) && targetFriends.includes(myUid));

            if (isMutualFriend) {
                tx.set(friendshipRef, {
                    users: [myUid, targetUid].sort(),
                    userNames: {
                        [myUid]: getUserLabel(myData, displayName),
                        [targetUid]: getUserLabel(targetLatestData, targetName)
                    },
                    status: 'active',
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });

                return {
                    status: 'already_friends',
                    friendCount: myFriends.length
                };
            }

            if (friendshipData.status === 'pending' && !isExpired) {
                if (friendshipData.pendingForUid === myUid) {
                    return {
                        status: 'incoming_pending',
                        friendName: getUserLabel(targetLatestData, targetName)
                    };
                }

                if (friendshipData.requesterUid === myUid) {
                    return {
                        status: 'pending_exists',
                        friendName: getUserLabel(targetLatestData, targetName)
                    };
                }

                return {
                    status: 'other_pending',
                    friendName: getUserLabel(targetLatestData, targetName)
                };
            }

            if (isExpired) {
                tx.set(friendshipRef, {
                    status: 'expired',
                    expiredAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            }

            if (!myData.referralCode) {
                return { status: 'my_code_missing' };
            }

            const timestamp = admin.firestore.FieldValue.serverTimestamp();
            const expiresAt = admin.firestore.Timestamp.fromDate(expiresAtDate);

            tx.set(friendshipRef, {
                users: [myUid, targetUid].sort(),
                userNames: {
                    [myUid]: getUserLabel(myData, displayName),
                    [targetUid]: getUserLabel(targetLatestData, targetName)
                },
                status: 'pending',
                createdAt: friendshipData.createdAt || timestamp,
                updatedAt: timestamp,
                requesterUid: myUid,
                requesterName: getUserLabel(myData, displayName),
                pendingForUid: targetUid,
                requestedAt: timestamp,
                expiresAt,
                source: 'chatbot'
            }, { merge: true });

            const notificationRef = db.collection('notifications').doc();
            tx.set(notificationRef, {
                postOwnerId: targetUid,
                type: 'friend_request',
                fromUserId: myUid,
                fromUserName: getUserLabel(myData, displayName),
                friendshipId,
                createdAt: timestamp,
                expiresAt
            });

            return {
                status: 'pending_created',
                friendName: getUserLabel(targetLatestData, targetName)
            };
        });

        switch (outcome.status) {
        case 'already_friends':
            return `${targetName}님과는 이미 서로 친구예요.\n이제 앱 갤러리와 소셜 챌린지에서 함께 볼 수 있어요.\n\n현재 친구 수: ${outcome.friendCount}명`;
        case 'pending_created':
            return `${outcome.friendName}님에게 친구 요청을 보냈어요.\n────────\n상대가 해빛스쿨 앱에서 요청을 수락하면 친구 연결이 완료돼요.\n\n더 쉬운 초대 방식이 필요하면 !내코드로 초대 링크를 다시 확인해 보세요.\n요청 만료: ${FRIEND_REQUEST_TTL_DAYS}일`;
        case 'pending_exists':
            return `${outcome.friendName}님에게 이미 친구 요청을 보냈어요.\n상대가 앱에서 수락하면 친구 연결이 완료돼요.\n\n요청은 ${FRIEND_REQUEST_TTL_DAYS}일 뒤에 만료돼요.`;
        case 'incoming_pending':
            return `${outcome.friendName}님이 먼저 친구 요청을 보냈어요.\n해빛스쿨 앱에서 수락 또는 거절해 주세요.\n\n요청은 ${FRIEND_REQUEST_TTL_DAYS}일 뒤에 만료돼요.`;
        case 'other_pending':
            return `${outcome.friendName}님과의 친구 요청이 이미 진행 중이에요.\n해빛스쿨 앱에서 현재 상태를 확인해 주세요.`;
        case 'my_code_missing':
            return '내 친구 코드가 아직 준비되지 않았어요.\n해빛스쿨 앱에 다시 접속한 뒤 !내코드를 다시 확인해 주세요.';
        case 'missing_me':
            return '내 앱 계정 정보를 찾을 수 없어요.';
        case 'missing_target':
            return `${targetName}님의 앱 계정 정보를 찾을 수 없어요.`;
        default:
            return '친구 연결 중 예상하지 못한 문제가 발생했어요. 잠시 후 다시 시도해 주세요.';
        }
    } catch (error) {
        console.error('[addFriend] Failed to manage friendship:', error.message);
        return '친구 연결 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.';
    }
}

module.exports = { handleAddFriend, handleMyCode };
