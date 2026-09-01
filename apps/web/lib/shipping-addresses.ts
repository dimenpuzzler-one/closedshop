export type AddressFieldsValue = {
  postalCode: string;
  addressLine1: string;
  addressLine2: string;
  jibunAddress: string;
  buildingName: string;
  sido: string;
  sigungu: string;
  eupmyeondong: string;
  admCd: string;
  roadNameCode: string;
  buildingManagementNo: string;
};

export type SavedShippingAddress = AddressFieldsValue & {
  id: string;
  label: string;
  recipientName: string;
  phone: string;
  deliveryMessage: string;
  isDefault: boolean;
};

export type JusoSearchAddress = Omit<
  AddressFieldsValue,
  'addressLine1' | 'addressLine2'
> & {
  roadAddress: string;
  roadAddressPart1: string;
  roadAddressPart2: string;
};

export const EMPTY_ADDRESS_FIELDS: AddressFieldsValue = {
  postalCode: '',
  addressLine1: '',
  addressLine2: '',
  jibunAddress: '',
  buildingName: '',
  sido: '',
  sigungu: '',
  eupmyeondong: '',
  admCd: '',
  roadNameCode: '',
  buildingManagementNo: '',
};

export function fieldsFromSavedAddress(
  address: SavedShippingAddress,
): AddressFieldsValue {
  const {
    postalCode,
    addressLine1,
    addressLine2,
    jibunAddress,
    buildingName,
    sido,
    sigungu,
    eupmyeondong,
    admCd,
    roadNameCode,
    buildingManagementNo,
  } = address;
  return {
    postalCode,
    addressLine1,
    addressLine2,
    jibunAddress,
    buildingName,
    sido,
    sigungu,
    eupmyeondong,
    admCd,
    roadNameCode,
    buildingManagementNo,
  };
}
