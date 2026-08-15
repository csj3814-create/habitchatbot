const DEFAULT_APP_URL = 'https://habitschool.web.app/';
const DEFAULT_GALLERY_PATH = '/#gallery';

function normalizeBaseUrl(value = process.env.HABITSCHOOL_APP_URL || DEFAULT_APP_URL) {
    try {
        const url = new URL(String(value || '').trim() || DEFAULT_APP_URL);
        url.search = '';
        url.hash = '';
        if (!url.pathname || url.pathname === '') {
            url.pathname = '/';
        }
        return url.toString();
    } catch (_) {
        return DEFAULT_APP_URL;
    }
}

function buildHabitsSchoolInviteUrl(referralCode) {
    const normalizedCode = String(referralCode || '').trim();
    const url = new URL(normalizeBaseUrl());

    if (normalizedCode) {
        url.searchParams.set('ref', normalizedCode);
    }

    return url.toString();
}

function getHabitsSchoolGalleryUrl() {
    try {
        const url = new URL(normalizeBaseUrl());
        url.hash = 'gallery';
        return url.toString();
    } catch (_) {
        return `https://habitschool.web.app${DEFAULT_GALLERY_PATH}`;
    }
}

/**
 * Opens the gallery and highlights the share card.
 *
 * The card itself is built in the app, where the member can pick a template,
 * choose the hero photo, and hand the finished image to whichever room they
 * want. `focus=share` is handled by handleAppEntryDeepLink in the app.
 */
function getHabitsSchoolShareCardUrl() {
    try {
        const url = new URL(normalizeBaseUrl());
        url.searchParams.set('tab', 'gallery');
        url.searchParams.set('focus', 'share');
        url.hash = 'gallery';
        return url.toString();
    } catch (_) {
        return `https://habitschool.web.app/?tab=gallery&focus=share#gallery`;
    }
}

module.exports = {
    normalizeBaseUrl,
    buildHabitsSchoolInviteUrl,
    getHabitsSchoolGalleryUrl,
    getHabitsSchoolShareCardUrl
};
