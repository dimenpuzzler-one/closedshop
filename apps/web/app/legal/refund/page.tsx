import type { Metadata } from 'next';
import { COMPANY, APP_NAME_KO } from '@closed-commerce/config';
import { LegalLayout, NeedsReview } from '@/components/legal-layout';
import { loadStoreSettings } from '@/lib/store-settings';

export const metadata: Metadata = {
  title: `환불·교환 안내 | ${APP_NAME_KO}`,
  description: '딜키 환불 및 교환 안내',
};

// 배송비 규칙을 운영 설정에서 읽으므로 빌드 시점에 고정되면 안 된다.
export const dynamic = 'force-dynamic';

export default async function RefundPage() {
  const settings = await loadStoreSettings();
  const { shippingPolicy } = settings;

  return (
    <LegalLayout title="환불·교환 안내" effectiveDate={COMPANY.termsEffectiveDate} current="/legal/refund">
      <p>
        아래 내용은 <a href="/legal/terms">이용약관</a> 제15조 및 제16조를 이용자가 알기 쉽게 정리한 것입니다.
        약관과 이 안내의 내용이 다를 경우 이용자에게 유리한 쪽을 따릅니다.
      </p>

      <h2>1. 청약철회(주문 취소) 기간</h2>
      <ul>
        <li><strong>배송 전</strong> — 언제든지 취소하실 수 있습니다. 결제 금액은 전액 환불됩니다.</li>
        <li><strong>배송 후</strong> — 상품을 받으신 날부터 <strong>7일 이내</strong>에 청약철회를 요청하실 수 있습니다.</li>
        <li>
          상품에 하자가 있거나 표시·광고 내용과 다른 경우에는 상품을 받으신 날부터 <strong>3개월 이내</strong>,
          그 사실을 아신 날부터 <strong>30일 이내</strong>에 요청하실 수 있습니다.
        </li>
      </ul>

      <h2>2. 환불·교환이 제한되는 경우</h2>
      <p>다음의 경우에는 청약철회가 제한될 수 있습니다.</p>
      <ul>
        <li>고객님의 책임으로 상품이 훼손되거나 없어진 경우 (내용 확인을 위한 포장 개봉은 제외)</li>
        <li>사용하거나 일부 드셔서 상품의 가치가 크게 줄어든 경우</li>
        <li>시간이 지나 다시 판매하기 어려울 정도로 가치가 떨어진 경우</li>
      </ul>
      <p>
        <strong>딜키에서 판매하는 식품은 위생과 신선도 관리가 필요한 상품입니다.</strong>{' '}
        포장을 개봉하신 경우 또는 냉장·냉동 보관이 필요한 상품의 경우에는 단순 변심에 의한 환불이 제한될 수 있습니다.
        해당 상품은 상품 상세 화면에 제한 사실을 표시합니다.
      </p>
      <p>
        <NeedsReview>
          이 제한이 실제로 성립하려면 상품별로 청약철회 제한 사유를 상세 화면에 개별 표시해야 합니다.
          현재 상품 등록 화면에는 해당 표시 항목이 없습니다. 법률 검토와 함께 항목 추가가 필요합니다.
        </NeedsReview>
      </p>

      <h2>3. 반품 배송비</h2>
      <table className="legal-table">
        <thead>
          <tr><th>사유</th><th>부담 주체</th></tr>
        </thead>
        <tbody>
          <tr><td>단순 변심 (색상·구성 변경, 필요 없어짐 등)</td><td>고객님 부담</td></tr>
          <tr><td>상품 하자, 오배송, 파손</td><td>회사 부담</td></tr>
          <tr><td>표시·광고와 다른 상품</td><td>회사 부담</td></tr>
        </tbody>
      </table>
      <p>
        현재 배송비는 주문 전체 수량을 기준으로 묶음(카툰) 단위로 산정됩니다 —
        <strong>
          {' '}{shippingPolicy.cartonQuantity}개까지 {shippingPolicy.feePerCarton.toLocaleString('ko-KR')}원,
          초과 시 {shippingPolicy.cartonQuantity}개 단위로 추가
        </strong>
        {shippingPolicy.freeShippingThreshold !== undefined
          ? ` (${shippingPolicy.freeShippingThreshold.toLocaleString('ko-KR')}원 이상 구매 시 무료배송)`
          : ''}
        됩니다. 단순 변심으로 반품하시는 경우 왕복 배송비가 발생할 수 있습니다.
      </p>

      <h2>4. 환불 처리 기간</h2>
      <ul>
        <li>상품을 회수한 날부터 <strong>3영업일 이내</strong>에 환불해 드립니다.</li>
        <li>신용카드로 결제하신 경우 카드사에 결제 취소를 요청하며, 카드사 사정에 따라 실제 취소까지 며칠이 더 걸릴 수 있습니다.</li>
        <li>환불이 지연되는 경우 관련 법령이 정한 지연이자를 지급합니다.</li>
      </ul>

      <h2>5. 교환 절차</h2>
      <ol>
        <li>고객센터({COMPANY.phone})나 전자우편({COMPANY.email})으로 주문번호와 함께 교환 사유를 알려주세요.</li>
        <li>회사가 회수 방법을 안내해 드립니다. 임의로 발송하시면 확인이 어려울 수 있습니다.</li>
        <li>상품 회수 및 확인 후 교환품을 발송해 드립니다. 재고가 없는 경우에는 환불로 처리됩니다.</li>
      </ol>

      <h2>6. 추천 보상에 미치는 영향</h2>
      <p>
        환불 또는 부분 환불이 이루어진 주문에 대해서는 해당 주문으로 산정된 추천 보상이 취소되거나 환불 금액에 비례하여 조정됩니다.
        이미 지급된 보상이 있는 경우 회사는 이를 회수하거나 이후 지급될 보상에서 차감할 수 있습니다.
      </p>
      <p>
        <NeedsReview>
          부분 환불 시 추천 보상을 비례 차감할지, 전액 취소할지 아직 확정되지 않았습니다.
          정산 분쟁을 막으려면 출시 전에 정해야 합니다.
        </NeedsReview>
      </p>

      <h2>7. 문의</h2>
      <ul className="legal-facts">
        <li>고객센터: {COMPANY.phone}</li>
        <li>전자우편: {COMPANY.email}</li>
        <li>주소: {COMPANY.address}</li>
      </ul>
    </LegalLayout>
  );
}
