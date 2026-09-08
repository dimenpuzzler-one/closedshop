'use client';

import { useState, useTransition } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import Script from 'next/script';
import { APP_NAME_KO } from '@closed-commerce/config';
import type { PayDataKrSdkCheckoutParams } from '@closed-commerce/payment';
import { Price } from '@closed-commerce/ui';
import {
  saveShippingAddress,
  setDefaultShippingAddress,
} from '@/app/account/addresses/actions';
import { AddressSearchFields } from '@/components/address-search';
import {
  EMPTY_ADDRESS_FIELDS,
  fieldsFromSavedAddress,
  type AddressFieldsValue,
  type SavedShippingAddress,
} from '@/lib/shipping-addresses';
import { useCartQuote } from './use-cart-quote';

type OrderResult = {
  message?: string;
  orderNumber?: string;
  error?: string;
  requestId?: string;
  status?: 'paid' | 'cancelled' | 'failed' | 'processing' | 'unknown';
  code?: string;
  checkoutParams?: PayDataKrSdkCheckoutParams;
};

type PayDataKrSdk = {
  pay: (config: PayDataKrSdkCheckoutParams & { responseFunction: (data: unknown) => void }) => void;
};

declare global {
  interface Window {
    paynix?: PayDataKrSdk;
  }
}

type CheckoutFormProps = {
  initialAddresses: SavedShippingAddress[];
};

function text(form: FormData, key: string): string {
  // FormData.get()의 File을 String()으로 바꾸면 "[object File]"이 된다.
  const value = form.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

async function readResponse(response: Response): Promise<OrderResult> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      return (await response.json()) as OrderResult;
    } catch {
      return {
        error: `주문 응답을 해석하지 못했습니다. (HTTP ${response.status})`,
      };
    }
  }
  const bodyText = await response.text().catch(() => '');
  return {
    error:
      `서버가 예상과 다른 응답을 보냈습니다. (HTTP ${response.status}) ${bodyText.slice(0, 160)}`.trim(),
  };
}

async function postPayDataKrResult(raw: unknown): Promise<{ response: Response; result: OrderResult }> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch('/api/payments/paydatakr/return?mode=json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(raw),
    });
    const result = await readResponse(response);
    // webhook이 먼저 payments 행을 선점한 짧은 구간에는 한 번 더 결과를 확인한다.
    if (response.status !== 409 || attempt === 2) return { response, result };
    await new Promise((resolve) => window.setTimeout(resolve, 800));
  }
  throw new Error('결제 결과를 처리하지 못했습니다.');
}

