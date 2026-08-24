/**
 * 상품 slug 생성기.
 *
 * 배경: 운영자가 slug를 직접 지어야 했다. 규칙(영문 소문자·숫자·하이픈)을 어기면
 * Zod가 "Invalid"라는 한 단어만 내보냈고, 화면에는 "slug: Invalid"만 떴다.
 * 무엇이 잘못됐는지 알 수 없는 데다, 애초에 상품을 파는 사람이 URL 주소 규칙을
 * 알아야 할 이유가 없다. 상품명에서 자동으로 만들어 준다.
 *
 * 한글은 자모 단위로 로마자 표기한다. 국립국어원 표기법의 음운 변화 규칙까지는
 * 따르지 않는다(slug는 고유하고 URL에 안전하기만 하면 되고, 사람이 알아볼 정도면 충분하다).
 */

const CHOSEONG = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h'];

const JUNGSEONG = [
  'a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe',
  'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i',
];

const JONGSEONG = [
  '', 'k', 'k', 'ks', 'n', 'nj', 'nh', 't', 'l', 'lk', 'lm', 'lp', 'ls', 'lt',
  'lp', 'lh', 'm', 'p', 'ps', 't', 't', 'ng', 't', 't', 'k', 't', 'p', 't',
];

const HANGUL_BASE = 0xac00;
const HANGUL_LAST = 0xd7a3;

function romanizeHangulChar(code: number): string {
  const offset = code - HANGUL_BASE;
  const cho = Math.floor(offset / 588);
  const jung = Math.floor((offset % 588) / 28);
  const jong = offset % 28;
  return `${CHOSEONG[cho] ?? ''}${JUNGSEONG[jung] ?? ''}${JONGSEONG[jong] ?? ''}`;
}

/** 한글이 섞인 문자열을 라틴 문자로 바꾼다. 한글이 아닌 글자는 그대로 통과시킨다. */
export function romanizeKorean(input: string): string {
  let out = '';
  for (const char of input) {
    const code = char.codePointAt(0) ?? 0;
    out += code >= HANGUL_BASE && code <= HANGUL_LAST ? romanizeHangulChar(code) : char;
  }
  return out;
}

/**
 * 상품명 등 아무 문자열에서 slug 규칙(^[a-z0-9-]+$, 2~120자)을 만족하는 값을 만든다.
 * 만들 수 없으면 빈 문자열을 돌려준다(호출부가 대체값을 정한다).
 */
export function slugify(input: string): string {
  const romanized = romanizeKorean(input)
    .normalize('NFKD')
    // 발음 구별 부호 제거 (café -> cafe)
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

  const slug = romanized
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 120)
    .replace(/-+$/g, '');

  return slug.length >= 2 ? slug : '';
}

/**
 * slug가 이미 쓰이고 있을 때 다음 후보를 만든다.
 * gift-set -> gift-set-2 -> gift-set-3
 */
export function nextSlugCandidate(slug: string): string {
  const match = /^(.*?)-(\d+)$/.exec(slug);
  if (match?.[1] && match[2]) {
    const next = Number(match[2]) + 1;
    return `${match[1]}-${next}`.slice(0, 120);
  }
  return `${slug}-2`.slice(0, 120);
}
