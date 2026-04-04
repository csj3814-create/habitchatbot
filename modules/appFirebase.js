/**
 * Firebase helpers for reading Habits School app data.
 */

const admin = require('firebase-admin');
const crypto = require('node:crypto');

const { hasDiet, hasExercise, hasMind } = require('./statsHelpers');

const DEFAULT_SHARE_SETTINGS = {
    hideIdentity: false,
    hideDate: false,
    hideDiet: false,
    hideExercise: false,
    hidePoints: false,
    hideMind: false
};

const SHARE_CARD_TOKEN_TTL_MS = 5 * 60 * 1000;
const MAX_SHARE_MEDIA_COUNT = 4;
const DEFAULT_APP_GALLERY_URL = 'https://habitschool.web.app/#gallery';

let appDb = null;

function getHabitsSchoolApp() {
    try {
        return admin.app('habitsSchoolApp');
    } catch (_) {
        const db = initAppFirebase();
        if (!db) {
            return null;
        }
        return admin.app('habitsSchoolApp');
    }
}

async function verifyAppUserIdToken(idToken) {
    const normalizedToken = String(idToken || '').trim();
    if (!normalizedToken) {
        return null;
    }

    const appInstance = getHabitsSchoolApp();
    if (!appInstance) {
        return null;
    }

    try {
        const decoded = await appInstance.auth().verifyIdToken(normalizedToken);
        const userRecord = await appInstance.auth().getUser(decoded.uid);

        return {
            uid: userRecord.uid,
            email: userRecord.email || decoded.email || null,
            displayName: userRecord.displayName || decoded.name || null
        };
    } catch (error) {
        console.warn('[AppFirebase] Failed to verify app user id token:', error.message);
        return null;
    }
}

function getRealtimeDb() {
    return admin.database();
}

function normalizeChatbotLinkCode(value) {
    return String(value || '').trim().toUpperCase();
}

function getDefaultShareSettings() {
    return { ...DEFAULT_SHARE_SETTINGS };
}

function normalizeShareSettings(raw) {
    const normalized = getDefaultShareSettings();
    if (!raw || typeof raw !== 'object') {
        return normalized;
    }

    Object.keys(DEFAULT_SHARE_SETTINGS).forEach((key) => {
        normalized[key] = raw[key] === true;
    });

    if (!('hideMind' in raw) && raw.hideMindText === true) {
        normalized.hideMind = true;
    }

    return normalized;
}

function formatShareDate(dateStr) {
    if (!dateStr) {
        return '';
    }

    return String(dateStr).replace(/-/g, '.');
}

function getAppGalleryUrl() {
    return process.env.HABITSCHOOL_APP_URL || DEFAULT_APP_GALLERY_URL;
}

function getShareDisplayName(userProfile, fallback = '해빛 학생') {
    return userProfile?.customDisplayName
        || userProfile?.displayName
        || fallback;
}

function trimText(value) {
    return String(value || '').trim();
}

function getMindJournal(log) {
    return trimText(log?.sleepAndMind?.gratitudeJournal || log?.sleepAndMind?.gratitude);
}

function getSharePoints(log) {
    let points = (log?.awardedPoints?.dietPoints || 0)
        + (log?.awardedPoints?.exercisePoints || 0)
        + (log?.awardedPoints?.mindPoints || 0);

    if (points === 0 && log?.awardedPoints) {
        if (log.awardedPoints.diet) points += 10;
        if (log.awardedPoints.exercise) points += 15;
        if (log.awardedPoints.mind) points += 5;
    }

    return points;
}

