function normalizeStudentName(displayName) {
    const rawName = String(displayName || '').replace(/\s+/g, ' ').trim();
    const normalized = rawName.replace(/\s*(코치님|코치|선생님)\s*$/u, '').trim();

    return normalized || '사용자';
}

function buildStudentAddressPrompt(displayName) {
    const studentName = normalizeStudentName(displayName);

    return `사용자는 해빛스쿨 학생입니다.
이름을 부를 때는 '${studentName}님' 또는 그냥 '님'이라고만 자연스럽게 불러 주세요.
절대 '${studentName} 코치님', '코치님', '선생님'이라고 부르지 마세요.`;
}

module.exports = {
    normalizeStudentName,
    buildStudentAddressPrompt
};
