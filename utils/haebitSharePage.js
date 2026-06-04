const DEFAULT_LOGIN_URL = 'https://habitschool.web.app/simple/';

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function safeHttpUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) {
        return '';
    }

    try {
        const url = new URL(raw);
        return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : '';
    } catch (_) {
        return '';
    }
}

function renderMetric(metric) {
    if (!metric?.label || !metric?.value) {
        return '';
    }

    return `<span class="metric"><span>${escapeHtml(metric.label)}</span><strong>${escapeHtml(metric.value)}</strong></span>`;
}

function renderMedia(media) {
    const imageUrl = safeHttpUrl(media?.thumbUrl || media?.url);
    const linkUrl = safeHttpUrl(media?.url || media?.thumbUrl);
    if (!imageUrl) {
        return '';
    }

    const label = escapeHtml(media?.label || media?.category || '기록');
    const category = escapeHtml(media?.category || '해빛');
    const videoBadge = media?.type === 'video' ? '<span class="play">재생</span>' : '';

    return `
        <a class="media-item" href="${escapeHtml(linkUrl || imageUrl)}" target="_blank" rel="noopener noreferrer">
            <img src="${escapeHtml(imageUrl)}" alt="${label}" loading="lazy">
            <span class="media-label">${category} · ${label}</span>
            ${videoBadge}
        </a>
    `;
}

function renderSection(section) {
    const metrics = Array.isArray(section?.metrics) ? section.metrics.map(renderMetric).join('') : '';
    const media = Array.isArray(section?.media) ? section.media.map(renderMedia).join('') : '';

    return `
        <section class="section">
            <div class="section-head">
                <div>
                    <p>${escapeHtml(section?.title || '기록')}</p>
                    <h2>${escapeHtml(section?.summary || '기록 완료')}</h2>
                </div>
                <button type="button" data-login-action>${escapeHtml(section?.ctaLabel || '내 기록 시작하기')}</button>
            </div>
            ${metrics ? `<div class="metrics">${metrics}</div>` : ''}
            ${media ? `<div class="section-media">${media}</div>` : ''}
        </section>
    `;
}

