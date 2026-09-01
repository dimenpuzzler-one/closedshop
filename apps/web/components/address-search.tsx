'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * 카카오(다음) 우편번호 서비스. 키가 필요 없고 무료다.
 */
const POSTCODE_SCRIPT = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';

type PostcodeResult = {
  /** 도로명 주소. 도로명이 없는 지역이면 빈 문자열이다. */
  roadAddress?: string;
  /** 지번 주소. 도로명 주소가 없을 때 쓴다. */
  jibunAddress?: string;
  /** 사용자가 고른 주소 종류에 맞춰 채워지는 값. */
  address?: string;
  /** 참고 항목(건물명). */
  buildingName?: string;
  zonecode?: string;
  userSelectedType?: 'R' | 'J';
};

type PostcodeConstructor = new (options: {
  oncomplete: (data: PostcodeResult) => void;
  onclose?: () => void;
}) => { open: () => void };

declare global {
  interface Window {
    daum?: { Postcode?: PostcodeConstructor };
  }
}

export function AddressSearchFields() {
  const [postalCode, setPostalCode] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const detailRef = useRef<HTMLInputElement | null>(null);

  /**
   * 스크립트를 화면이 뜰 때 미리 받아둔다.
   *
   * 버튼을 누른 뒤에 받으면 안 된다. 스크립트를 기다리는 사이에 브라우저가 보는
   * "사용자가 방금 클릭했다"는 표시가 풀려서, 정작 열려던 검색창이 팝업 차단에
   * 걸린다. 결제 화면까지 온 고객에게 50KB는 그 위험보다 싸다.
   */
  useEffect(() => {
    if (window.daum?.Postcode) {
      setReady(true);
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${POSTCODE_SCRIPT}"]`);
    const script = existing ?? document.createElement('script');
    const onLoad = () => setReady(Boolean(window.daum?.Postcode));
    const onError = () => setError('주소 검색을 불러오지 못했습니다. 주소를 직접 입력하셔도 됩니다.');
    script.addEventListener('load', onLoad);
    script.addEventListener('error', onError);
    if (!existing) {
      script.src = POSTCODE_SCRIPT;
      script.async = true;
      document.head.appendChild(script);
    }
    return () => {
      script.removeEventListener('load', onLoad);
      script.removeEventListener('error', onError);
    };
  }, []);

  function openSearch() {
    const Postcode = window.daum?.Postcode;
    if (!Postcode) {
      setError('주소 검색을 아직 불러오는 중입니다. 잠시 후 다시 누르거나 주소를 직접 입력해 주세요.');
      return;
    }
    setError('');
    new Postcode({
      oncomplete: (data) => {
        const base = data.userSelectedType === 'J'
          ? (data.jibunAddress ?? data.address ?? '')
          : (data.roadAddress ?? data.address ?? '');
        // 건물명이 있으면 붙여준다. 기사님이 덜 헤맨다.
        const extra = data.buildingName?.trim() ? ` (${data.buildingName.trim()})` : '';
        setPostalCode(data.zonecode ?? '');
        setAddressLine1(`${base}${extra}`.trim());
        // 다음에 채울 칸은 상세주소다. 바로 커서를 옮겨준다.
        window.setTimeout(() => detailRef.current?.focus(), 0);
      },
    }).open();
  }

  return (
    <>
      <label className="field" htmlFor="postalCode">
        <span className="field-label">우편번호</span>
        <div className="row" style={{ gap: '0.5rem', alignItems: 'center' }}>
          {/*
            읽기 전용으로 두면 안 된다. readOnly 입력은 브라우저의 필수값 검사에서
            아예 빠지기 때문에, 빈 채로 결제 버튼을 눌러도 화면에서는 걸리지 않고
            서버 400으로만 튕긴다. 직접 입력도 열어두면 검색이 안 되는 주소도 살길이 있다.
          */}
          <input
            id="postalCode"
            className="input"
            name="postalCode"
            value={postalCode}
            onChange={(event) => setPostalCode(event.currentTarget.value)}
            placeholder="주소 검색을 눌러 주세요"
            inputMode="numeric"
            required
          />
          <button className="button button-secondary" type="button" onClick={openSearch} style={{ whiteSpace: 'nowrap' }}>
            주소 검색
          </button>
        </div>
        {!ready && !error ? <span className="field-hint">주소 검색 준비 중…</span> : null}
      </label>

      <label className="field full" htmlFor="addressLine1">
        <span className="field-label">주소</span>
        <input
          id="addressLine1"
          className="input"
          name="addressLine1"
          value={addressLine1}
          onChange={(event) => setAddressLine1(event.currentTarget.value)}
          placeholder="주소 검색을 눌러 주세요"
          required
        />
      </label>

      <label className="field full" htmlFor="addressLine2">
        <span className="field-label">상세주소</span>
        <input id="addressLine2" className="input" name="addressLine2" ref={detailRef} placeholder="동·호수, 층 등" />
      </label>

      {error ? <p className="form-message form-error field full" role="alert">{error}</p> : null}
    </>
  );
}
