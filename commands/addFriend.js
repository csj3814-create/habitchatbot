/**
 * Friend code helpers for Habits School chatbot.
 * `!내코드` shows the user's invite link and fallback friend code.
 * `!친구 CODE` creates a pending request that must be accepted in the app.
 */

const admin = require('firebase-admin');
const { initAppFirebase } = require('../modules/appFirebase');
const { getMapping, getDisplayName } = require('../modules/userMapping');
const { buildUnlinkedMessage } = require('../modules/chatLink');
const { buildHabitsSchoolInviteUrl } = require('../utils/appLinks');

const CODE_REGEX = /^[A-Z0-9]{6}$/i;
const FRIEND_REQUEST_TTL_DAYS = 3;
function getUserLabel(userData, fallback = '친구') {
    return userData?.customDisplayName || userData?.displayName || fallback;
}

function buildFriendshipId(uidA, uidB) {
    return [uidA, uidB].sort().join('__');
}

function buildInviteUrl(referralCode) {
    return buildHabitsSchoolInviteUrl(referralCode);
}

function buildLinkFirstMessage(user) {
    return buildUnlinkedMessage(user);
}

async function handleMyCode(user) {
    const displayName = getDisplayName(user);
    const mapping = await getMapping(user);

    if (!mapping) {
        return buildLinkFirstMessage(user);
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

        // Code first, link second. In the group room almost everyone is already a
        // member, so the six characters are what they need; the invite link only
        // matters for someone who has not signed up yet.
        return `${displayName}님의 친구 코드

${referralCode}

친구가 되고 싶은 분이
!친구 ${referralCode}
를 입력하면 요청이 가요. 서로 입력하면 바로 친구가 돼요.

아직 가입 전인 분에게는 이 링크를 보내세요.
${inviteUrl}`;
    } catch (error) {
        console.error('[addFriend] Failed to load my code:', error.message);
        return '초대 링크를 불러오는 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.';
    }
}

async function handleAddFriend(user, args) {
    const displayName = getDisplayName(user);

    if (!args || args.trim() === '') {
        return `친구 맺는 법

1. 상대가 !내코드 로 자기 코드를 확인해요.
2. 내가 !친구 그코드 를 입력해요.
3. 상대도 !친구 내코드 를 입력하면 바로 친구가 돼요.

상대가 앱에서 수락해도 완료돼요.
요청은 ${FRIEND_REQUEST_TTL_DAYS}일 동안 유효해요.`;
    }

    const code = args.trim().toUpperCase();
    if (!CODE_REGEX.test(code)) {
        return '친구 코드는 영문과 숫자 6자리예요.\n예시: !친구 ABC123';
    }

    const myMapping = await getMapping(user);
    if (!myMapping) {
        return buildLinkFirstMessage(user);
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

            const activateFriendship = () => {
                tx.set(friendshipRef, {
                    users: [myUid, targetUid].sort(),
                    userNames: {
                        [myUid]: getUserLabel(myData, displayName),
                        [targetUid]: getUserLabel(targetLatestData, targetName)
                    },
                    status: 'active',
                    activatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });

                // `users.friends` is the app's cache of the friendship doc. Keep
                // both sides in step so the app does not have to repair it.
                tx.set(myRef, {
                    friends: admin.firestore.FieldValue.arrayUnion(targetUid)
                }, { merge: true });
                tx.set(targetRef, {
                    friends: admin.firestore.FieldValue.arrayUnion(myUid)
                }, { merge: true });
            };

            if (isMutualFriend) {
                activateFriendship();

                return {
                    status: 'already_friends',
                    friendCount: myFriends.length
                };
            }

            if (friendshipData.status === 'pending' && !isExpired) {
                if (friendshipData.pendingForUid === myUid) {
                    // The other member already asked for this exact pairing, and
                    // now this member has asked for it too. Each of them had to
                    // type the other's code, so consent is explicit on both
                    // sides and there is nothing left for the app to confirm.
                    activateFriendship();

                    return {
                        status: 'mutual_accept',
                        friendName: getUserLabel(targetLatestData, targetName)
                    };
                }

                if (friendshipData.requesterUid === myUid) {
                    return {
                        status: 'pending_exists',
                        friendName: getUserLabel(targetLatestData, targetName),
                        myCode: myData.referralCode || ''
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
                friendName: getUserLabel(targetLatestData, targetName),
                myCode: myData.referralCode
            };
        });

        switch (outcome.status) {
        case 'already_friends':
            return `${targetName}님과는 이미 친구예요.\n현재 친구 ${outcome.friendCount}명`;
        case 'mutual_accept':
            return `${outcome.friendName}님과 친구가 됐어요!\n서로 코드를 입력해서 바로 연결됐어요.\n\n앱 갤러리와 소셜 챌린지에서 함께 볼 수 있어요.`;
        case 'pending_created':
            return `${outcome.friendName}님에게 친구 요청을 보냈어요.\n\n${outcome.friendName}님이 !친구 ${outcome.myCode} 를 입력하면 바로 친구가 돼요.\n앱에서 수락해도 완료돼요. (${FRIEND_REQUEST_TTL_DAYS}일 유효)`;
        case 'pending_exists':
            return `${outcome.friendName}님에게 이미 요청을 보냈어요.\n\n${outcome.friendName}님이 !친구 ${outcome.myCode} 를 입력하면 바로 친구가 돼요.\n앱에서 수락해도 완료돼요. (${FRIEND_REQUEST_TTL_DAYS}일 유효)`;
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
