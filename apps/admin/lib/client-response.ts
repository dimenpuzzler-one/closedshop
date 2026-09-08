export interface ValidationDetails {
  fieldErrors?: Record<string, string[]>;
  formErrors?: string[];
}

export interface ApiResult {
  message?: string;
  error?: string;
  code?: string;
  requestId?: string;
  productId?: string;
  upload?: { path: string; token: string };
  details?: ValidationDetails;
}

/** 프록시의 HTML 오류나 잘못된 JSON도 폼에서 표시할 수 있는 오류로 돌려준다. */
export async function readResponse(response: Response): Promise<ApiResult> {
  if (response.status === 413) {
    return { error: '요청 용량이 서버 한도를 넘었습니다. 이미지 파일은 직접 업로드 경로를 사용해 주세요.', code: 'payload_too_large' };
  }
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return { error: `서버가 예상과 다른 응답을 보냈습니다. (HTTP ${response.status})`, code: 'non_json_response' };
  }
  try {
    const body: unknown = await response.json();
    if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new Error('object required');
    return body;
  } catch {
    return { error: `서버 응답(JSON)을 해석하지 못했습니다. (HTTP ${response.status})`, code: 'invalid_json_response' };
  }
}
