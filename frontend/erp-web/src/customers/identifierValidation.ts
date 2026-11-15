/**
 * Client-side mirror of src/Platform/AIERP.Platform.Application/TurkishIdentifierValidation.cs and the
 * identifier rules in CustomerValidation. Keep the algorithms and Turkish messages identical to the server.
 */

export const INVALID_VKN_MESSAGE = "Vergi numarası 10 haneli olmalı ve geçerli bir VKN olmalıdır.";
export const INVALID_TCKN_MESSAGE = "T.C. kimlik numarası geçersiz.";
export const TCKN_SHAPE_MESSAGE = "T.C. kimlik numarası 11 rakam olmalıdır.";
export const INVALID_IBAN_MESSAGE = "IBAN geçersiz; ülke kodu, uzunluk ve kontrol basamaklarını kontrol edin.";
export const TAX_NUMBER_LENGTH_MESSAGE = "Vergi numarası en fazla 32 karakter olabilir.";

/** GİB check-digit algorithm for the 10-digit Turkish tax number (VKN). */
export function isValidVkn(value: string): boolean {
  if (!/^\d{10}$/.test(value)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const temp = (Number(value[i]) + 9 - i) % 10;
    sum += temp === 9 ? 9 : (temp * 2 ** (9 - i)) % 9;
  }
  return (10 - (sum % 10)) % 10 === Number(value[9]);
}

/** 11-digit Turkish national identity number (TCKN): first digit non-zero, 10th and 11th digit rules. */
export function isValidTckn(value: string): boolean {
  if (!/^[1-9]\d{10}$/.test(value)) return false;
  const d = [...value].map(Number);
  const odd = d[0] + d[2] + d[4] + d[6] + d[8];
  const even = d[1] + d[3] + d[5] + d[7];
  if ((((odd * 7 - even) % 10) + 10) % 10 !== d[9]) return false;
  return d.slice(0, 10).reduce((total, digit) => total + digit, 0) % 10 === d[10];
}

/** Removes whitespace and upper-cases an IBAN (the stored form). */
export function normalizeIban(value: string): string {
  return value.replace(/\s/g, "").toUpperCase();
}

const IBAN_LENGTHS: Record<string, number> = {
  TR: 26, DE: 22, GB: 22, FR: 27, NL: 18, IT: 27, ES: 24, BE: 16,
  AT: 20, CH: 21, PL: 28, SE: 24, DK: 18, NO: 15, FI: 18, IE: 22,
  PT: 25, GR: 27, LU: 20, CY: 28, AZ: 28, GE: 22, SA: 24, AE: 23,
};

/** ISO 13616: structure, country length (TR = 26, otherwise 15–34) and the mod-97 check, computed iteratively. */
export function isValidIban(value: string): boolean {
  const iban = normalizeIban(value);
  if (iban.length < 15 || iban.length > 34) return false;
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban)) return false;
  const expected = IBAN_LENGTHS[iban.slice(0, 2)];
  if (expected !== undefined && iban.length !== expected) return false;
  if (iban.startsWith("TR") && !/^\d{6}$/.test(iban.slice(4, 10))) return false;
  let remainder = 0;
  for (const char of iban.slice(4) + iban.slice(0, 4)) {
    remainder = /\d/.test(char)
      ? (remainder * 10 + Number(char)) % 97
      : (remainder * 100 + (char.charCodeAt(0) - 55)) % 97;
  }
  return remainder === 1;
}

/** Turkish when the address country is TR, or when no address will be sent (same rule as the server). */
export function isTurkishCountry(countryCode: string | null | undefined): boolean {
  return !countryCode?.trim() || countryCode.trim().toUpperCase() === "TR";
}

export type CustomerIdentifierInput = {
  taxNumber: string;
  identityNumber: string;
  iban: string;
  /** Country of the address that is sent with the card; empty when no address is sent. */
  countryCode: string | null;
};

export type CustomerIdentifierErrors = Partial<Record<"taxNumber" | "identityNumber" | "iban", string>>;

/**
 * Validates customer identifiers. When `stored` is given (editing an existing card), checksum rules apply only to
 * values that differ from the stored ones, so cards with legacy values can still be saved.
 */
export function validateCustomerIdentifiers(
  input: CustomerIdentifierInput,
  stored?: { taxNumber?: string | null; identityNumber?: string | null; iban?: string | null } | null,
): CustomerIdentifierErrors {
  const errors: CustomerIdentifierErrors = {};
  const changed = (value: string, previous: string | null | undefined) => !stored || value !== (previous ?? "").trim();

  const taxNumber = input.taxNumber.trim();
  if (taxNumber.length > 32) errors.taxNumber = TAX_NUMBER_LENGTH_MESSAGE;
  else if (taxNumber && isTurkishCountry(input.countryCode) && changed(taxNumber, stored?.taxNumber) && !isValidVkn(taxNumber))
    errors.taxNumber = INVALID_VKN_MESSAGE;

  const identityNumber = input.identityNumber.trim();
  if (identityNumber && !/^\d{11}$/.test(identityNumber)) errors.identityNumber = TCKN_SHAPE_MESSAGE;
  else if (identityNumber && changed(identityNumber, stored?.identityNumber) && !isValidTckn(identityNumber))
    errors.identityNumber = INVALID_TCKN_MESSAGE;

  const iban = normalizeIban(input.iban);
  if (iban && changed(iban, stored?.iban ? normalizeIban(stored.iban) : stored?.iban) && !isValidIban(iban))
    errors.iban = INVALID_IBAN_MESSAGE;

  return errors;
}
