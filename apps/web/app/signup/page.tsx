import { Container } from '@closed-commerce/ui';
import { SignupForm } from '@/components/signup-form';

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const params = await searchParams;
  return <div className="auth-wrap"><Container><SignupForm referralCode={params.ref?.trim().toUpperCase()} /></Container></div>;
}
