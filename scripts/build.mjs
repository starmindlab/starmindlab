// 별마음심리상담센터 홈페이지 빌드 스크립트
// - 홈페이지 파일을 _site 로 복사
// - content/columns/*.md 칼럼을 /column/<주소>/ 페이지로 변환
// - /column/ 목록 페이지, 홈 칼럼 칸, sitemap.xml, robots.txt 자동 생성
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { marked } from "marked";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "_site");
const SITE = "https://starmindlab.co.kr";
const HOME_SLOTS = 5; // 홈 칼럼 칸에 보여줄 개수
const EXCLUDE = new Set([
  "_site", "node_modules", "content", "scripts", ".git", ".github",
  "package.json", "package-lock.json", "netlify.toml", ".gitignore", "README.md",
]);

// ---------- 유틸 ----------
const esc = (s = "") =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function toDate(v) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v).replace(" ", "T"));
  return isNaN(d) ? null : d;
}
const ymd = (d) => d.toISOString().slice(0, 10);
const korDate = (d) => `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;

function plainText(md) {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/[#>*_`~|-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
// 한국어 강조 보정: **"굵게"**입니다 처럼 굵은 글씨 바로 뒤에 조사가 붙으면
// 표준 마크다운에서는 굵게 처리가 안 되므로, 미리 <strong>/<em> 으로 바꿔 둔다 (코드 부분 제외)
function fixKoreanEmphasis(md) {
  return md
    .split(/(```[\s\S]*?```|`[^`\n]*`)/)
    .map((part, i) =>
      i % 2
        ? part
        : part
            .replace(/\*\*(?=\S)([^*\n]+?)(?<=\S)\*\*/g, "<strong>$1</strong>")
            .replace(/(?<![*\\\w])\*(?=[^\s*])([^*\n]+?)(?<=[^\s*])\*(?!\*)/g, "<em>$1</em>")
    )
    .join("");
}
const clip = (s, n) => (s.length > n ? s.slice(0, n).trim() + "…" : s);

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    if (src === ROOT && (EXCLUDE.has(name) || name.startsWith("."))) continue;
    const s = path.join(src, name), d = path.join(dst, name);
    if (fs.statSync(s).isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}
function write(rel, content) {
  const p = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

// ---------- 칼럼 읽기 ----------
function loadPosts() {
  const dir = path.join(ROOT, "content", "columns");
  if (!fs.existsSync(dir)) return [];
  const posts = [];
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".md")) continue;
    const raw = fs.readFileSync(path.join(dir, file), "utf8");
    const { data, content } = matter(raw);
    if (data.published === false) continue;
    if (!data.title) { console.warn(`제목 없음, 건너뜀: ${file}`); continue; }
    const slug = file.replace(/\.md$/, "");
    const date = toDate(data.date) || fs.statSync(path.join(dir, file)).mtime;
    const text = plainText(content);
    posts.push({
      slug,
      url: `/column/${encodeURIComponent(slug)}/`,
      title: String(data.title),
      category: data.category ? String(data.category) : "칼럼",
      thumbnail: data.thumbnail || "",
      summary: data.summary ? String(data.summary).trim() : clip(text, 120),
      date,
      html: marked.parse(fixKoreanEmphasis(content), { gfm: true, breaks: true }),
    });
  }
  return posts.sort((a, b) => b.date - a.date || b.slug.localeCompare(a.slug));
}

// ---------- 공통 조각 ----------
const KAKAO = "http://pf.kakao.com/_RVSxan";
const FORM = "https://forms.gle/NZS99SG7Jwpg5MgA6";
const MENU = [
  ["/#about", "센터 소개"], ["/#counselor", "전문가 소개"], ["/#programs", "프로그램"],
  ["/adhd.html", "성인 ADHD"], ["/#reviews", "후기"], ["/column/", "칼럼"],
  ["/payment.html", "결제"], ["/#contact", "문의"], ["/#location", "오시는 길"],
];

function head({ title, description, url, image, type = "website", jsonld = "" }) {
  const img = image ? (image.startsWith("http") ? image : SITE + image) : `${SITE}/logo-icon.png`;
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${SITE}${url}">
<meta property="og:type" content="${type}">
<meta property="og:site_name" content="별마음심리상담센터">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${SITE}${url}">
<meta property="og:image" content="${esc(img)}">
<meta name="robots" content="index, follow">
${jsonld}
<link rel="icon" type="image/x-icon" href="/favicon.ico">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@300;400;600&family=Noto+Sans+KR:wght@300;400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/column.css">
</head>
<body>
<nav>
  <a href="/" class="nav-logo"><img src="/logo-icon.png" alt="별마음" /><span>별마음심리상담센터</span></a>
  <ul class="nav-links">
    ${MENU.map(([h, t]) => `<li><a href="${h}"${h === "/column/" ? ' class="active"' : ""}>${t}</a></li>`).join("\n    ")}
    <li><a href="${FORM}" target="_blank" class="nav-cta">예약하기</a></li>
  </ul>
  <button class="menu-btn" onclick="openMenu()" aria-label="메뉴"><span></span><span></span><span></span></button>
</nav>
<div class="menu-overlay" id="menuOverlay" onclick="closeMenu()"></div>
<div class="mobile-menu" id="mobileMenu">
  <div class="m-head"><span>별마음심리상담센터</span><button onclick="closeMenu()">✕</button></div>
  ${MENU.map(([h, t]) => `<a href="${h}">${t}</a>`).join("\n  ")}
  <a href="${FORM}" target="_blank" class="m-cta">예약하기</a>
</div>
`;
}

const foot = `
<footer>
  <p>© 2025 별마음심리상담센터. All rights reserved. starmindlab.co.kr<br>
  사업자등록번호 : 277-95-01487 &nbsp;|&nbsp; 통신판매신고번호 : 제2022-서울서초-1904호<br>
  서울시 서초구 서초중앙로 5길 10-8, 410호 &nbsp;|&nbsp; starmindlab&#64;naver&#46;com</p>
</footer>
<a href="${KAKAO}" target="_blank" class="kakao-float" aria-label="카카오톡 상담">
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M12 3C6.48 3 2 6.58 2 11c0 2.8 1.63 5.26 4.1 6.76L5.25 21l4.07-2.16C10.1 19.27 11.03 19.4 12 19.4c5.52 0 10-3.58 10-8.4S17.52 3 12 3z" fill="#3A1D1D"/></svg>
</a>
<script>
function openMenu(){document.getElementById('mobileMenu').style.display='flex';document.getElementById('menuOverlay').style.display='block';document.body.style.overflow='hidden';}
function closeMenu(){document.getElementById('mobileMenu').style.display='none';document.getElementById('menuOverlay').style.display='none';document.body.style.overflow='';}
document.querySelectorAll('#mobileMenu a').forEach(function(a){a.addEventListener('click',closeMenu);});
</script>
</body>
</html>
`;

function card(p) {
  return `<a href="${p.url}" class="col-card">
        ${p.thumbnail ? `<img class="thumb" src="${esc(p.thumbnail)}" alt="" loading="lazy">` : ""}
        <div class="body">
          <div class="cat">${esc(p.category)}</div>
          <h3>${esc(p.title)}</h3>
          <p>${esc(p.summary)}</p>
          <div class="meta">${korDate(p.date)}</div>
        </div>
      </a>`;
}

// ---------- 페이지 생성 ----------
function buildPost(p, prev, next) {
  const jsonld = `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: p.title,
    description: p.summary,
    datePublished: ymd(p.date),
    image: p.thumbnail ? SITE + p.thumbnail : undefined,
    url: SITE + p.url,
    author: { "@type": "Person", name: "유정민", jobTitle: "별마음심리상담센터 센터장" },
    publisher: { "@type": "Organization", name: "별마음심리상담센터", logo: { "@type": "ImageObject", url: `${SITE}/logo-icon.png` } },
  })}</script>`;
  return head({
    title: `${p.title} | 별마음심리상담센터`,
    description: p.summary,
    url: p.url,
    image: p.thumbnail,
    type: "article",
    jsonld,
  }) + `
<main class="page">
  <article class="narrow">
    <header class="post-head">
      <div class="cat">${esc(p.category)}</div>
      <h1>${esc(p.title)}</h1>
      <div class="meta">${korDate(p.date)} · 별마음심리상담센터 유정민 센터장</div>
    </header>
    ${p.thumbnail ? `<img class="post-cover" src="${esc(p.thumbnail)}" alt="${esc(p.title)}">` : ""}
    <div class="article">
${p.html}
    </div>

    <div class="author">
      <img src="/profile.png" alt="유정민 센터장">
      <div>
        <div class="name">유정민 센터장</div>
        <div class="desc">별마음심리상담센터 센터장 · KSC 수퍼바이저코치 · 전문상담사 1급 · 상담심리사 1급<br>코칭심리학 박사수료, 성인 ADHD 코칭·상담 전문</div>
      </div>
    </div>

    <div class="cta-box">
      <p>혼자 고민하지 마세요. 별마음심리상담센터가 함께합니다.</p>
      <div class="btns">
        <a href="${FORM}" target="_blank" class="btn-primary">상담 신청하기</a>
        <a href="${KAKAO}" target="_blank" class="btn-outline">카카오톡 문의</a>
      </div>
    </div>

    <div class="post-nav">
      <span>${next ? `<a href="${next.url}">← ${esc(clip(next.title, 24))}</a>` : ""}</span>
      <a href="/column/">칼럼 목록</a>
      <span>${prev ? `<a href="${prev.url}">${esc(clip(prev.title, 24))} →</a>` : ""}</span>
    </div>
  </article>
</main>
` + foot;
}

function buildList(posts) {
  return head({
    title: "별마음 칼럼 | 성인 ADHD·심리상담·코칭 | 별마음심리상담센터",
    description: "서초구 별마음심리상담센터 유정민 센터장이 쓰는 성인 ADHD, 심리상담, 코칭 전문 칼럼입니다.",
    url: "/column/",
  }) + `
<main class="page">
  <div class="container">
    <span class="section-label">Column</span>
    <h1 class="section-title">별마음 칼럼</h1>
    <div class="divider"></div>
    ${posts.length
      ? `<div class="col-grid">\n      ${posts.map(card).join("\n      ")}\n    </div>`
      : `<p class="col-empty">곧 첫 칼럼이 올라옵니다.</p>`}
    <p class="blog-more">더 많은 글은 <a href="https://blog.naver.com/starmindlab" target="_blank">별마음 네이버 블로그</a>에서도 만나보실 수 있어요.</p>
  </div>
</main>
` + foot;
}

// 홈 칼럼 칸: 최신 칼럼 + (부족하면) 네이버 블로그 추천글, 마지막에 '전체 보기'
const HOME_CARD = 'text-decoration:none; background:rgba(255,255,255,0.05); border:1px solid rgba(179,136,255,0.15); border-radius:16px; padding:1.75rem; display:block; transition:border-color 0.2s,transform 0.2s;';
function homeCards(posts) {
  const items = posts.slice(0, HOME_SLOTS).map((p) => ({
    href: p.url, ext: false, cat: p.category, title: p.title, more: `${korDate(p.date)} · 읽기 →`,
  }));
  if (items.length < HOME_SLOTS) {
    let links = [];
    try { links = JSON.parse(fs.readFileSync(path.join(ROOT, "content", "blog-links.json"), "utf8")).links || []; } catch {}
    for (const l of links) {
      if (items.length >= HOME_SLOTS) break;
      if (l && l.url && l.title) items.push({ href: l.url, ext: true, cat: l.category || "ADHD", title: l.title, more: "블로그에서 읽기 →" });
    }
  }
  const cards = items.map((i) => `      <a href="${esc(i.href)}"${i.ext ? ' target="_blank"' : ""} style="${HOME_CARD}">
        <div style="font-size:0.7rem; color:var(--accent); letter-spacing:0.1em; margin-bottom:0.75rem;">${esc(i.cat)}</div>
        <h3 style="font-family:'Noto Serif KR',serif; font-size:0.95rem; color:var(--white); line-height:1.6; margin-bottom:0.75rem; font-weight:400;">${esc(i.title)}</h3>
        <div style="font-size:0.78rem; color:rgba(255,255,255,0.35);">${i.more}</div>
      </a>`);
  cards.push(`      <a href="/column/" style="text-decoration:none; background:rgba(179,136,255,0.08); border:1px solid rgba(179,136,255,0.3); border-radius:16px; padding:1.75rem; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; gap:0.75rem;">
        <div style="font-size:1.5rem;">✦</div>
        <div style="font-size:0.88rem; color:var(--accent-light); font-weight:500;">칼럼 전체 보기</div>
        <div style="font-size:0.78rem; color:rgba(255,255,255,0.4);">더 많은 칼럼을 만나보세요</div>
      </a>`);
  return `    <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:1.25rem;">\n${cards.join("\n")}\n    </div>`;
}

function injectHome(posts) {
  const p = path.join(OUT, "index.html");
  let html = fs.readFileSync(p, "utf8");
  const re = /(<!-- COLUMNS:START[^>]*-->)[\s\S]*?(\s*<!-- COLUMNS:END -->)/;
  if (!re.test(html)) throw new Error("index.html 에서 COLUMNS:START / COLUMNS:END 표시를 찾을 수 없습니다.");
  html = html.replace(re, (_, a, b) => `${a}\n${homeCards(posts)}${b}`);
  fs.writeFileSync(p, html);
}

function buildSitemap(posts) {
  const today = ymd(new Date());
  const urls = [
    { loc: "/", lastmod: posts[0] ? ymd(posts[0].date) : today, pr: "1.0" },
    { loc: "/adhd.html", lastmod: today, pr: "0.9" },
    { loc: "/column/", lastmod: posts[0] ? ymd(posts[0].date) : today, pr: "0.8" },
    { loc: "/payment.html", lastmod: today, pr: "0.5" },
    ...posts.map((p) => ({ loc: p.url, lastmod: ymd(p.date), pr: "0.7" })),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${SITE}${u.loc}</loc><lastmod>${u.lastmod}</lastmod><priority>${u.pr}</priority></url>`).join("\n")}
</urlset>
`;
}

// ---------- 실행 ----------
fs.rmSync(OUT, { recursive: true, force: true });
copyDir(ROOT, OUT);
const posts = loadPosts();
posts.forEach((p, i) => write(`column/${p.slug}/index.html`, buildPost(p, posts[i + 1], posts[i - 1])));
write("column/index.html", buildList(posts));
injectHome(posts);
write("sitemap.xml", buildSitemap(posts));
write("robots.txt", `User-agent: *\nAllow: /\nDisallow: /admin/\n\nSitemap: ${SITE}/sitemap.xml\n`);
console.log(`✓ 빌드 완료: 칼럼 ${posts.length}개`);
