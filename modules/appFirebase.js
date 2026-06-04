/**
 * Firebase helpers for reading Habits School app data.
 */

const admin = require('firebase-admin');
const crypto = require('node:crypto');

const { hasDiet, hasExercise, hasMind } = require('./statsHelpers');
const { buildHabitsSchoolInviteUrl, getHabitsSchoolGalleryUrl } = require('../utils/appLinks');

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
const MAX_GALLERY_MEDIA_COUNT = 12;
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
    return getHabitsSchoolGalleryUrl();
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

function getMediaType(url) {
    return /\.(mp4|mov|webm)(\?|$)/i.test(trimText(url)) ? 'video' : 'image';
}

function addGalleryMedia(items, seen, { url, thumbUrl = '', category, label = '', type = '' }) {
    const normalizedUrl = trimText(url);
    const normalizedThumbUrl = trimText(thumbUrl);
    const displayUrl = normalizedThumbUrl || normalizedUrl;

    if (!displayUrl || seen.has(displayUrl)) {
        return null;
    }

    seen.add(displayUrl);

    const item = {
        url: normalizedUrl || displayUrl,
        thumbUrl: displayUrl,
        category,
        label,
        type: type || getMediaType(normalizedUrl || displayUrl)
    };

    items.push(item);
    return item;
}

function buildDietGalleryItems(log, settings = normalizeShareSettings(log?.shareSettings)) {
    if (!log?.diet || settings.hideDiet) {
        return [];
    }

    const items = [];
    const seen = new Set();
    const meals = [
        ['breakfast', '아침'],
        ['lunch', '점심'],
        ['dinner', '저녁'],
        ['snack', '간식']
    ];

    meals.forEach(([key, label]) => {
        const media = addGalleryMedia(items, seen, {
            url: log.diet[`${key}Url`],
            thumbUrl: log.diet[`${key}ThumbUrl`],
            category: '식단',
            label
        });

        if (media) {
            media.title = label;
        }
    });

    return items;
}

function buildExerciseGalleryItems(log, settings = normalizeShareSettings(log?.shareSettings)) {
    if (!log?.exercise || settings.hideExercise) {
        return [];
    }

    const items = [];
    const seen = new Set();
    const cardioList = Array.isArray(log.exercise.cardioList) ? log.exercise.cardioList : [];
    const strengthList = Array.isArray(log.exercise.strengthList) ? log.exercise.strengthList : [];

    if (cardioList.length > 0) {
        cardioList.forEach((entry, index) => {
            const media = addGalleryMedia(items, seen, {
                url: entry?.imageUrl,
                thumbUrl: entry?.imageThumbUrl,
                category: '운동',
                label: entry?.name || `유산소 ${index + 1}`
            });

            if (media) {
                media.title = media.label;
            }
        });
    } else {
        const media = addGalleryMedia(items, seen, {
            url: log.exercise.cardioImageUrl,
            thumbUrl: log.exercise.cardioImageThumbUrl,
            category: '운동',
            label: '유산소'
        });

        if (media) {
            media.title = '유산소';
        }
    }

    if (strengthList.length > 0) {
        strengthList.forEach((entry, index) => {
            const media = addGalleryMedia(items, seen, {
                url: entry?.videoUrl,
                thumbUrl: entry?.videoThumbUrl,
                category: '운동',
                label: entry?.name || `근력 ${index + 1}`,
                type: 'video'
            });

            if (media) {
                media.title = media.label;
            }
        });
    } else {
        const media = addGalleryMedia(items, seen, {
            url: log.exercise.strengthVideoUrl,
            thumbUrl: log.exercise.strengthVideoThumbUrl,
            category: '운동',
            label: '근력',
            type: log.exercise.strengthVideoUrl || log.exercise.strengthVideoThumbUrl ? 'video' : ''
        });

        if (media) {
            media.title = '근력';
        }
    }

    return items;
}

function buildMindGalleryItems(log, settings = normalizeShareSettings(log?.shareSettings)) {
    if (!log?.sleepAndMind || settings.hideMind) {
        return [];
    }

    const items = [];
    const seen = new Set();
    const sleepMedia = addGalleryMedia(items, seen, {
        url: log.sleepAndMind.sleepImageUrl,
        thumbUrl: log.sleepAndMind.sleepImageThumbUrl,
        category: '마음',
        label: '수면'
    });

    if (sleepMedia) {
        sleepMedia.title = '수면';
    }

    return items;
}

function buildShareGalleryMedia(log, settings = normalizeShareSettings(log?.shareSettings)) {
    const items = [
        ...buildDietGalleryItems(log, settings),
        ...buildExerciseGalleryItems(log, settings),
        ...buildMindGalleryItems(log, settings)
    ];

    return items.slice(0, MAX_GALLERY_MEDIA_COUNT);
}

function formatGalleryMetric(label, value, unit = '') {
    const normalizedValue = trimText(value);
    if (!normalizedValue) {
        return null;
    }

    return {
        label,
        value: unit && !normalizedValue.endsWith(unit) ? `${normalizedValue}${unit}` : normalizedValue
    };
}

