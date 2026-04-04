const admin = require('firebase-admin');
const crypto = require('node:crypto');

const { verifyAppUserIdToken } = require('./appFirebase');
const { registerUser, getMapping, getDisplayName, buildIdentityKey } = require('./userMapping');

const CONNECT_TOKEN_TTL_MS = 10 * 60 * 1000;
const TOKEN_PATH = 'chatbot_connect_tokens';
const DEFAULT_APP_URL = 'https://habitschool.web.app';

function getDb() {
    return admin.database();
}

function normalizeToken(value) {
    return String(value || '').trim();
}

function buildTokenUrl(token) {
    const baseUrl = process.env.HABITSCHOOL_APP_URL || DEFAULT_APP_URL;

    try {
        const url = new URL(baseUrl);
        url.searchParams.set('chatbotConnectToken', token);
        url.hash = 'profile';
        return url.toString();
    } catch (_) {
        return `${DEFAULT_APP_URL}/?chatbotConnectToken=${encodeURIComponent(token)}#profile`;
    }
}

function createTokenValue() {
    return crypto.randomBytes(18).toString('base64url');
}

async function createChatbotConnectToken(user) {
    const token = createTokenValue();
    const now = Date.now();
    const expiresAt = new Date(now + CONNECT_TOKEN_TTL_MS).toISOString();
    const displayName = getDisplayName(user);

    await getDb().ref(`${TOKEN_PATH}/${token}`).set({
        identityKey: buildIdentityKey(user),
        identity: {
            platform: user.platform,
            userId: user.userId,
            displayName: user.displayName,
            legacySender: user.legacySender || user.displayName,
            room: user.room || null
        },
        displayName,
        createdAt: new Date(now).toISOString(),
        expiresAt,
        status: 'pending'
    });

    return {
        token,
        displayName,
        expiresAt,
        webLinkUrl: buildTokenUrl(token)
    };
}

async function getChatbotConnectToken(token) {
    const normalizedToken = normalizeToken(token);
    if (!normalizedToken) {
        return null;
    }

    const snapshot = await getDb().ref(`${TOKEN_PATH}/${normalizedToken}`).once('value');
    const data = snapshot.val();

    if (!data?.identity?.userId || !data?.expiresAt) {
        return null;
    }

    const expiresAtMs = new Date(data.expiresAt).getTime();
    if (Number.isNaN(expiresAtMs) || expiresAtMs < Date.now()) {
        await getDb().ref(`${TOKEN_PATH}/${normalizedToken}`).remove().catch(() => {});
        return null;
    }

    return {
        token: normalizedToken,
        identityKey: data.identityKey,
        identity: data.identity,
        displayName: data.displayName || data.identity.displayName || data.identity.userId,
        createdAt: data.createdAt || null,
        expiresAt: data.expiresAt,
        status: data.status || 'pending',
        connectedUid: data.connectedUid || null,
        connectedEmail: data.connectedEmail || null,
        connectedDisplayName: data.connectedDisplayName || null
    };
}

async function completeChatbotConnect(token, idToken) {
    const tokenData = await getChatbotConnectToken(token);
    if (!tokenData) {
        return { ok: false, code: 'expired' };
    }

    const appUser = await verifyAppUserIdToken(idToken);
    if (!appUser) {
        return { ok: false, code: 'unauthorized' };
    }

    if (tokenData.status === 'consumed') {
        if (tokenData.connectedUid === appUser.uid) {
            return {
                ok: true,
                alreadyCompleted: true,
                displayName: tokenData.displayName,
                appUser
            };
        }

        return { ok: false, code: 'already_used' };
    }

    const existingMapping = await getMapping(tokenData.identity);
    await registerUser(
        tokenData.identity,
        appUser.email || '이메일 정보 없음',
        appUser.uid
    );

    await getDb().ref(`${TOKEN_PATH}/${tokenData.token}`).update({
        status: 'consumed',
        consumedAt: new Date().toISOString(),
        connectedUid: appUser.uid,
        connectedEmail: appUser.email || null,
        connectedDisplayName: appUser.displayName || null,
        replacedExistingMapping: Boolean(existingMapping)
    });

    return {
        ok: true,
        alreadyCompleted: false,
        displayName: tokenData.displayName,
        appUser
    };
}

module.exports = {
    createChatbotConnectToken,
    getChatbotConnectToken,
    completeChatbotConnect,
    buildTokenUrl
};