function extractShareMedia(log, settings = normalizeShareSettings(log?.shareSettings)) {
    if (!log) {
        return [];
    }

    const items = [];
    const seen = new Set();

    const addMedia = (url, category, type = null) => {
        const normalizedUrl = trimText(url);
        if (!normalizedUrl || seen.has(normalizedUrl)) {
            return;
        }

        seen.add(normalizedUrl);
        items.push({
            url: normalizedUrl,
            category,
            type: type || (/\.(mp4|mov|webm)(\?|$)/i.test(normalizedUrl) ? 'video' : 'image')
        });
    };

    if (log.diet && !settings.hideDiet) {
        ['breakfast', 'lunch', 'dinner', 'snack'].forEach((meal) => {
            addMedia(log.diet[`${meal}ThumbUrl`] || log.diet[`${meal}Url`], '식단');
        });
    }

    if (log.exercise && !settings.hideExercise) {
        if (Array.isArray(log.exercise.cardioList) && log.exercise.cardioList.length > 0) {
            log.exercise.cardioList.forEach((item) => {
                addMedia(item?.imageThumbUrl || item?.imageUrl, '운동');
            });
        } else {
            addMedia(log.exercise.cardioImageThumbUrl || log.exercise.cardioImageUrl, '운동');
        }

        if (Array.isArray(log.exercise.strengthList) && log.exercise.strengthList.length > 0) {
            log.exercise.strengthList.forEach((item) => {
                addMedia(
                    item?.videoThumbUrl || item?.videoUrl,
                    '운동',
                    item?.videoThumbUrl ? 'image' : 'video'
                );
            });
        } else {
            addMedia(
                log.exercise.strengthVideoThumbUrl || log.exercise.strengthVideoUrl,
                '운동',
                log.exercise.strengthVideoThumbUrl ? 'image' : 'video'
            );
        }
    }

    if (!settings.hideMind) {
        addMedia(log.sleepAndMind?.sleepImageThumbUrl || log.sleepAndMind?.sleepImageUrl, '마음');
    }

    return items.slice(0, MAX_SHARE_MEDIA_COUNT);
}

function getShareCategoryTags(log, settings = normalizeShareSettings(log?.shareSettings)) {
    if (!log) {
        return [];
    }

    const tags = [];
    const dietMedia = extractShareMedia({ diet: log.diet }, { ...getDefaultShareSettings(), hideDiet: false, hideExercise: true, hideMind: true });
    const exerciseMedia = extractShareMedia({ exercise: log.exercise }, { ...getDefaultShareSettings(), hideDiet: true, hideExercise: false, hideMind: true });
    const mindMedia = extractShareMedia({ sleepAndMind: log.sleepAndMind }, { ...getDefaultShareSettings(), hideDiet: true, hideExercise: true, hideMind: false });

    if (!settings.hideDiet && (dietMedia.length > 0 || log.diet)) tags.push('식단');
    if (!settings.hideExercise && (exerciseMedia.length > 0 || log.exercise)) tags.push('운동');
    if (!settings.hideMind && (mindMedia.length > 0 || getMindJournal(log) || log?.sleepAndMind?.meditationDone)) tags.push('마음');

    const streak = Number(log.currentStreak || 0);
    if (streak > 0) {
        tags.push(`${streak}일 연속`);
    }

    return tags.slice(0, 4);
}

function buildShareSubtitle(log, tags = []) {
    if (!log) {
        return '오늘 기록한 흐름을 한 장으로 정리했어요.';
    }

    if (tags.length > 0) {
        const categoryTags = tags.filter((tag) => !tag.includes('연속'));
        if (categoryTags.length > 0) {
            return `오늘 ${categoryTags.join(' · ')} 흐름을 한 장으로 남겼어요.`;
        }
    }

    return '오늘의 해빛 흐름을 카드로 정리했어요.';
}

function isShareableRecord(log, settings = normalizeShareSettings(log?.shareSettings)) {
    if (!log) {
        return false;
    }

    if (extractShareMedia(log, settings).length > 0) {
        return true;
    }

    if (!settings.hideMind && (getMindJournal(log) || log?.sleepAndMind?.meditationDone)) {
        return true;
    }

    if (!settings.hidePoints && getSharePoints(log) > 0) {
        return true;
    }

    return false;
}

