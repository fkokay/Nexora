import type { CustomerAddressItem, CustomerLocationDefinitions } from "../../erp-types";
import { RecordFormGroup, RequiredMark } from "../../record-form/RecordForm";
import { StatusTag } from "../../list-page/StatusTag";
import {
  CustomerCountryInput,
  CustomerLocationInput,
  CustomerLocationMap,
  turkeyDistrictsForProvince,
} from "./CustomerFormControls";

/** The new-address fields (same as the former Adresler window's form; the request body is unchanged). */
export type CustomerAddressDraft = {
  kind: CustomerAddressItem["kind"];
  label: string;
  addressLine: string;
  city: string;
  district: string;
  postalCode: string;
  countryCode: string;
  latitude: number | null;
  longitude: number | null;
};

export const emptyAddressDraft: CustomerAddressDraft = {
  kind: "General",
  label: "",
  addressLine: "",
  city: "",
  district: "",
  postalCode: "",
  countryCode: "TR",
  latitude: null,
  longitude: null,
};

/** Id of the form the new-address fields submit (rendered outside the card's form; forms cannot nest). */
export const CUSTOMER_ADDRESS_FORM_ID = "customer-address-form";

const kindLabel = (kind: CustomerAddressItem["kind"]) => (kind === "Billing" ? "Fatura" : kind === "Delivery" ? "Teslimat" : "Genel");

type Props = {
  addresses: CustomerAddressItem[];
  busy: boolean;
  draft: CustomerAddressDraft;
  onDraftChange: (draft: CustomerAddressDraft) => void;
  onToggleActive: (address: CustomerAddressItem) => void;
  locationDefinitions: CustomerLocationDefinitions;
};

/**
 * Adresler section of the customer card (record form v3, mockup 08 §12): the account's addresses with Pasife al /
 * Etkinleştir (addresses are never deleted) and a new address. The new address has its own save ("Adres ekle"),
 * separate from the card's Kaydet: its fields belong to a separate form (`CUSTOMER_ADDRESS_FORM_ID`), so its
 * required fields never block saving the card and Ctrl+S never posts an address.
 */
export function CustomerAddressSection({ addresses, busy, draft, onDraftChange, onToggleActive, locationDefinitions }: Props) {
  const set = (patch: Partial<CustomerAddressDraft>) => onDraftChange({ ...draft, ...patch });
  const form = CUSTOMER_ADDRESS_FORM_ID;
  return (
    <div className="rf-columns">
      <RecordFormGroup title="Adresler" hint={<><span>{addresses.length}</span> <span>adres</span></>}>
        {addresses.length === 0 ? (
          <p className="rf-field customer-rf-empty">Bu cari için henüz adres yok.</p>
        ) : (
          <table className="nx-def-subtable customer-address-table">
            <thead>
              <tr>
                <th>Tür</th>
                <th>Etiket</th>
                <th>Adres</th>
                <th>Durum</th>
                <th aria-label="İşlem" />
              </tr>
            </thead>
            <tbody>
              {addresses.map((address) => (
                <tr key={address.id} className={address.isActive ? undefined : "is-inactive"}>
                  <td>{kindLabel(address.kind)}</td>
                  <td>
                    {address.label}
                    {address.isDefault && (
                      <>
                        {" "}
                        <StatusTag tone="info">Varsayılan</StatusTag>
                      </>
                    )}
                  </td>
                  <td>
                    {address.addressLine}, {address.district ? `${address.district}, ` : ""}
                    {address.city} · {address.countryCode}
                  </td>
                  <td>
                    <StatusTag tone={address.isActive ? "ok" : "off"}>{address.isActive ? "Aktif" : "Pasif"}</StatusTag>
                  </td>
                  <td>
                    <button type="button" className="secondary small-button" disabled={busy} onClick={() => onToggleActive(address)}>
                      {address.isActive ? "Pasife al" : "Etkinleştir"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </RecordFormGroup>
      <RecordFormGroup title="Yeni adres" hint="Varsayılan adres ilk kayıtta atanır.">
        <label>
          Adres türü
          <select form={form} value={draft.kind} onChange={(e) => set({ kind: e.target.value as CustomerAddressItem["kind"] })}>
            <option value="General">Genel</option>
            <option value="Billing">Fatura</option>
            <option value="Delivery">Teslimat</option>
          </select>
        </label>
        <label>
          <span>
            Adres etiketi <RequiredMark />
          </span>
          <input
            form={form}
            className="rf-must"
            value={draft.label}
            onChange={(e) => set({ label: e.target.value })}
            required
            maxLength={80}
            placeholder="Merkez ofis"
          />
        </label>
        <label className="rf-span-2">
          <span>
            Adres <RequiredMark />
          </span>
          <input
            form={form}
            className="rf-must"
            value={draft.addressLine}
            onChange={(e) => set({ addressLine: e.target.value })}
            required
            maxLength={400}
          />
        </label>
        <CustomerLocationInput
          id="customer-section-address-province"
          label="İl"
          form={form}
          value={draft.city}
          options={draft.countryCode === "TR" ? locationDefinitions.provinces : []}
          required
          optional={false}
          onChange={(value) => set({ city: value, district: "" })}
        />
        <CustomerLocationInput
          id="customer-section-address-district"
          label="İlçe"
          form={form}
          value={draft.district}
          options={
            draft.countryCode === "TR"
              ? turkeyDistrictsForProvince(draft.city, locationDefinitions.provinces, locationDefinitions.districts)
              : []
          }
          onChange={(value) => set({ district: value })}
        />
        <label>
          Posta kodu
          <input form={form} value={draft.postalCode} onChange={(e) => set({ postalCode: e.target.value })} maxLength={20} />
        </label>
        <CustomerCountryInput form={form} value={draft.countryCode} onChange={(value) => set({ countryCode: value, city: "", district: "" })} />
        <div className="rf-field rf-span-2">
          <CustomerLocationMap
            latitude={draft.latitude}
            longitude={draft.longitude}
            onChange={(latitude, longitude) => set({ latitude, longitude })}
          />
        </div>
        <div className="rf-field customer-address-actions">
          <button type="submit" form={form} className="secondary" disabled={busy}>
            Adres ekle
          </button>
        </div>
      </RecordFormGroup>
    </div>
  );
}