function renderHaebitSharePage(payload) {
    const loginUrl = safeHttpUrl(payload?.inviteUrl) || DEFAULT_LOGIN_URL;
    const title = payload?.pageTitle || payload?.title || '해빛스쿨 하루 기록';
    const description = payload?.subtitle || '로그인 없이 볼 수 있는 해빛스쿨 하루 습관 기록입니다.';
    const media = Array.isArray(payload?.galleryMedia) ? payload.galleryMedia : [];
    const sections = Array.isArray(payload?.sections) ? payload.sections : [];
    const ogImage = safeHttpUrl(media[0]?.thumbUrl || media[0]?.url);
    const pointsText = typeof payload?.points === 'number' ? `${payload.points}P` : '';
    const tags = Array.isArray(payload?.tags) ? payload.tags : [];

    return `<!doctype html>
<html lang="ko">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:type" content="article">
    ${ogImage ? `<meta property="og:image" content="${escapeHtml(ogImage)}">` : ''}
    <style>
        :root {
            color-scheme: light;
            --ink: #17181f;
            --muted: #636a76;
            --line: #e4e7ee;
            --paper: #ffffff;
            --wash: #f6f7f2;
            --accent: #1f8a70;
            --accent-2: #e44f36;
            --navy: #24334f;
        }

        * {
            box-sizing: border-box;
        }

        body {
            margin: 0;
            min-height: 100vh;
            background: var(--wash);
            color: var(--ink);
            font-family: Arial, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif;
            letter-spacing: 0;
        }

        a {
            color: inherit;
        }

        .shell {
            max-width: 980px;
            margin: 0 auto;
            padding: 18px;
        }

        .topbar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 12px 0 18px;
        }

        .brand {
            display: flex;
            align-items: center;
            gap: 10px;
            font-weight: 800;
            color: var(--navy);
        }

        .mark {
            width: 34px;
            height: 34px;
            border-radius: 8px;
            display: grid;
            place-items: center;
            background: var(--accent);
            color: white;
            font-weight: 900;
        }

        .join {
            border: 0;
            border-radius: 8px;
            background: var(--navy);
            color: white;
            min-height: 40px;
            padding: 0 14px;
            font-weight: 800;
            cursor: pointer;
        }

        .hero {
            display: grid;
            grid-template-columns: minmax(0, 1fr) minmax(300px, 0.9fr);
            gap: 18px;
            align-items: stretch;
        }

        .intro, .media-panel, .section, .actions {
            background: var(--paper);
            border: 1px solid var(--line);
            border-radius: 8px;
        }

        .intro {
            padding: clamp(22px, 5vw, 44px);
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            min-height: 340px;
        }

        .eyebrow {
            margin: 0 0 12px;
            color: var(--accent);
            font-size: 13px;
            font-weight: 900;
        }

        h1 {
            margin: 0;
            max-width: 12em;
            font-size: clamp(34px, 7vw, 62px);
            line-height: 1.02;
            letter-spacing: 0;
        }

        .subtitle {
            margin: 18px 0 0;
            max-width: 36em;
            color: var(--muted);
            line-height: 1.6;
            font-size: 16px;
        }

        .chips {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-top: 28px;
        }

        .chip {
            border: 1px solid var(--line);
            border-radius: 999px;
            padding: 8px 11px;
            color: var(--navy);
            background: #fbfcff;
            font-size: 13px;
            font-weight: 800;
        }

        .media-panel {
            min-height: 340px;
            overflow: hidden;
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 8px;
            padding: 8px;
        }

        .media-item {
            position: relative;
            min-height: 158px;
            overflow: hidden;
            border-radius: 7px;
            background: #dfe5df;
            text-decoration: none;
        }

        .media-item img {
            width: 100%;
            height: 100%;
            min-height: 158px;
            object-fit: cover;
            display: block;
        }

        .media-label, .play {
            position: absolute;
            left: 10px;
            bottom: 10px;
            max-width: calc(100% - 20px);
            border-radius: 999px;
            background: rgba(23, 24, 31, 0.76);
            color: white;
            padding: 6px 9px;
            font-size: 12px;
            font-weight: 800;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .play {
            left: auto;
            right: 10px;
            top: 10px;
            bottom: auto;
            background: var(--accent-2);
        }

        .empty-media {
            grid-column: 1 / -1;
            min-height: 320px;
            display: grid;
            place-items: center;
            text-align: center;
            padding: 24px;
            color: var(--muted);
            line-height: 1.6;
        }

        .actions {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 1px;
            margin: 18px 0;
            overflow: hidden;
            background: var(--line);
        }

        .actions button {
            border: 0;
            min-height: 58px;
            background: white;
            color: var(--navy);
            font-weight: 900;
            cursor: pointer;
        }

        .sections {
            display: grid;
            gap: 12px;
        }

        .section {
            padding: 18px;
        }

        .section-head {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 14px;
        }

        .section p {
            margin: 0 0 6px;
            color: var(--accent);
            font-size: 13px;
            font-weight: 900;
        }

        .section h2 {
            margin: 0;
            font-size: clamp(18px, 3.5vw, 26px);
            line-height: 1.28;
            letter-spacing: 0;
        }

        .section button {
            flex: 0 0 auto;
            border: 1px solid var(--line);
            border-radius: 8px;
            min-height: 38px;
            padding: 0 12px;
            background: #fbfcff;
            color: var(--navy);
            font-weight: 900;
            cursor: pointer;
        }

        .metrics {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-top: 14px;
        }

        .metric {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            border: 1px solid var(--line);
            border-radius: 999px;
            padding: 7px 10px;
            color: var(--muted);
            font-size: 13px;
        }

        .metric strong {
            color: var(--ink);
        }

        .section-media {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 8px;
            margin-top: 14px;
        }

        .section-media .media-item {
            min-height: 112px;
        }

        .section-media .media-item img {
            min-height: 112px;
        }

        .footer {
            padding: 24px 2px 10px;
            color: var(--muted);
            font-size: 13px;
            line-height: 1.6;
            text-align: center;
        }

        @media (max-width: 760px) {
            .shell {
                padding: 12px;
            }

            .hero {
                grid-template-columns: 1fr;
            }

            .intro {
                min-height: auto;
            }

            .media-panel {
                min-height: 280px;
            }

            .actions {
                grid-template-columns: 1fr;
            }

            .section-head {
                flex-direction: column;
            }

            .section button {
                width: 100%;
            }

            .section-media {
                grid-template-columns: repeat(2, minmax(0, 1fr));
            }
        }
    </style>
</head>
<body>
    <main class="shell">
        <header class="topbar">
            <div class="brand"><span class="mark">H</span><span>해빛스쿨</span></div>
            <button class="join" type="button" data-login-action>로그인</button>
        </header>

        <div class="hero">
            <section class="intro">
                <div>
                    <p class="eyebrow">${escapeHtml(payload?.date || '오늘의 기록')}</p>
                    <h1>${escapeHtml(title)}</h1>
                    <p class="subtitle">${escapeHtml(description)}</p>
                </div>
                <div class="chips">
                    ${pointsText ? `<span class="chip">${escapeHtml(pointsText)}</span>` : ''}
                    ${tags.map((tag) => `<span class="chip">${escapeHtml(tag)}</span>`).join('')}
                </div>
            </section>

            <section class="media-panel" aria-label="기록 사진">
                ${media.length > 0 ? media.slice(0, 4).map(renderMedia).join('') : '<div class="empty-media">사진 없이도 하루 습관 기록을 공유할 수 있어요.<br>자세한 기록은 아래에서 확인해 주세요.</div>'}
            </section>
        </div>

        <section class="actions" aria-label="참여하기">
            <button type="button" data-login-action>좋아요</button>
            <button type="button" data-login-action>댓글 달기</button>
            <button type="button" data-login-action>나도 기록하기</button>
        </section>

        <div class="sections">
            ${sections.length > 0 ? sections.map(renderSection).join('') : '<section class="section"><div class="section-head"><div><p>해빛 기록</p><h2>공유 가능한 기록을 불러왔어요.</h2></div><button type="button" data-login-action>내 기록 시작하기</button></div></section>'}
        </div>

        <footer class="footer">
            이 페이지는 공유자가 공개한 하루 습관 기록만 보여줍니다. 참여하려면 해빛스쿨 로그인이 필요합니다.
        </footer>
    </main>
    <script>
        const loginUrl = ${JSON.stringify(loginUrl)};
        document.querySelectorAll('[data-login-action]').forEach((button) => {
            button.addEventListener('click', () => {
                window.location.href = loginUrl;
            });
        });
    </script>
</body>
</html>`;
}

module.exports = {
    renderHaebitSharePage,
    escapeHtml,
    safeHttpUrl
};