function buildShareCardPayloadFromRecord(googleUid, record, userProfile) {
    if (!record) {
        return null;
    }

    const settings = normalizeShareSettings(record.shareSettings);
    const streak = Number(record.currentStreak || userProfile?.currentStreak || 0);
    const mergedRecord = streak === record.currentStreak ? record : { ...record, currentStreak: streak };
    const displayName = getShareDisplayName(userProfile, record.userName || '해빛 학생');
    const tags = getShareCategoryTags(mergedRecord, settings);
    const points = getSharePoints(mergedRecord);
    const media = extractShareMedia(mergedRecord, settings);

    return {
        uid: googleUid,
        userName: settings.hideIdentity ? '익명 학생' : displayName,
        title: settings.hideIdentity ? '오늘의 해빛 루틴' : `${displayName}의 해빛 루틴`,
        subtitle: buildShareSubtitle(mergedRecord, tags),
        date: settings.hideDate ? '' : formatShareDate(mergedRecord.date),
        points: settings.hidePoints ? null : points,
        tags,
        shareSettings: settings,
        media,
        recordDate: mergedRecord.date || '',
        gratitudeText: settings.hideMind ? '' : getMindJournal(mergedRecord),
        meditationDone: !settings.hideMind && mergedRecord?.sleepAndMind?.meditationDone === true,
        currentStreak: streak,
        appUrl: getAppGalleryUrl()
    };
}

function generateShareCardToken() {
    return crypto.randomBytes(18).toString('base64url');
}

function initAppFirebase() {
    if (appDb) return appDb;

    try {
        let appServiceAccount;
        try {
            appServiceAccount = require('../appServiceAccountKey.json');
        } catch (_) {
            try {
                appServiceAccount = require('/etc/secrets/appServiceAccountKey.json');
            } catch (__) {
                if (process.env.APP_FIREBASE_KEY) {
                    appServiceAccount = JSON.parse(process.env.APP_FIREBASE_KEY);
                } else {
                    console.warn('[AppFirebase] appServiceAccountKey.json not found');
                    return null;
                }
            }
        }

        const appInstance = admin.initializeApp({
            credential: admin.credential.cert(appServiceAccount)
        }, 'habitsSchoolApp');

        appDb = appInstance.firestore();
        console.log('[AppFirebase] Habits School Firestore connected');
        return appDb;
    } catch (error) {
        console.error('[AppFirebase] Failed to initialize app Firebase:', error.message);
        return null;
    }
}

async function getGalleryByDate(dateStr) {
    const db = initAppFirebase();
    if (!db) return [];

    try {
        const snapshot = await db.collection('daily_logs')
            .where('date', '==', dateStr)
            .get();

        return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error(`[AppFirebase] Failed to load gallery for ${dateStr}:`, error.message);
        throw new Error('앱 서버 연결에 일시적인 문제가 있어요. 잠시 후 다시 시도해 주세요.');
    }
}

async function getUserRecords(googleUid, days = 7) {
    const db = initAppFirebase();
    if (!db) return [];

    try {
        const snapshot = await db.collection('daily_logs')
            .where('userId', '==', googleUid)
            .orderBy('date', 'desc')
            .limit(days)
            .get();

        const records = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        records.reverse();
        return records;
    } catch (error) {
        console.error(`[AppFirebase] Failed to load user records (uid=${googleUid}, days=${days}):`, error.message);
        throw new Error('앱 서버 연결에 일시적인 문제가 있어요. 잠시 후 다시 시도해 주세요.');
    }
}

async function getUserRecordByDate(googleUid, dateStr) {
    const db = initAppFirebase();
    if (!db) return null;

    try {
        const docId = `${googleUid}_${dateStr}`;
        const docRef = await db.collection('daily_logs').doc(docId).get();
        if (!docRef.exists) return null;
        return { id: docRef.id, ...docRef.data() };
    } catch (error) {
        console.error(`[AppFirebase] Failed to load user record (uid=${googleUid}, date=${dateStr}):`, error.message);
        throw new Error('앱 서버 연결에 일시적인 문제가 있어요. 잠시 후 다시 시도해 주세요.');
    }
}

async function getUserProfile(googleUid) {
    const db = initAppFirebase();
    if (!db) return null;

    try {
        const docRef = await db.collection('users').doc(googleUid).get();
        if (!docRef.exists) return null;
        return { id: docRef.id, ...docRef.data() };
    } catch (error) {
        console.error(`[AppFirebase] Failed to load user profile (uid=${googleUid}):`, error.message);
        throw new Error('앱 서버 연결에 일시적인 문제가 있어요. 잠시 후 다시 시도해 주세요.');
    }
}

