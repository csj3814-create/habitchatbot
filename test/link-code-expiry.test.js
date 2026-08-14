const test = require('node:test');
const assert = require('node:assert/strict');
const admin = require('firebase-admin');

const { toEpochMs } = require('../modules/appFirebase');

const TEN_MINUTES_MS = 10 * 60 * 1000;

test('toEpochMs reads the Firestore Timestamp the app actually writes', () => {
    // habitschool functions/runtime.js writes:
    //   chatbotLinkCodeExpiresAt: admin.firestore.Timestamp.fromDate(expiresAt)
    // `new Date(<Timestamp>)` is Invalid Date, which used to mark every fresh
    // code as expired and made `!등록 <코드>` reject valid codes.
    const future = new Date(Date.now() + TEN_MINUTES_MS);
    const timestamp = admin.firestore.Timestamp.fromDate(future);

    assert.ok(Number.isNaN(new Date(timestamp).getTime()), 'precondition: the naive parse is broken');
    assert.equal(toEpochMs(timestamp), future.getTime());
    assert.ok(toEpochMs(timestamp) > Date.now(), 'a fresh code must not read as expired');
});

test('toEpochMs reads a serialized Firestore timestamp', () => {
    const future = new Date(Date.now() + TEN_MINUTES_MS);
    const seconds = Math.floor(future.getTime() / 1000);

    assert.equal(toEpochMs({ seconds, nanoseconds: 0 }), seconds * 1000);
    assert.equal(toEpochMs({ _seconds: seconds, _nanoseconds: 0 }), seconds * 1000);
});

test('toEpochMs still accepts ISO strings, Dates, and epoch numbers', () => {
    const future = new Date(Date.now() + TEN_MINUTES_MS);

    assert.equal(toEpochMs(future.toISOString()), future.getTime());
    assert.equal(toEpochMs(future), future.getTime());
    assert.equal(toEpochMs(future.getTime()), future.getTime());
});

test('toEpochMs returns NaN for values that carry no usable time', () => {
    for (const value of [null, undefined, '', 'not-a-date', {}, { seconds: 'soon' }, NaN, Infinity]) {
        assert.ok(Number.isNaN(toEpochMs(value)), `expected NaN for ${JSON.stringify(value)}`);
    }
});

test('a genuinely expired Firestore Timestamp still reads as expired', () => {
    const past = new Date(Date.now() - TEN_MINUTES_MS);
    const timestamp = admin.firestore.Timestamp.fromDate(past);

    assert.ok(toEpochMs(timestamp) < Date.now());
});
