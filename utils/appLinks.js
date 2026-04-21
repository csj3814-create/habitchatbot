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

module.exports = {
    normalizeBaseUrl,
    buildHabitsSchoolInviteUrl,
    getHabitsSchoolGalleryUrl
};
