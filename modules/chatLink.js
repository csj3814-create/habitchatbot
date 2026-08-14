/**
 * Account linking boundary for chat platforms.
 *
 * MessengerBot gives us a KakaoTalk *display name* as the only identifier for a
 * speaker. That is not a stable account id:
 *
 *   - if a member renames themselves, their link silently stops matching
 *   - if two members pick the same nickname, they collide
 *
 * The link code proves identity at link time, so linking itself is safe. What is
 * not safe is spreading the "nickname is a unique key" assumption across the
 * codebase. Every decision that depends on it lives in this module, so moving to
 * a stable identifier later means changing one boundary.
 */

const { consumeChatbotLinkCode } = require('./appFirebase');
const {
    registerUser,
    getMapping,
    getDisplayName,
    buildIdentityKey,
    findMappingsByGoogleUid,
    removeMappingByKey
} = require('./userMapping');

const LINK_CODE_REGEX = /^[A-Z0-9]{8}$/;

function normalizeLinkCode(value) {
    return String(value || '').trim().toUpperCase();
}

function isLinkCodeShaped(value) {
    return LINK_CODE_REGEX.test(normalizeLinkCode(value));
}

/**
 * Establish a link from a proven app account to the speaker's current nickname.
 *
 * Outcomes:
 *   ok                        new link
 *   ok_moved                  same app account was linked under another nickname
 *   invalid_format            not an 8-char code
 *   nickname_already_linked   this nickname already has an account; refuse rather
 *                             than silently overwrite, and do not spend the code
 *   expired / not_found / unavailable  from the code lookup
 */
async function linkByCode({ user, code, linkSource = 'unknown' }) {
    const displayName = getDisplayName(user);
    const normalizedCode = normalizeLinkCode(code);

    if (!isLinkCodeShaped(normalizedCode)) {
        return { ok: false, reason: 'invalid_format', displayName };
    }

    // Check the nickname first so a mistyped attempt on an already-linked
    // nickname does not burn a still-valid code.
    const existing = await getMapping(user);
    if (existing) {
        return { ok: false, reason: 'nickname_already_linked', displayName };
    }

    const verdict = await consumeChatbotLinkCode(normalizedCode);
    if (!verdict.ok) {
        return { ok: false, reason: verdict.reason, displayName };
    }

    const appUser = verdict.user;
    const targetKey = buildIdentityKey(user);

    // Does this app account already sit under a different nickname? If so the
    // member most likely renamed themselves. The code proved they own the
    // account, so moving the link is correct — but record where it came from
    // instead of leaving a second, stale mapping behind.
    const priorMappings = await findMappingsByGoogleUid(appUser.uid);
    const staleMappings = priorMappings.filter((entry) => entry.key !== targetKey);
    const previousIdentityKey = staleMappings.length > 0 ? staleMappings[0].key : null;

    await registerUser(user, appUser.email || '이메일 정보 없음', appUser.uid, {
        linkSource,
        previousIdentityKey: previousIdentityKey || undefined
    });

    for (const entry of staleMappings) {
        await removeMappingByKey(entry.key);
    }

    return {
        ok: true,
        reason: previousIdentityKey ? 'ok_moved' : 'ok',
        displayName,
        movedFromDisplayName: previousIdentityKey
            ? (staleMappings[0].mapping?.linkedDisplayName || staleMappings[0].mapping?.displayName || null)
            : null
    };
}

/**
 * Single place that answers "is this speaker linked?".
 * Callers must not query `user_mappings` by nickname themselves.
 */
async function resolveLinkedAccount(user) {
    const mapping = await getMapping(user);

    return mapping
        ? { status: 'linked', mapping }
        : { status: 'unlinked', mapping: null };
}

/**
 * Copy for "we cannot find your account".
 *
 * Deliberately does not claim the link "broke": a renamed member and a
 * first-time speaker look identical to the server, so asserting a broken link
 * would be a lie to anyone who never linked. This wording is true either way.
 */
function buildUnlinkedMessage(user) {
    const displayName = getDisplayName(user);

    return `${displayName}님의 앱 계정 연결을 확인하지 못했어요.
닉네임을 바꾸셨다면 연결이 풀렸을 수 있어요.

앱 프로필에서 연결 코드를 만든 뒤
!연결 코드 를 입력해 주세요.`;
}

module.exports = {
    linkByCode,
    resolveLinkedAccount,
    buildUnlinkedMessage,
    isLinkCodeShaped,
    normalizeLinkCode,
    LINK_CODE_REGEX
};