export function CheckoutForm({ initialAddresses }: CheckoutFormProps) {
  const { quote, state } = useCartQuote();
  const [isRememberingAddress, startRememberingAddress] = useTransition();
  const defaultAddress = initialAddresses.find((address) => address.isDefault);
  const [selectedAddressId, setSelectedAddressId] = useState(
    defaultAddress?.id ?? 'new',
  );
  const [recipientName, setRecipientName] = useState(
    defaultAddress?.recipientName ?? '',
  );
  const [phone, setPhone] = useState(defaultAddress?.phone ?? '');
  const [senderName, setSenderName] = useState(APP_NAME_KO);
  const [senderPhone, setSenderPhone] = useState('');
  const [addressFields, setAddressFields] = useState<AddressFieldsValue>(
    defaultAddress
      ? fieldsFromSavedAddress(defaultAddress)
      : { ...EMPTY_ADDRESS_FIELDS },
  );
  const [deliveryMessage, setDeliveryMessage] = useState(
    defaultAddress?.deliveryMessage ?? '',
  );
  const [saveToBook, setSaveToBook] = useState(false);
  const [saveLabel, setSaveLabel] = useState('우리집');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle');
  const [message, setMessage] = useState('');

  function chooseSavedAddress(address: SavedShippingAddress) {
    setSelectedAddressId(address.id);
    setRecipientName(address.recipientName);
    setPhone(address.phone);
    setAddressFields(fieldsFromSavedAddress(address));
    setDeliveryMessage(address.deliveryMessage);
    setSaveToBook(false);
    setMessage('');
    startRememberingAddress(() => {
      void setDefaultShippingAddress(address.id).then((result) => {
        if (!result.ok) setMessage(result.error);
      });
    });
  }

  function startNewAddress() {
    setSelectedAddressId('new');
    setRecipientName('');
    setPhone('');
    setAddressFields({ ...EMPTY_ADDRESS_FIELDS });
    setDeliveryMessage('');
    setSaveToBook(false);
  }

  function updateAddressFields(value: AddressFieldsValue) {
    setSelectedAddressId('new');
    setAddressFields(value);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!window.paynix) {
      setStatus('error');
      setMessage('결제 모듈을 불러오는 중입니다. 잠시 후 다시 시도해 주세요.');
      return;
    }
    const form = new FormData(event.currentTarget);
    setStatus('submitting');
    setMessage('');

    try {
      if (selectedAddressId === 'new' && saveToBook) {
        const saved = await saveShippingAddress({
          label: saveLabel,
          recipientName,
          phone,
          ...addressFields,
          deliveryMessage,
          isDefault: true,
        });
        if (!saved.ok) {
          setStatus('error');
          setMessage(saved.error);
          return;
        }
        setSaveToBook(false);
      }

      if (selectedAddressId !== 'new') {
        const remembered = await setDefaultShippingAddress(selectedAddressId);
        if (!remembered.ok) {
          setStatus('error');
          setMessage(remembered.error);
          return;
        }
      }

      // 추천 코드와 구매자 id는 브라우저 값을 믿지 않는다. 서버가 세션과
      // 가입 시 고정된 referral_relationships에서 직접 결정한다.
      const body = {
        promotionCode: text(form, 'promotionCode') || undefined,
        items: (quote?.lines ?? []).map((line) => ({
          productId: line.productId,
          optionId: line.optionId,
          quantity: line.quantity,
        })),
        address: {
          recipientName: recipientName.trim(),
          phone: phone.trim(),
          senderName: senderName.trim() || undefined,
          senderPhone: senderPhone.trim() || undefined,
          postalCode: addressFields.postalCode.trim(),
          addressLine1: addressFields.addressLine1.trim(),
          addressLine2: addressFields.addressLine2.trim() || undefined,
          deliveryMessage: deliveryMessage.trim() || undefined,
        },
      };

      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await readResponse(response);

      if (!response.ok) {
        setStatus('error');
        setMessage(
          `${result.error ?? '주문을 처리하지 못했습니다.'}${result.requestId ? ` (오류번호 ${result.requestId})` : ''}`,
        );
        return;
      }
      if (!result.checkoutParams) {
        setStatus('error');
        setMessage(
          `결제창을 열 준비를 하지 못했습니다.${result.requestId ? ` (오류번호 ${result.requestId})` : ''}`,
        );
        return;
      }

      const params = result.checkoutParams;
      setMessage('결제창을 여는 중입니다…');
      const sdk = window.paynix;
      if (!sdk) throw new Error('결제 모듈을 불러오지 못했습니다.');

      const handlePaymentResult = async (paymentResult: unknown) => {
        try {
          setMessage('결제 결과를 확인하는 중입니다…');
          const callback = await postPayDataKrResult(paymentResult);
          const nextStatus = callback.result.status === 'paid'
            ? 'paid'
            : callback.result.status === 'cancelled'
              ? 'cancelled'
              : callback.result.status === 'unknown'
                ? 'unknown'
                : 'failed';
          const target = new URL('/checkout/result', window.location.origin);
          target.searchParams.set('status', nextStatus);
          if (callback.result.orderNumber) target.searchParams.set('orderNumber', callback.result.orderNumber);
          if (callback.result.message) target.searchParams.set('message', callback.result.message);
          if (callback.result.code) target.searchParams.set('code', callback.result.code);
          if (callback.result.requestId) target.searchParams.set('requestId', callback.result.requestId);
          window.location.assign(target.toString());
        } catch (caught) {
          setStatus('error');
          setMessage(`결제 결과를 처리하지 못했습니다: ${caught instanceof Error ? caught.message : String(caught)}`);
        }
      };

      sdk.pay({
        ...params,
        responseFunction: (paymentResult) => {
          void handlePaymentResult(paymentResult);
        },
      });
    } catch (caught) {
      setStatus('error');
      setMessage(
        `주문을 보내지 못했습니다: ${caught instanceof Error ? caught.message : String(caught)}`,
      );
    }
  }

  if (state === 'loading')
    return (
      <div className="card empty">
        <p className="muted">주문 정보를 불러오는 중입니다.</p>
      </div>
    );
  if (quote && !quote.authenticated) {
    return (
      <div className="card empty">
        <h3>로그인이 필요합니다.</h3>
        <Link href="/login" className="button button-primary">
          로그인
        </Link>
      </div>
    );
  }
  if (!quote || quote.lines.length === 0) {
    return (
      <div className="card empty">
        <h3>주문할 상품이 없습니다.</h3>
        <Link href="/products" className="button button-primary">
          상품 담으러 가기
        </Link>
      </div>
    );
  }

  return (
    <>
      <Script
        src="https://api.paydatakr.com/js/clientside-1.1.0.js"
        strategy="afterInteractive"
        onError={() => setMessage('결제 모듈을 불러오지 못했습니다. 잠시 후 새로고침해 주세요.')}
      />
      <form className="two-column" onSubmit={submit} autoComplete="off">
      <div className="card stack">
        <div className="row checkout-shipping-heading">
          <div>
            <p className="eyebrow">SHIPPING</p>
            <h2>배송지 입력</h2>
          </div>
          <Link href="/account/addresses" className="button button-ghost">
            배송지 관리
          </Link>
        </div>

        {initialAddresses.length ? (
          <div className="checkout-address-list" aria-label="저장된 배송지">
            <div className="checkout-address-list-heading">
              <strong>배송지 선택</strong>
              <span className="field-hint">
                지난번에 선택한 배송지가 기본으로 표시됩니다.
              </span>
            </div>
            {initialAddresses.map((address) => (
              <label
                className={`checkout-address-option${selectedAddressId === address.id ? ' selected' : ''}`}
                key={address.id}
              >
                <input
                  type="radio"
                  name="savedAddress"
                  checked={selectedAddressId === address.id}
                  onChange={() => chooseSavedAddress(address)}
                />
                <span>
                  <strong>
                    {address.label}
                    {address.isDefault ? ' · 기본' : ''}
                  </strong>
                  <small>
                    {address.recipientName} · {address.addressLine1}{' '}
                    {address.addressLine2}
                  </small>
                </span>
              </label>
            ))}
            <button
              className="button button-secondary"
              type="button"
              onClick={startNewAddress}
            >
              새 배송지 입력
            </button>
            {isRememberingAddress ? (
              <p className="field-hint" role="status">
                선택한 배송지를 기본 배송지로 저장하는 중입니다.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="notice">
            저장된 배송지가 없습니다. 아래에서 새 배송지를 입력하고 주소록 저장
            여부를 먼저 선택해 주세요.
          </div>
        )}

        {selectedAddressId === 'new' ? (
          <div className="full save-address-option">
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={saveToBook}
                onChange={(event) => setSaveToBook(event.currentTarget.checked)}
              />
              <span>이 배송지를 배송지 관리에 저장</span>
            </label>
            {saveToBook ? (
              <label className="field">
                <span className="field-label">배송지명</span>
                <input
                  className="input"
                  value={saveLabel}
                  onChange={(event) => setSaveLabel(event.currentTarget.value)}
                  maxLength={40}
                  required
                />
              </label>
            ) : null}
          </div>
        ) : null}

        <div className="form-grid">
          <label className="field">
            <span className="field-label">받는 분</span>
            <input
              className="input"
              name="recipientName"
              value={recipientName}
              onChange={(event) => {
                setSelectedAddressId('new');
                setRecipientName(event.currentTarget.value);
              }}
              maxLength={80}
              required
            />
          </label>
          <label className="field">
            <span className="field-label">연락처 (받는 분)</span>
            <input
              className="input"
              name="phone"
              value={phone}
              onChange={(event) => {
                setSelectedAddressId('new');
                setPhone(event.currentTarget.value);
              }}
              inputMode="tel"
              maxLength={30}
              required
            />
          </label>
          <div className="full gift-sender-section">
            <div className="row">
              <span className="field-label">보내는 사람</span>
              <span className="field-hint">기본값 {APP_NAME_KO} · 수정 가능</span>
            </div>
            <div className="form-grid gift-sender-grid">
              <label className="field">
                <span className="field-label">보내는 사람 이름</span>
                <input
                  className="input"
                  value={senderName}
                  onChange={(event) => setSenderName(event.currentTarget.value)}
                  maxLength={80}
                  required
                />
              </label>
              <label className="field">
                <span className="field-label">보내는 사람 연락처 <span className="field-hint">(선택)</span></span>
                <input
                  className="input"
                  value={senderPhone}
                  onChange={(event) => setSenderPhone(event.currentTarget.value)}
                  inputMode="tel"
                  maxLength={30}
                />
              </label>
            </div>
          </div>
          <label className="field">
            <span className="field-label">Promotion Code</span>
            <input
              className="input"
              name="promotionCode"
              placeholder="선택 입력"
            />
          </label>
          <AddressSearchFields
            value={addressFields}
            onChange={updateAddressFields}
          />
          <label className="field full">
            <span className="field-label">배송 요청사항</span>
            <select
              className="select"
              name="deliveryMessage"
              value={deliveryMessage}
              onChange={(event) =>
                setDeliveryMessage(event.currentTarget.value)
              }
            >
              <option value="">선택 안 함</option>
              <option value="문 앞에 놓아 주세요">문 앞에 놓아 주세요</option>
              <option value="직접 받겠습니다 (부재 시 문 앞)">
                직접 받겠습니다 (부재 시 문 앞)
              </option>
              <option value="경비실에 맡겨 주세요">경비실에 맡겨 주세요</option>
              <option value="택배함에 넣어 주세요">택배함에 넣어 주세요</option>
            </select>
          </label>
        </div>
        <div className="notice">
          주문이 접수되면 현재 배송지를 주문에 별도로 보존합니다. 나중에
          주소록을 바꾸거나 지워도 이미 접수된 주문은 바뀌지 않습니다.
        </div>
        <div className="form-actions">
          <button
            className="button button-primary button-large"
            disabled={status === 'submitting'}
          >
            {status === 'submitting' ? '결제창 준비 중…' : '결제하기'}
          </button>
        </div>
        {message ? (
          <p
            className={`form-message${status === 'error' ? ' form-error' : ''}`}
            role="status"
            style={{ whiteSpace: 'pre-wrap' }}
          >
            {message}
          </p>
        ) : null}
      </div>
      <aside className="card stack">
        <h3>주문 상품</h3>
        {quote.lines.map((line) => (
          <div
            className="row"
            key={`${line.productId}-${line.optionId ?? 'default'}`}
          >
            <span>
              {line.productName} × {line.quantity}
              <small className="muted" style={{ display: 'block' }}>
                {line.shippingFee === 0
                  ? '무료배송'
                  : `${line.shippingBundleQuantity ?? quote.shippingPolicy.cartonQuantity}개까지 ${line.shippingFee.toLocaleString('ko-KR')}원`}
              </small>
            </span>
            <Price amount={line.unitPrice * line.quantity} />
          </div>
        ))}
        <hr className="divider" />
        <div className="row">
          <span className="muted">상품 합계</span>
          <Price amount={quote.totals.grossAmount} />
        </div>
        <div className="row">
          <span className="muted">배송비</span>
          <Price amount={quote.totals.shippingAmount} />
        </div>
        <p className="muted" style={{ fontSize: '0.82rem', margin: 0 }}>
          배송비는 상품별 묶음 가능 수량과 묶음당 배송비를 기준으로 계산됩니다.
        </p>
        <div className="row total-line">
          <strong>결제 예정</strong>
          <strong>
            <Price amount={quote.totals.paidAmount} />
          </strong>
        </div>
      </aside>
      </form>
    </>
  );
}
