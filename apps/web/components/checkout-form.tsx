'use client';

import { useState, useTransition } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { APP_NAME_KO } from '@closed-commerce/config';
import { Price } from '@closed-commerce/ui';
import KorpaySdk, { type PaymentData } from '@korpay/sdk';
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
  checkoutParams?: Omit<PaymentData, 'amount'> & { amount: string };
  checkoutBaseUrl?: string;
};

type CheckoutFormProps = {
  initialAddresses: SavedShippingAddress[];
};

/**
 * 결제창 주소는 서버(/api/orders)가 내려준다. 반드시 스킴을 포함해야 하며,
 * 없으면 SDK의 form POST가 우리 사이트 상대경로로 향해 20초 뒤 실패한다.
 */
const KORPAY_BASE_URL_FALLBACK = 'https://payments.korpay.com/v1';

function normalizeBaseUrl(value: string | undefined): string {
  const raw = (value ?? '').trim().replace(/\/$/, '');
  if (!raw) return KORPAY_BASE_URL_FALLBACK;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    new URL(withScheme);
    return withScheme;
  } catch {
    return KORPAY_BASE_URL_FALLBACK;
  }
}

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
      KorpaySdk.payment(
        normalizeBaseUrl(result.checkoutBaseUrl),
        // amount만 숫자로 바꾼다. 해시는 서버에서 만든 문자열 값 기준이다.
        { ...params, amount: Number(params.amount) },
        {
          onError: (error) => {
            setStatus('error');
            setMessage(`결제창에서 오류가 발생했습니다: ${error}`);
          },
          onClose: () => {
            // 성공 시에는 returnUrl로 이동한다. 이 화면이 남았다면 고객이 닫은 것이다.
            setStatus('idle');
            setMessage(
              '결제를 완료하지 않으셨습니다. 다시 시도하시려면 결제하기를 눌러 주세요.',
            );
          },
        },
      );
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
          {quote.shippingPolicy.cartonQuantity}개까지{' '}
          {quote.shippingPolicy.feePerCarton.toLocaleString('ko-KR')}원, 초과 시{' '}
          {quote.shippingPolicy.cartonQuantity}개 단위로 추가됩니다.
          {quote.shippingPolicy.freeShippingThreshold !== undefined
            ? ` ${quote.shippingPolicy.freeShippingThreshold.toLocaleString('ko-KR')}원 이상 구매 시 무료배송입니다.`
            : ''}
        </p>
        <div className="row total-line">
          <strong>결제 예정</strong>
          <strong>
            <Price amount={quote.totals.paidAmount} />
          </strong>
        </div>
      </aside>
    </form>
  );
}
