import { Container } from '@closed-commerce/ui';
import { LoginForm } from '@/components/login-form';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  // 외부 사이트로 튕겨나가지 않도록 내부 경로만 허용한다.
  const redirectTo = next && next.startsWith('/') && !next.startsWith('//') ? next : '/products';
  return <div className="auth-wrap"><Container><LoginForm redirectTo={redirectTo} /></Container></div>;
}
