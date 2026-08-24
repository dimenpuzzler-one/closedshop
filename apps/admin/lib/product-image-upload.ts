'use client';

import { createBrowserSupabaseClient } from '@closed-commerce/db';

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_UPLOAD_BATCH_BYTES = 200 * 1024 * 1024;
export const MAX_IMAGES_PER_PRODUCT = 21;

const IMAGE_BUCKET = 'product-images';
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

type ApiPayload = {
  message?: string;
  error?: string;
  code?: string;
  requestId?: string;
  uploads?: PreparedUpload[];
};

type ImageDimensions = { width: number; height: number };

type PreparedUpload = {
  path: string;
  token: string;
  sortOrder: number;
  width: number;
  height: number;
  byteSize: number;
  mimeType: string;
};

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

async function readApiResponse(response: Response): Promise<ApiPayload> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      return (await response.json()) as ApiPayload;
    } catch {
      return { error: `서버 응답을 해석하지 못했습니다. (HTTP ${response.status})` };
    }
  }
  const body = await response.text().catch(() => '');
  return { error: `서버가 예상과 다른 응답을 보냈습니다. (HTTP ${response.status}) ${body.slice(0, 160)}`.trim() };
}

function apiError(response: Response, payload: ApiPayload) {
  const tags = [`HTTP ${response.status}`];
  if (payload.code) tags.push(payload.code);
  if (payload.requestId) tags.push(`오류번호 ${payload.requestId}`);
  return new Error(`${payload.error ?? '이미지를 처리하지 못했습니다.'} [${tags.join(' · ')}]`);
}

async function dimensionsOf(file: File): Promise<ImageDimensions> {
  if (typeof createImageBitmap !== 'function') return { width: 0, height: 0 };
  try {
    const bitmap = await createImageBitmap(file);
    const result = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return result;
  } catch {
    return { width: 0, height: 0 };
  }
}

function validateFiles(files: File[]) {
  if (files.length === 0) throw new Error('추가할 사진을 선택해 주세요.');
  if (files.length > MAX_IMAGES_PER_PRODUCT) {
    throw new Error(`한 번에 사진은 최대 ${MAX_IMAGES_PER_PRODUCT}장까지 선택할 수 있습니다.`);
  }
  const invalid = files.find((file) => !ALLOWED_IMAGE_TYPES.has(file.type));
  if (invalid) throw new Error(`"${invalid.name}"은 지원하지 않는 형식입니다. JPG, PNG, WEBP만 올릴 수 있습니다.`);
  const tooLarge = files.find((file) => file.size > MAX_IMAGE_BYTES);
  if (tooLarge) throw new Error(`"${tooLarge.name}"은 ${formatBytes(tooLarge.size)}입니다. 한 장은 ${formatBytes(MAX_IMAGE_BYTES)} 이하여야 합니다.`);
  const total = files.reduce((sum, file) => sum + file.size, 0);
  if (total > MAX_UPLOAD_BATCH_BYTES) {
    throw new Error(`선택한 파일 합계가 ${formatBytes(total)}입니다. 한 번에 ${formatBytes(MAX_UPLOAD_BATCH_BYTES)} 이하로 나눠 올려 주세요.`);
  }
}

/**
 * Vercel Function을 거치지 않고 signed upload URL로 Storage에 직접 전송한다.
 * 원본 픽셀을 바꾸지 않으며, 완료된 객체만 DB 이미지 행으로 확정한다.
 */
export async function uploadProductImages(productId: string, files: File[]): Promise<string> {
  validateFiles(files);
  // Decoding twenty 20MB images at once can exhaust a mobile browser's memory.
  const dimensions: ImageDimensions[] = [];
  for (const file of files) dimensions.push(await dimensionsOf(file));
  const prepareResponse = await fetch(`/api/products/${productId}/images`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      files: files.map((file, index) => ({
        name: file.name,
        mimeType: file.type,
        byteSize: file.size,
        width: dimensions[index]?.width || undefined,
        height: dimensions[index]?.height || undefined,
      })),
    }),
  });
  const preparedPayload = await readApiResponse(prepareResponse);
  if (!prepareResponse.ok) throw apiError(prepareResponse, preparedPayload);
  const uploads = preparedPayload.uploads ?? [];
  if (uploads.length !== files.length) throw new Error('서버가 이미지 업로드 위치를 모두 만들지 못했습니다.');

  const storage = createBrowserSupabaseClient().storage.from(IMAGE_BUCKET);
  try {
    // A small concurrency window keeps mobile uploads reliable without making a
    // long PDP wait for every image serially.
    for (let start = 0; start < uploads.length; start += 3) {
      await Promise.all(uploads.slice(start, start + 3).map(async (upload, offset) => {
        const file = files[start + offset];
        if (!file) throw new Error('업로드할 파일 순서가 맞지 않습니다.');
        const { error } = await storage.uploadToSignedUrl(upload.path, upload.token, file, {
          contentType: file.type,
          cacheControl: '31536000',
          upsert: false,
        });
        if (error) throw new Error(`"${file.name}" 업로드 실패: ${error.message}`);
      }));
    }

    const completeResponse = await fetch(`/api/products/${productId}/images`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uploads: uploads.map(({ token: _token, ...upload }) => upload) }),
    });
    const completed = await readApiResponse(completeResponse);
    if (!completeResponse.ok) throw apiError(completeResponse, completed);
    return completed.message ?? `사진 ${uploads.length}장을 추가했습니다.`;
  } catch (error) {
    await fetch(`/api/products/${productId}/images`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths: uploads.map((upload) => upload.path) }),
    }).catch(() => undefined);
    throw error;
  }
}