async function getActiveUserCount(dateStr) {
    const db = initAppFirebase();
    if (!db) return 0;

    try {
        const snapshot = await db.collection('daily_logs')
            .where('date', '==', dateStr)
            .get();

        const uniqueUsers = new Set(snapshot.docs.map((doc) => doc.data().userId));
        return uniqueUsers.size;
    } catch (error) {
        console.error(`[AppFirebase] Failed to load active user count (date=${dateStr}):`, error.message);
        throw new Error('앱 서버 연결에 일시적인 문제가 있어요. 잠시 후 다시 시도해 주세요.');
    }
}

async function getWeeklyStats() {
    const db = initAppFirebase();
    if (!db) return null;

    try {
        const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
        const dates = [];
        for (let i = 6; i >= 0; i -= 1) {
            const date = new Date(`${todayStr}T00:00:00+09:00`);
            date.setDate(date.getDate() - i);
            dates.push(date.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }));
        }

        const snapshot = await db.collection('daily_logs')
            .where('date', 'in', dates)
            .get();

        const allLogs = snapshot.docs.map((doc) => doc.data());

        return {
            totalRecords: allLogs.length,
            uniqueUsers: new Set(allLogs.map((log) => log.userId)).size,
            dietCount: allLogs.filter(hasDiet).length,
            exerciseCount: allLogs.filter(hasExercise).length,
            mindCount: allLogs.filter(hasMind).length,
            dates,
            dailyBreakdown: dates.map((date) => {
                const dayLogs = allLogs.filter((log) => log.date === date);
                return {
                    date,
                    total: dayLogs.length,
                    users: new Set(dayLogs.map((log) => log.userId)).size
                };
            })
        };
    } catch (error) {
        console.error('[AppFirebase] Failed to load weekly stats:', error.message);
        throw new Error('앱 서버 연결에 일시적인 문제가 있어요. 잠시 후 다시 시도해 주세요.');
    }
}

async function getWeeklyLeaderboard() {
    const db = initAppFirebase();
    if (!db) return [];

    try {
        const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
        const dates = [];
        for (let i = 6; i >= 0; i -= 1) {
            const date = new Date(`${todayStr}T00:00:00+09:00`);
            date.setDate(date.getDate() - i);
            dates.push(date.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }));
        }

        const snapshot = await db.collection('daily_logs')
            .where('date', 'in', dates)
            .get();

        const userScores = {};
        snapshot.docs.forEach((doc) => {
            const record = doc.data();
            const uid = record.userId;
            if (!uid) return;

            if (!userScores[uid]) {
                userScores[uid] = { diet: 0, exercise: 0, mind: 0 };
            }

            if (hasDiet(record)) userScores[uid].diet += 1;
            if (hasExercise(record)) userScores[uid].exercise += 1;
            if (hasMind(record)) userScores[uid].mind += 1;
        });

        return Object.entries(userScores).map(([uid, counts]) => ({
            uid,
            diet: counts.diet,
            exercise: counts.exercise,
            mind: counts.mind,
            score: Math.round((counts.diet * 1 + counts.exercise * 1.5 + counts.mind) * 10) / 10
        }));
    } catch (error) {
        console.error('[AppFirebase] Failed to load weekly leaderboard:', error.message);
        throw new Error('앱 서버 연결에 일시적인 문제가 있어요. 잠시 후 다시 시도해 주세요.');
    }
}

