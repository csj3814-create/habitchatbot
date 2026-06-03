/**
 * Resolve public labels for leaderboard entries.
 * Avoid generic placeholders when an app account id is available.
 */

const { getUserProfilesByIds } = require('./appFirebase');
const { getAllMappings } = require('./userMapping');

function cleanText(value) {
    return String(value || '').trim();
}

function isGenericLabel(value) {
    const text = cleanText(value);
    if (!text) return true;

    return [
        '사용자',
        '회원',
        '참여자',
        '해빛 학생',
        '익명 학생'
    ].includes(text)
        || /^사용자\s*\d+$/u.test(text)
        || /^회원\s*\d+$/u.test(text)
        || /^참여자\s*\d+$/u.test(text);
}

function firstUsefulLabel(...values) {
    for (const value of values) {
        const text = cleanText(value);
        if (!isGenericLabel(text)) {
            return text;
        }
    }

    return '';
}

function accountLabelFromEmail(email) {
    const text = cleanText(email);
    if (!text || !text.includes('@')) {
        return '';
    }

    const localPart = text.split('@')[0].trim();
    return localPart ? `계정 ${localPart}` : '';
}

function shortUidLabel(uid) {
    const text = cleanText(uid);
    if (!text) {
        return 'ID 미확인';
    }

    return `ID ${text.slice(0, 8)}`;
}

function resolveLeaderboardLabel({ uid, entry = {}, mapping = {}, profile = {} }) {
    const name = firstUsefulLabel(
        profile.customDisplayName,
        profile.displayName,
        profile.name,
        profile.nickname,
        mapping.displayName,
        mapping.sender,
        mapping.nickname,
        entry.displayName,
        entry.userName,
        entry.userDisplayName,
        entry.nickname
    );

    if (name) {
        return name;
    }

    const accountLabel = accountLabelFromEmail(
        profile.email
        || profile.googleEmail
        || profile.accountEmail
        || mapping.googleEmail
        || mapping.email
        || entry.email
        || entry.googleEmail
        || entry.userEmail
    );

    return accountLabel || shortUidLabel(uid || entry.uid);
}

async function loadLeaderboardLabels(entries = []) {
    const entryByUid = {};
    const uids = [];

    entries.forEach((entry) => {
        const uid = cleanText(entry?.uid || entry?.userId);
        if (!uid || entryByUid[uid]) {
            return;
        }

        entryByUid[uid] = entry;
        uids.push(uid);
    });

    if (uids.length === 0) {
        return {};
    }

    let mappings = {};
    try {
        mappings = await getAllMappings();
    } catch (error) {
        console.warn('[LeaderboardLabels] Failed to load mappings:', error.message);
    }

    const mappingByUid = {};
    Object.values(mappings || {}).forEach((mapping) => {
        if (mapping?.googleUid && !mappingByUid[mapping.googleUid]) {
            mappingByUid[mapping.googleUid] = mapping;
        }
    });

    const profiles = await getUserProfilesByIds(uids);
    return uids.reduce((labels, uid) => {
        labels[uid] = resolveLeaderboardLabel({
            uid,
            entry: entryByUid[uid],
            mapping: mappingByUid[uid],
            profile: profiles[uid]
        });
        return labels;
    }, {});
}

module.exports = {
    loadLeaderboardLabels,
    resolveLeaderboardLabel,
    accountLabelFromEmail,
    shortUidLabel
};