function buildShareGallerySections(log, settings = normalizeShareSettings(log?.shareSettings)) {
    const sections = [];

    if (log?.diet && !settings.hideDiet) {
        const media = buildDietGalleryItems(log, settings);
        sections.push({
            key: 'diet',
            title: '식단',
            summary: media.length > 0 ? `${media.length}개 식단 인증` : '식단 기록 완료',
            ctaLabel: '나도 식단 기록하기',
            media
        });
    }

    if (log?.exercise && !settings.hideExercise) {
        const media = buildExerciseGalleryItems(log, settings);
        const cardioCount = Array.isArray(log.exercise.cardioList) ? log.exercise.cardioList.length : (log.exercise.cardioImageUrl ? 1 : 0);
        const strengthCount = Array.isArray(log.exercise.strengthList) ? log.exercise.strengthList.length : (log.exercise.strengthVideoUrl ? 1 : 0);
        const metrics = [
            formatGalleryMetric('유산소', cardioCount || ''),
            formatGalleryMetric('근력', strengthCount || '')
        ].filter(Boolean);

        sections.push({
            key: 'exercise',
            title: '운동',
            summary: media.length > 0 ? `${media.length}개 운동 인증` : '운동 기록 완료',
            ctaLabel: '나도 운동 인증하기',
            metrics,
            media
        });
    }

    if (log?.sleepAndMind && !settings.hideMind) {
        const media = buildMindGalleryItems(log, settings);
        const gratitudeText = getMindJournal(log);
        const metrics = [
            log.sleepAndMind.meditationDone === true ? { label: '명상', value: '완료' } : null,
            log.sleepAndMind.sleepHours ? formatGalleryMetric('수면', log.sleepAndMind.sleepHours, 'h') : null
        ].filter(Boolean);

        sections.push({
            key: 'mind',
            title: '마음',
            summary: gratitudeText ? gratitudeText : '마음 기록 완료',
            ctaLabel: '나도 마음 기록하기',
            metrics,
            media
        });
    }

    return sections;
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
        referralCode: trimText(userProfile?.referralCode),
        inviteUrl: trimText(userProfile?.referralCode) ? buildHabitsSchoolInviteUrl(userProfile.referralCode) : '',
        appUrl: getAppGalleryUrl()
    };
}

function generateShareCardToken() {
    return crypto.randomBytes(18).toString('base64url');
}