async function consumeChatbotLinkCode(linkCode) {
    const db = initAppFirebase();
    if (!db) return null;

    const normalizedCode = normalizeChatbotLinkCode(linkCode);
    if (!normalizedCode) {
        return null;
    }

    try {
        const snapshot = await db.collection('users')
            .where('chatbotLinkCode', '==', normalizedCode)
            .limit(1)
            .get();

        if (snapshot.empty) {
            return null;
        }

        const userDoc = snapshot.docs[0];
        const userData = userDoc.data();
        const expiresAt = userData.chatbotLinkCodeExpiresAt;

        if (!expiresAt || Number.isNaN(new Date(expiresAt).getTime()) || new Date(expiresAt).getTime() < Date.now()) {
            return null;
        }

        let authRecord = null;
        const appInstance = getHabitsSchoolApp();
        if (appInstance) {
            try {
                authRecord = await appInstance.auth().getUser(userDoc.id);
            } catch (error) {
                console.warn(`[AppFirebase] Failed to load auth record for link code uid=${userDoc.id}:`, error.message);
            }
        }

        await userDoc.ref.set({
            chatbotLinkCode: admin.firestore.FieldValue.delete(),
            chatbotLinkCodeExpiresAt: admin.firestore.FieldValue.delete(),
            chatbotLinkCodeGeneratedAt: admin.firestore.FieldValue.delete(),
            chatbotLinkCodeLastUsedAt: new Date().toISOString()
        }, { merge: true });

        return {
            uid: userDoc.id,
            email: authRecord?.email || userData.email || null,
            displayName: userData.customDisplayName || userData.displayName || authRecord?.displayName || null
        };
    } catch (error) {
        console.error('[AppFirebase] Failed to consume chatbot link code:', error.message);
        return null;
    }
}

async function getLatestShareableRecord(googleUid, days = 14) {
    const db = initAppFirebase();
    if (!db) {
        return null;
    }

    try {
        const snapshot = await db.collection('daily_logs')
            .where('userId', '==', googleUid)
            .orderBy('date', 'desc')
            .limit(days)
            .get();

        for (const doc of snapshot.docs) {
            const record = { id: doc.id, ...doc.data() };
            const settings = normalizeShareSettings(record.shareSettings);
            if (isShareableRecord(record, settings)) {
                return record;
            }
        }

        return null;
    } catch (error) {
        console.error(`[AppFirebase] Failed to load latest shareable record (uid=${googleUid}):`, error.message);
        throw new Error('공유할 기록을 확인하는 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.');
    }
}

async function getShareCardPayload(googleUid) {
    const [record, userProfile] = await Promise.all([
        getLatestShareableRecord(googleUid),
        getUserProfile(googleUid)
    ]);

    if (!record) {
        return null;
    }

    return buildShareCardPayloadFromRecord(googleUid, record, userProfile);
}

async function createShareCardToken({ googleUid, kakaoUserKey = '' }) {
    const now = Date.now();
    const expiresAt = new Date(now + SHARE_CARD_TOKEN_TTL_MS).toISOString();
    const token = generateShareCardToken();

    await getRealtimeDb().ref(`share_card_tokens/${token}`).set({
        googleUid,
        kakaoUserKey,
        createdAt: new Date(now).toISOString(),
        expiresAt
    });

    return token;
}

async function consumeShareCardToken(token) {
    const normalizedToken = trimText(token);
    if (!normalizedToken) {
        return null;
    }

    const tokenRef = getRealtimeDb().ref(`share_card_tokens/${normalizedToken}`);
    const snapshot = await tokenRef.once('value');
    const data = snapshot.val();

    if (!data?.googleUid || !data?.expiresAt) {
        return null;
    }

    const expiresAtMs = new Date(data.expiresAt).getTime();
    if (Number.isNaN(expiresAtMs) || expiresAtMs < Date.now()) {
        await tokenRef.remove().catch(() => {});
        return null;
    }

    return {
        token: normalizedToken,
        googleUid: data.googleUid,
        kakaoUserKey: data.kakaoUserKey || '',
        createdAt: data.createdAt || null,
        expiresAt: data.expiresAt
    };
}

module.exports = {
    initAppFirebase,
    getGalleryByDate,
    getUserRecords,
    getUserRecordByDate,
    getUserProfile,
    getActiveUserCount,
    getWeeklyStats,
    getWeeklyLeaderboard,
    consumeChatbotLinkCode,
    getLatestShareableRecord,
    extractShareMedia,
    getShareCardPayload,
    createShareCardToken,
    consumeShareCardToken,
    normalizeShareSettings,
    getSharePoints,
    verifyAppUserIdToken
};
