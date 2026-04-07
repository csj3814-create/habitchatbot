const test = require('node:test');
const assert = require('node:assert/strict');

const {
    getKstHour,
    isHourInWindow,
    shouldRunSelfPing
} = require('../utils/selfPingWindow');

test('getKstHour converts UTC time into KST hour', () => {
    const date = new Date('2026-04-07T16:30:00.000Z');
    assert.equal(getKstHour(date), 1);
});

test('isHourInWindow handles simple same-day windows', () => {
    assert.equal(isHourInWindow(3, 1, 7), true);
    assert.equal(isHourInWindow(7, 1, 7), false);
    assert.equal(isHourInWindow(0, 1, 7), false);
});

test('isHourInWindow handles overnight windows', () => {
    assert.equal(isHourInWindow(23, 22, 6), true);
    assert.equal(isHourInWindow(3, 22, 6), true);
    assert.equal(isHourInWindow(12, 22, 6), false);
});

test('shouldRunSelfPing skips the default KST sleep window', () => {
    const sleepTime = new Date('2026-04-07T17:00:00.000Z');
    const wakeTime = new Date('2026-04-07T22:00:00.000Z');

    assert.equal(shouldRunSelfPing(sleepTime), false);
    assert.equal(shouldRunSelfPing(wakeTime), true);
});
