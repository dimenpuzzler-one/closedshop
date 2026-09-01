'use client';

import { useState, useTransition } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AddressSearchFields } from '@/components/address-search';
import {
  deleteShippingAddress,
  saveShippingAddress,
  setDefaultShippingAddress,
} from '@/app/account/addresses/actions';
import {
  EMPTY_ADDRESS_FIELDS,
  type AddressFieldsValue,
  type SavedShippingAddress,
} from '@/lib/shipping-addresses';

type SavedAddressManagerProps = {
  addresses: SavedShippingAddress[];
};

const DELIVERY_OPTIONS = [
  '문 앞에 놓아 주세요',
  '직접 받겠습니다 (부재 시 문 앞)',
  '경비실에 맡겨 주세요',
  '택배함에 넣어 주세요',
];

function formText(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

export function SavedAddressManager({ addresses }: SavedAddressManagerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(addresses.length === 0);
  const [fields, setFields] = useState<AddressFieldsValue>({
    ...EMPTY_ADDRESS_FIELDS,
  });
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  function resetForm() {
    setFields({ ...EMPTY_ADDRESS_FIELDS });
    setShowForm(false);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setMessage('');
    setIsError(false);
    startTransition(async () => {
      const result = await saveShippingAddress({
        label: formText(form, 'label'),
        recipientName: formText(form, 'recipientName'),
        phone: formText(form, 'phone'),
        ...fields,
        deliveryMessage: formText(form, 'deliveryMessage'),
        isDefault: form.get('isDefault') === 'on',
      });
      if (!result.ok) {
        setIsError(true);
        setMessage(result.error);
        return;
      }
      setMessage('배송지를 저장했습니다.');
      resetForm();
      router.refresh();
    });
  }

  function makeDefault(id: string) {
    setMessage('');
    startTransition(async () => {
      const result = await setDefaultShippingAddress(id);
      setIsError(!result.ok);
      setMessage(result.ok ? '기본 배송지를 변경했습니다.' : result.error);
      if (result.ok) router.refresh();
    });
  }

  function remove(id: string) {
    if (
      !window.confirm(
        '이 배송지를 삭제할까요? 이미 접수된 주문의 배송지는 바뀌지 않습니다.',
      )
    )
      return;
    setMessage('');
    startTransition(async () => {
      const result = await deleteShippingAddress(id);
      setIsError(!result.ok);
      setMessage(result.ok ? '배송지를 삭제했습니다.' : result.error);
      if (result.ok) router.refresh();
    });
  }

  return (
    <div className="address-manager stack">
      <div className="address-book-grid">
        {addresses.map((address) => (
          <article className="card address-card" key={address.id}>
            <div className="row address-card-heading">
              <div className="row address-card-label">
                <h3>{address.label}</h3>
                {address.isDefault ? (
                  <span className="badge badge-success">기본</span>
                ) : null}
              </div>
              <div className="row address-card-actions">
                {!address.isDefault ? (
                  <button
                    className="button button-ghost"
                    type="button"
                    disabled={isPending}
                    onClick={() => makeDefault(address.id)}
                  >
                    기본으로
                  </button>
                ) : null}
                <button
                  className="button button-danger"
                  type="button"
                  disabled={isPending}
                  onClick={() => remove(address.id)}
                >
                  삭제
                </button>
              </div>
            </div>
            <p>
              <strong>{address.recipientName}</strong>{' '}
              <span className="muted">{address.phone}</span>
            </p>
            <p className="address-card-copy">
              [{address.postalCode}] {address.addressLine1}
              <br />
              {address.addressLine2}
            </p>
            {address.deliveryMessage ? (
              <p className="field-hint">요청: {address.deliveryMessage}</p>
            ) : null}
          </article>
        ))}
      </div>

      {!showForm ? (
        <button
          className="button button-primary address-add-button"
          type="button"
          onClick={() => {
            setShowForm(true);
            setMessage('');
          }}
        >
          + 배송지 추가
        </button>
      ) : (
        <form className="card stack" onSubmit={submit}>
          <div className="row">
            <div>
              <p className="eyebrow">NEW ADDRESS</p>
              <h2>배송지 추가</h2>
            </div>
            {addresses.length ? (
              <button
                className="button button-ghost"
                type="button"
                onClick={resetForm}
              >
                취소
              </button>
            ) : null}
          </div>
          <div className="form-grid">
            <label className="field">
              <span className="field-label">배송지명</span>
              <input
                className="input"
                name="label"
                placeholder="우리집, 회사"
                maxLength={40}
                required
              />
            </label>
            <label className="field">
              <span className="field-label">받는 분</span>
              <input
                className="input"
                name="recipientName"
                maxLength={80}
                required
              />
            </label>
            <label className="field">
              <span className="field-label">연락처</span>
              <input
                className="input"
                name="phone"
                inputMode="tel"
                maxLength={30}
                placeholder="010-0000-0000"
                required
              />
            </label>
            <AddressSearchFields value={fields} onChange={setFields} />
            <label className="field full">
              <span className="field-label">배송 요청사항</span>
              <select className="select" name="deliveryMessage" defaultValue="">
                <option value="">선택 안 함</option>
                {DELIVERY_OPTIONS.map((option) => (
                  <option value={option} key={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="checkbox-field full">
              <input
                type="checkbox"
                name="isDefault"
                defaultChecked={addresses.length === 0}
              />
              <span>기본 배송지로 설정</span>
            </label>
          </div>
          <div className="form-actions">
            <button className="button button-primary" disabled={isPending}>
              {isPending ? '저장 중…' : '배송지 저장'}
            </button>
          </div>
        </form>
      )}
      {message ? (
        <p
          className={`form-message${isError ? ' form-error' : ''}`}
          role="status"
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
