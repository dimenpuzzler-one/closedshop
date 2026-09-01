'use client';

import { useRef, useState } from 'react';
import type {
  AddressFieldsValue,
  JusoSearchAddress,
} from '@/lib/shipping-addresses';

type AddressSearchResponse = {
  addresses?: JusoSearchAddress[];
  error?: string;
};

type AddressSearchFieldsProps = {
  value: AddressFieldsValue;
  onChange: (value: AddressFieldsValue) => void;
};

export function AddressSearchFields({
  value,
  onChange,
}: AddressSearchFieldsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<JusoSearchAddress[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const detailRef = useRef<HTMLInputElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  function update(patch: Partial<AddressFieldsValue>) {
    onChange({ ...value, ...patch });
  }

  function openSearch() {
    setIsOpen(true);
    setMessage('');
    window.setTimeout(() => searchRef.current?.focus(), 0);
  }

  async function search() {
    const keyword = query.trim();
    if (keyword.length < 2) {
      setStatus('error');
      setMessage('도로명, 건물명, 지번을 2자 이상 입력해 주세요.');
      return;
    }
    setStatus('loading');
    setMessage('');
    try {
      const response = await fetch(
        `/api/address/search?q=${encodeURIComponent(keyword)}`,
      );
      const payload = (await response.json()) as AddressSearchResponse;
      if (!response.ok)
        throw new Error(payload.error ?? '주소를 검색하지 못했습니다.');
      const addresses = payload.addresses ?? [];
      setResults(addresses);
      setStatus('idle');
      setMessage(
        addresses.length
          ? ''
          : '검색 결과가 없습니다. 도로명과 건물번호를 확인해 보세요.',
      );
    } catch (caught) {
      setResults([]);
      setStatus('error');
      setMessage(
        caught instanceof Error
          ? caught.message
          : '주소를 검색하지 못했습니다.',
      );
    }
  }

  function choose(address: JusoSearchAddress) {
    onChange({
      postalCode: address.postalCode,
      addressLine1: address.roadAddress,
      addressLine2: '',
      jibunAddress: address.jibunAddress,
      buildingName: address.buildingName,
      sido: address.sido,
      sigungu: address.sigungu,
      eupmyeondong: address.eupmyeondong,
      admCd: address.admCd,
      roadNameCode: address.roadNameCode,
      buildingManagementNo: address.buildingManagementNo,
    });
    setIsOpen(false);
    window.setTimeout(() => detailRef.current?.focus(), 0);
  }

  return (
    <>
      <label className="field" htmlFor="postalCode">
        <span className="field-label">우편번호</span>
        <div className="row address-postal-row">
          <input
            id="postalCode"
            className="input"
            name="postalCode"
            value={value.postalCode}
            onChange={(event) =>
              update({
                postalCode: event.currentTarget.value
                  .replace(/\D/g, '')
                  .slice(0, 5),
              })
            }
            placeholder="5자리 우편번호"
            inputMode="numeric"
            pattern="[0-9]{5}"
            required
          />
          <button
            className="button button-secondary"
            type="button"
            onClick={openSearch}
          >
            주소 찾기
          </button>
        </div>
      </label>

      <label className="field full" htmlFor="addressLine1">
        <span className="field-label">주소</span>
        <input
          id="addressLine1"
          className="input"
          name="addressLine1"
          value={value.addressLine1}
          onChange={(event) =>
            update({ addressLine1: event.currentTarget.value })
          }
          placeholder="도로명 주소"
          required
        />
      </label>

      <label className="field full" htmlFor="addressLine2">
        <span className="field-label">상세주소</span>
        <input
          id="addressLine2"
          className="input"
          name="addressLine2"
          ref={detailRef}
          value={value.addressLine2}
          onChange={(event) =>
            update({ addressLine2: event.currentTarget.value })
          }
          placeholder="동·호수, 층 등"
          required
        />
      </label>

      {isOpen ? (
        <div
          className="address-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsOpen(false);
          }}
        >
          <section
            className="address-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="address-search-title"
          >
            <div className="row">
              <div>
                <p className="eyebrow">ADDRESS SEARCH</p>
                <h2 id="address-search-title">도로명주소 검색</h2>
              </div>
              <button
                className="button button-ghost"
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="주소 검색 닫기"
              >
                닫기
              </button>
            </div>
            <div className="address-search-form" role="search">
              <input
                ref={searchRef}
                className="input"
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void search();
                  }
                }}
                placeholder="예: 반포대로 58, 독립기념관, 삼성동 25"
                maxLength={80}
              />
              <button
                className="button button-primary"
                type="button"
                onClick={() => void search()}
                disabled={status === 'loading'}
              >
                {status === 'loading' ? '검색 중…' : '검색'}
              </button>
            </div>
            {message ? (
              <p
                className={`form-message${status === 'error' ? ' form-error' : ''}`}
                role="status"
              >
                {message}
              </p>
            ) : null}
            <div className="address-results">
              {results.map((address) => (
                <button
                  className="address-result"
                  type="button"
                  key={`${address.buildingManagementNo}-${address.roadAddress}`}
                  onClick={() => choose(address)}
                >
                  <strong>{address.roadAddress}</strong>
                  {address.buildingName ? (
                    <span>{address.buildingName}</span>
                  ) : null}
                  <span className="muted">
                    [{address.postalCode}] {address.jibunAddress}
                  </span>
                </button>
              ))}
            </div>
            <p className="field-hint">
              행정안전부 주소기반산업지원서비스의 도로명주소 검색 결과입니다.
            </p>
          </section>
        </div>
      ) : null}
    </>
  );
}
