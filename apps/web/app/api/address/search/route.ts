import { NextResponse } from 'next/server';
import type { JusoSearchAddress } from '@/lib/shipping-addresses';

const JUSO_SEARCH_URL = 'https://business.juso.go.kr/addrlink/addrLinkApi.do';
const MAX_SEARCH_LENGTH = 80;
const UNSAFE_SEARCH_CHARS = /[%=><[\]]/;
const SQL_RESERVED_WORDS = /\b(?:OR|SELECT|INSERT|DELETE|UPDATE|CREATE|DROP|EXEC|UNION|FETCH|DECLARE|TRUNCATE)\b/i;

type JusoApiAddress = {
  roadAddr?: string;
  roadAddrPart1?: string;
  roadAddrPart2?: string;
  jibunAddr?: string;
  zipNo?: string;
  siNm?: string;
  sggNm?: string;
  emdNm?: string;
  liNm?: string;
  bdNm?: string;
  admCd?: string;
  rnMgtSn?: string;
  bdMgtSn?: string;
};

type JusoApiResponse = {
  results?: {
    common?: { errorCode?: string; errorMessage?: string; totalCount?: string };
    juso?: JusoApiAddress[];
  };
};

function clean(value: string | undefined): string {
  return value?.trim() ?? '';
}

function mapAddress(address: JusoApiAddress): JusoSearchAddress | null {
  const roadAddress = clean(address.roadAddr);
  const roadAddressPart1 = clean(address.roadAddrPart1) || roadAddress;
  const postalCode = clean(address.zipNo);
  if (!roadAddressPart1 || !/^\d{5}$/.test(postalCode)) return null;
  const eupmyeondong = [clean(address.emdNm), clean(address.liNm)]
    .filter(Boolean)
    .join(' ');
  return {
    postalCode,
    roadAddress,
    roadAddressPart1,
    roadAddressPart2: clean(address.roadAddrPart2),
    jibunAddress: clean(address.jibunAddr),
    buildingName: clean(address.bdNm),
    sido: clean(address.siNm),
    sigungu: clean(address.sggNm),
    eupmyeondong,
    admCd: clean(address.admCd),
    roadNameCode: clean(address.rnMgtSn),
    buildingManagementNo: clean(address.bdMgtSn),
  };
}

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  if (query.length < 2 || query.length > MAX_SEARCH_LENGTH) {
    return NextResponse.json(
      {
        error: `주소 검색어를 2자 이상 ${MAX_SEARCH_LENGTH}자 이하로 입력해 주세요.`,
      },
      { status: 400 },
    );
  }
  if ((query.match(/[가-힣]/g) ?? []).length > 40) {
    return NextResponse.json(
      { error: '한글 검색어는 40자 이하로 입력해 주세요.' },
      { status: 400 },
    );
  }
  if (UNSAFE_SEARCH_CHARS.test(query) || SQL_RESERVED_WORDS.test(query)) {
    return NextResponse.json(
      { error: '검색어에 사용할 수 없는 문자나 예약어가 포함되어 있습니다.' },
      { status: 400 },
    );
  }
  if (/^\d+$/.test(query)) {
    return NextResponse.json(
      { error: '주소명과 건물번호를 함께 입력해 주세요.' },
      { status: 400 },
    );
  }

  const apiKey = process.env.JUSO_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          '주소 검색 승인키가 설정되지 않았습니다. 주소를 직접 입력해 주세요.',
      },
      { status: 503 },
    );
  }

  const params = new URLSearchParams({
    confmKey: apiKey,
    currentPage: '1',
    countPerPage: '10',
    keyword: query,
    resultType: 'json',
  });

  try {
    const response = await fetch(`${JUSO_SEARCH_URL}?${params.toString()}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(7000),
    });
    if (!response.ok) throw new Error(`Juso API HTTP ${response.status}`);
    const payload = (await response.json()) as JusoApiResponse;
    const common = payload.results?.common;
    if (common?.errorCode && common.errorCode !== '0') {
      return NextResponse.json(
        { error: clean(common.errorMessage) || '주소 검색에 실패했습니다.' },
        { status: 502 },
      );
    }
    const addresses = (payload.results?.juso ?? [])
      .map(mapAddress)
      .filter((value): value is JusoSearchAddress => value !== null);
    return NextResponse.json(
      {
        addresses,
        totalCount: Number.parseInt(common?.totalCount ?? '0', 10) || 0,
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch {
    return NextResponse.json(
      {
        error:
          '주소 검색 서비스에 연결하지 못했습니다. 주소를 직접 입력해 주세요.',
      },
      { status: 502 },
    );
  }
}
