import { redirect } from 'next/navigation';
import { Container } from '@closed-commerce/ui';
import { hasSupabaseEnv } from '@closed-commerce/db';
import { SavedAddressManager } from '@/components/saved-address-manager';
import { loadSavedAddresses } from '@/lib/saved-addresses-server';
import { getRequestUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export default async function AddressesPage() {
  if (hasSupabaseEnv() && !(await getRequestUser())) redirect('/login');
  const addresses = await loadSavedAddresses();
  return (
    <>
      <section className="page-header">
        <Container>
          <p className="breadcrumb">ACCOUNT / ADDRESSES</p>
          <h1>배송지 관리</h1>
          <p className="muted">
            자주 쓰는 배송지를 저장하고 기본 배송지를 지정하세요.
          </p>
        </Container>
      </section>
      <section className="section">
        <Container>
          <SavedAddressManager addresses={addresses} />
        </Container>
      </section>
    </>
  );
}
