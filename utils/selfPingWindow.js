function getKstHour(date = new Date()) {
    const hour = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Seoul',
        hour: '2-digit',
        hour12: false
    }).format(date);

    return Number(hour);
}

function isHourInWindow(hour, startHour, endHour) {
    if (startHour === endHour) {
        return false;
    }

    if (startHour < endHour) {
        return hour >= startHour && hour < endHour;
    }

    return hour >= startHour || hour < endHour;
}

function shouldRunSelfPing(
    date = new Date(),
    {
        sleepStartHourKst = 1,
        sleepEndHourKst = 7
    } = {}
) {
    const kstHour = getKstHour(date);
    return !isHourInWindow(kstHour, sleepStartHourKst, sleepEndHourKst);
}

module.exports = {
    getKstHour,
    isHourInWindow,
    shouldRunSelfPing
};
