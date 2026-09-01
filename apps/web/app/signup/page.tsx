import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Container } from '@closed-commerce/ui';
import { SignupForm } from '@/components/signup-form';

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const params = await searchParams;
  const referralCode = params.ref?.trim().toUpperCase();
  const verifiedCode = (await cookies()).get('referral_signup_verified')?.value;
  if (!referralCode || verifiedCode !== referralCode) redirect('/#member-access');
  return <div className="auth-wrap"><Container><SignupForm referralCode={referralCode} /></Container></div>;
}