function generateHaebitShareToken() {
    return crypto.randomBytes(6).toString('base64url');
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

function buildLeaderboardFromRecords(records) {
    const userScores = {};

    records.forEach((record) => {
        const uid = record.userId;
        if (!uid) return;

        if (!userScores[uid]) {
            userScores[uid] = {
                uid,
                diet: 0,
                exercise: 0,
                mind: 0,
                totalRecords: 0,
                activeDates: new Set(),
                displayName: ''
            };
        }

        const entry = userScores[uid];
        const hasDietRecord = hasDiet(record);
        const hasExerciseRecord = hasExercise(record);
        const hasMindRecord = hasMind(record);

        if (hasDietRecord) entry.diet += 1;
        if (hasExerciseRecord) entry.exercise += 1;
        if (hasMindRecord) entry.mind += 1;
        if (hasDietRecord || hasExerciseRecord || hasMindRecord) {
            entry.activeDates.add(record.date);
        }

        entry.totalRecords += 1;

        if (!entry.displayName) {
            entry.displayName = trimText(
                record.customDisplayName
                || record.userName
                || record.displayName
                || record.userDisplayName
                || record.nickname
            );
        }

        if (!entry.email) {
            entry.email = trimText(record.email || record.userEmail || record.googleEmail);
        }
    });

    return Object.values(userScores).map((entry) => ({
        uid: entry.uid,
        displayName: entry.displayName,
        diet: entry.diet,
        exercise: entry.exercise,
        mind: entry.mind,
        activeDays: entry.activeDates.size,
        totalRecords: entry.totalRecords,
        totalActivities: entry.diet + entry.exercise + entry.mind,
        email: entry.email || '',
        score: Math.round((entry.diet * 1 + entry.exercise * 1.5 + entry.mind) * 10) / 10
    }));
}

async function getUserProfilesByIds(uids = []) {
    const db = initAppFirebase();
    if (!db) return {};

    const uniqueUids = [...new Set(uids.map((uid) => trimText(uid)).filter(Boolean))];
    if (uniqueUids.length === 0) {
        return {};
    }

    try {
        const pairs = await Promise.all(uniqueUids.map(async (uid) => {
            const docRef = await db.collection('users').doc(uid).get();
            if (!docRef.exists) {
                return [uid, null];
            }
            return [uid, { id: docRef.id, ...docRef.data() }];
        }));

        return pairs.reduce((profiles, [uid, profile]) => {
            if (profile) {
                profiles[uid] = profile;
            }
            return profiles;
        }, {});
    } catch (error) {
        console.error('[AppFirebase] Failed to load user profiles:', error.message);
        return {};
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

        return buildLeaderboardFromRecords(snapshot.docs.map((doc) => doc.data()));
    } catch (error) {
        console.error('[AppFirebase] Failed to load weekly leaderboard:', error.message);
        throw new Error('앱 서버 연결에 일시적인 문제가 있어요. 잠시 후 다시 시도해 주세요.');
    }
}

async function getLeaderboardByDateRange(startDate, endDate) {
    const db = initAppFirebase();
    if (!db) return [];

    if (!startDate || !endDate || startDate > endDate) {
        return [];
    }

    try {
        const snapshot = await db.collection('daily_logs')
            .where('date', '>=', startDate)
            .where('date', '<=', endDate)
            .orderBy('date', 'asc')
            .get();

        return buildLeaderboardFromRecords(snapshot.docs.map((doc) => doc.data()));
    } catch (error) {
        console.error(`[AppFirebase] Failed to load leaderboard (${startDate}~${endDate}):`, error.message);
        throw new Error('앱 기록 순위를 확인하는 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.');
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

function buildHaebitSharePayloadFromRecord(googleUid, record, userProfile) {
    const cardPayload = buildShareCardPayloadFromRecord(googleUid, record, userProfile);
    if (!cardPayload) {
        return null;
    }

    const settings = normalizeShareSettings(record.shareSettings);
    const galleryMedia = buildShareGalleryMedia(record, settings);

    return {
        ...cardPayload,
        pageTitle: `${cardPayload.userName}의 하루 해빛 기록`,
        galleryMedia: galleryMedia.length > 0 ? galleryMedia : cardPayload.media,
        sections: buildShareGallerySections(record, settings),
        recordId: record.id || `${googleUid}_${record.date || ''}`
    };
}

async function createHaebitShareToken({ googleUid, record, kakaoUserKey = '' }) {
    const normalizedUid = trimText(googleUid);
    const recordDate = trimText(record?.date);

    if (!normalizedUid || !recordDate) {
        throw new Error('Cannot create a Haebit share token without uid and record date.');
    }

    const now = Date.now();
    const payload = {
        googleUid: normalizedUid,
        recordId: trimText(record?.id) || `${normalizedUid}_${recordDate}`,
        recordDate,
        kakaoUserKey: trimText(kakaoUserKey),
        createdAt: new Date(now).toISOString(),
        lastAccessedAt: null
    };

    for (let attempt = 0; attempt < 5; attempt += 1) {
        const token = generateHaebitShareToken();
        const tokenRef = getRealtimeDb().ref(`haebit_share_tokens/${token}`);
        const snapshot = await tokenRef.once('value');

        if (!snapshot.val()) {
            await tokenRef.set(payload);
            return token;
        }
    }

    throw new Error('Could not create a unique Haebit share code.');
}

async function getHaebitShareToken(token) {
    const normalizedToken = trimText(token);
    if (!normalizedToken) {
        return null;
    }

    const tokenRef = getRealtimeDb().ref(`haebit_share_tokens/${normalizedToken}`);
    const snapshot = await tokenRef.once('value');
    const data = snapshot.val();

    if (!data?.googleUid || !data?.recordDate) {
        return null;
    }

    if (typeof tokenRef.update === 'function') {
        Promise.resolve(tokenRef.update({ lastAccessedAt: new Date().toISOString() })).catch(() => {});
    }

    return {
        token: normalizedToken,
        googleUid: data.googleUid,
        recordId: data.recordId || '',
        recordDate: data.recordDate,
        kakaoUserKey: data.kakaoUserKey || '',
        createdAt: data.createdAt || null
    };
}

async function getHaebitSharePagePayload(token) {
    const tokenData = await getHaebitShareToken(token);
    if (!tokenData) {
        return null;
    }

    const [record, userProfile] = await Promise.all([
        getUserRecordByDate(tokenData.googleUid, tokenData.recordDate),
        getUserProfile(tokenData.googleUid)
    ]);

    const settings = normalizeShareSettings(record?.shareSettings);
    if (!record || !isShareableRecord(record, settings)) {
        return null;
    }

    return {
        ...buildHaebitSharePayloadFromRecord(tokenData.googleUid, record, userProfile),
        token: tokenData.token,
        shareCreatedAt: tokenData.createdAt
    };
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
    getUserProfilesByIds,
    getActiveUserCount,
    getWeeklyStats,
    getWeeklyLeaderboard,
    getLeaderboardByDateRange,
    consumeChatbotLinkCode,
    getLatestShareableRecord,
    extractShareMedia,
    getShareCardPayload,
    buildHaebitSharePayloadFromRecord,
    createHaebitShareToken,
    getHaebitShareToken,
    getHaebitSharePagePayload,
    createShareCardToken,
    consumeShareCardToken,
    normalizeShareSettings,
    getSharePoints,
    verifyAppUserIdToken
};
