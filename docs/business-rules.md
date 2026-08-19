# Business Rules

1. 유효한 Referral Code가 있어야 최초 가입을 진행할 수 있습니다.
2. 최초 `referral_relationships`는 한 회원당 하나만 저장합니다. 재귀적인 추천인 변경은 과거 주문에 영향을 주면 안 됩니다.
3. Referral Code는 attribution, Promotion Code는 가격조건만 담당합니다.
4. Commission은 구매자의 direct referrer를 L1, 그 상위 referrer를 L2로 계산하고 L3 이상은 만들지 않습니다.
5. Commission rate와 commissionable amount는 주문 생성 시 snapshot합니다.
6. Commission lifecycle은 `pending → approved → payable → paid`이며 취소/환불 시 `cancelled` 또는 `reversed`입니다.
7. 실제 PG, 공급가, 배송비, 광고비, 사업이익 배분은 판매 개시 전에 별도 확정합니다.
8. 자동 출금, 포인트, 다중 판매자 정산, 모집 자체 보상은 MVP 범위에서 제외합니다.
