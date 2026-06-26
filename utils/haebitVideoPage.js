function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderHaebitVideoProgressPage({ shareCode, title = '어제와 오늘 해빛 영상' }) {
    const safeCode = /^[A-Za-z0-9_-]{8,24}$/.test(String(shareCode || ''))
        ? String(shareCode)
        : '';

    return `<!doctype html>
<html lang="ko">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="어제와 오늘의 사진, 운동 영상, 감사일기를 한 편의 해빛 영상으로 만들고 있습니다.">
    <style>
        :root {
            color-scheme: light;
            --ink: #17202c;
            --muted: #66707b;
            --line: #dfe6df;
            --paper: #ffffff;
            --wash: #f3f6f1;
            --accent: #1f8a70;
            --accent-soft: #e5f4ee;
            --orange: #e44f36;
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

        .shell {
            width: min(100%, 760px);
            margin: 0 auto;
            padding: 18px;
        }

        .topbar {
            display: flex;
            align-items: center;
            gap: 10px;
            min-height: 60px;
            color: var(--navy);
            font-weight: 900;
        }

        .mark {
            width: 38px;
            height: 38px;
            border-radius: 8px;
            display: grid;
            place-items: center;
            color: white;
            background: var(--accent);
        }

        .stage {
            min-height: calc(100vh - 96px);
            display: grid;
            align-content: center;
            gap: 18px;
            padding-bottom: 48px;
        }

        .preview {
            position: relative;
            overflow: hidden;
            aspect-ratio: 9 / 16;
            width: min(100%, 320px);
            margin: 0 auto;
            border: 1px solid var(--line);
            border-radius: 8px;
            background: var(--paper);
        }

        .preview::before {
            content: "";
            position: absolute;
            inset: 0 auto 0 0;
            width: 12px;
            background: var(--accent);
        }

        .preview-inner {
            position: absolute;
            inset: 32px 26px;
            border: 1px solid var(--line);
            border-radius: 8px;
            display: grid;
            grid-template-rows: auto minmax(0, 1fr) auto;
            gap: 18px;
            padding: 28px 24px;
            background: #fbfcfa;
        }

        .date-strip {
            display: flex;
            justify-content: space-between;
            gap: 12px;
            color: var(--muted);
            font-size: 13px;
            font-weight: 800;
        }

        .visual {
            display: grid;
            grid-template-columns: 1fr 1fr;
            grid-template-rows: 1fr 1fr;
            gap: 8px;
            min-height: 0;
        }

        .tile {
            border-radius: 7px;
            background: var(--accent-soft);
            border: 1px solid #d4e8df;
        }

        .tile:nth-child(2) {
            background: #eef3fb;
            border-color: #dbe5f3;
        }

        .tile:nth-child(3) {
            grid-column: 1 / -1;
            background: #fff1ee;
            border-color: #f2d9d3;
        }

        .preview-copy p {
            margin: 0 0 8px;
            color: var(--accent);
            font-size: 13px;
            font-weight: 900;
        }

        .preview-copy h1 {
            margin: 0;
            font-size: clamp(25px, 7vw, 36px);
            line-height: 1.16;
            letter-spacing: 0;
        }

        video {
            display: none;
            width: 100%;
            height: 100%;
            object-fit: contain;
            background: var(--wash);
        }

        .progress-area {
            text-align: center;
        }

        .percent {
            margin: 0;
            color: var(--navy);
            font-size: clamp(42px, 12vw, 68px);
            line-height: 1;
            font-weight: 900;
        }

        .status {
            min-height: 26px;
            max-width: 520px;
            margin: 12px auto 14px;
            padding: 0 12px;
            color: var(--muted);
            font-size: 16px;
            line-height: 1.5;
            word-break: keep-all;
        }

        .bar {
            width: min(100%, 520px);
            height: 12px;
            margin: 0 auto;
            overflow: hidden;
            border-radius: 999px;
            background: #dfe6df;
        }

        .bar-fill {
            width: 1%;
            height: 100%;
            border-radius: inherit;
            background: var(--accent);
            transition: width 500ms ease;
        }

        .wait-copy {
            max-width: 380px;
            margin: 12px auto 0;
            padding: 0 14px;
            color: #818892;
            font-size: 13px;
            line-height: 1.5;
            word-break: keep-all;
        }

        .actions {
            display: none;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
            width: min(100%, 520px);
            margin: 16px auto 0;
        }

        .actions a, .retry {
            min-height: 44px;
            border: 0;
            border-radius: 8px;
            display: grid;
            place-items: center;
            padding: 0 14px;
            text-decoration: none;
            font-weight: 900;
            cursor: pointer;
        }

        .actions a:first-child {
            color: white;
            background: var(--accent);
        }

        .actions a:last-child, .retry {
            color: var(--navy);
            background: white;
            border: 1px solid var(--line);
        }

        .retry {
            display: none;
            width: min(100%, 280px);
            margin: 16px auto 0;
        }

        @media (max-width: 480px) {
            .shell {
                padding: 12px;
            }

            .stage {
                align-content: start;
            }

            .preview {
                width: min(100%, 240px);
            }
        }
    </style>
</head>
<body>
    <main class="shell">
        <header class="topbar"><span class="mark">H</span><span>해빛스쿨</span></header>
        <section class="stage">
            <div class="preview" id="preview">
                <div class="preview-inner" id="placeholder">
                    <div class="date-strip"><span>어제와 오늘 기록</span><span>9:16 VIDEO</span></div>
                    <div class="visual" aria-hidden="true">
                        <span class="tile"></span><span class="tile"></span><span class="tile"></span>
                    </div>
                    <div class="preview-copy">
                        <p>사진 · 운동 · 감사일기</p>
                        <h1>${escapeHtml(title)}</h1>
                    </div>
                </div>
                <video id="video" controls playsinline preload="metadata"></video>
            </div>

            <div class="progress-area">
                <p class="percent" id="percent">0%</p>
                <p class="status" id="status">영상 제작을 시작하고 있어요.</p>
                <div class="bar" aria-hidden="true"><div class="bar-fill" id="barFill"></div></div>
                <p class="wait-copy" id="waitCopy">보통 1~2분 정도 걸리며, 기록이 많으면 조금 더 걸릴 수 있어요.</p>
                <div class="actions" id="actions">
                    <a id="download" href="#">영상 저장</a>
                    <a href="/${encodeURIComponent(safeCode)}">기록으로 돌아가기</a>
                </div>
                <button class="retry" id="retry" type="button">다시 만들기</button>
            </div>
        </section>
    </main>
    <script>
        const shareCode = ${JSON.stringify(safeCode)};
        const statusUrl = '/video/' + encodeURIComponent(shareCode) + '/status';
        const videoUrl = '/v/' + encodeURIComponent(shareCode) + '.mp4';
        const percent = document.getElementById('percent');
        const statusText = document.getElementById('status');
        const barFill = document.getElementById('barFill');
        const placeholder = document.getElementById('placeholder');
        const video = document.getElementById('video');
        const actions = document.getElementById('actions');
        const download = document.getElementById('download');
        const retry = document.getElementById('retry');
        const waitCopy = document.getElementById('waitCopy');
        let timer = null;

        statusText.textContent = '영상 상태를 확인하고 있어요.';
        waitCopy.textContent = '채팅 명령에서 영상 만들기를 시작했어요. 이 페이지는 진행 상황과 다운로드만 보여줘요.';
        retry.textContent = '상태 다시 확인';

        function paint(job) {
            const value = Math.max(0, Math.min(100, Number(job.progress) || 0));
            percent.textContent = Math.round(value) + '%';
            barFill.style.width = Math.max(1, value) + '%';
            statusText.textContent = job.message || '영상을 만들고 있어요.';

            if (job.status !== 'idle' && job.status !== 'error') {
                retry.style.display = 'none';
            }

            if (job.status === 'ready') {
                clearInterval(timer);
                percent.textContent = '완성';
                barFill.style.width = '100%';
                placeholder.style.display = 'none';
                video.style.display = 'block';
                video.src = videoUrl;
                download.href = videoUrl;
                download.setAttribute('download', 'haebit-2days.mp4');
                actions.style.display = 'grid';
                waitCopy.textContent = '재생하거나 기기에 저장할 수 있어요.';
            } else if (job.status === 'error') {
                clearInterval(timer);
                retry.style.display = 'grid';
                waitCopy.textContent = '잠시 후 다시 시도해 주세요.';
            }
        }

        async function readStatus() {
            const response = await fetch(statusUrl, { cache: 'no-store' });
            if (!response.ok) throw new Error('status');
            const job = await response.json();
            if (job.status === 'idle') {
                paint({
                    status: 'idle',
                    progress: 0,
                    message: '아직 서버에서 만들고 있는 영상이 없어요. 채팅방에서 !하루영상 을 다시 입력해 주세요.'
                });
                clearInterval(timer);
                retry.style.display = 'grid';
                return;
            }
            paint(job);
        }

        function showError() {
            clearInterval(timer);
            statusText.textContent = '영상 상태를 확인하지 못했어요.';
            retry.style.display = 'grid';
        }

        retry.addEventListener('click', () => readStatus().catch(showError));
        readStatus().catch(showError);
        timer = setInterval(() => readStatus().catch(showError), 1200);
    </script>
</body>
</html>`;
}

module.exports = {
    renderHaebitVideoProgressPage
};
