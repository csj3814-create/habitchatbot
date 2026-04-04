/**
 * MessengerBot endpoint API key middleware.
 * Accepts either the `x-api-key` header or `apiKey`/`key` query params.
 */

function getProvidedApiKey(req) {
    const headerKey = req.headers['x-api-key'];
    if (typeof headerKey === 'string' && headerKey.trim()) {
        return headerKey.trim();
    }

    const queryKey = req.query?.apiKey || req.query?.key;
    if (typeof queryKey === 'string' && queryKey.trim()) {
        return queryKey.trim();
    }

    return '';
}

function apiKeyAuth(req, res, next) {
    const secret = process.env.MESSENGER_API_KEY;

    if (!secret) {
        console.error('[Auth] MESSENGER_API_KEY is not configured. Rejecting request.');
        return res.status(503).json({ error: 'Server authentication is not configured.' });
    }

    const provided = getProvidedApiKey(req);
    if (provided !== secret) {
        console.warn(`[Auth] Invalid API key attempt from IP: ${req.ip}`);
        return res.status(401).json({ error: 'Authentication failed: invalid API key.' });
    }

    next();
}

module.exports = { apiKeyAuth };
