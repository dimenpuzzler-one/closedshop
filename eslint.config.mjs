import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import nextPlugin from '@next/eslint-plugin-next';

/**
 * 이 저장소에는 원래 ESLint 설정이 없었다.
 * package.json의 "lint"가 `tsc --noEmit`이었기 때문에, `pnpm check`의
 * "38 successful"은 타입체크를 두 번 돌린 결과였다.
 *
 * 그래서 다음 같은 것들이 전부 통과했다:
 *  - await 뒤에서 event.currentTarget 접근 (React가 null로 만든 뒤)
 *  - 결과를 확인하지 않는 떠 있는 Promise (재고 해제 실패가 조용히 사라짐)
 * 아래 규칙들이 그 부류를 잡는다.
 */
export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/dist/**',
      '**/.turbo/**',
      '**/next-env.d.ts',
      '**/*.tsbuildinfo',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      '@next/next': nextPlugin,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...nextPlugin.configs.recommended.rules,

      // 결과를 버리는 비동기 호출을 막는다. 재고 해제/보상 로직이 실패해도
      // 아무도 모르던 원인이 정확히 이것이었다.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],

      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/require-await': 'warn',

      // Supabase 응답은 제네릭이 깊어 unsafe 계열이 과하게 잡힌다.
      // 지금 단계에서는 소음이 커서 끄고, 위의 실질 규칙에 집중한다.
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    // PaymentProvider 인터페이스가 Promise 반환을 요구하므로 mock 구현의 async는 의도된 것이다.
    files: ['packages/payment/src/**'],
    rules: { '@typescript-eslint/require-await': 'off' },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx'],
    rules: { '@typescript-eslint/no-floating-promises': 'off' },
  },
);
