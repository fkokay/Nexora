import type { Dispatch, FormEvent, SetStateAction } from "react";
import type {
  CustomerItem,
  CustomerGroupItem,
  CustomerCompanyOption,
  CustomerLocationDefinitions,
  CustomerCustomFieldDefinition,
} from "../../erp-types";
import {
  CustomerCountryInput,
  CustomerLocationInput,
  CustomerLocationMap,
  turkeyDistrictsForProvince,
} from "./CustomerFormControls";
import SearchableRecordPicker from "../../SearchableRecordPicker";
import {
  RecordFormGroup,
  RecordFormPage,
  RecordFormTabs,
  RequiredMark,
  type RecordFormTab,
} from "../../record-form/RecordForm";

export type CustomerCreatePageProps = {
  busy: boolean;
  error: string;
  setError: (value: string) => void;
  setModal: (value: boolean) => void;
  create: (event: FormEvent) => void;
  customerCreateTab: string;
  setCustomerCreateTab: (value: string) => void;
  code: string;
  setCode: Dispatch<SetStateAction<string>>;
  name: string;
  setName: Dispatch<SetStateAction<string>>;
  type: CustomerItem["type"];
  setType: Dispatch<SetStateAction<CustomerItem["type"]>>;
  groups: CustomerGroupItem[];
  groupId: string;
  setGroupId: Dispatch<SetStateAction<string>>;
  parentCompanyId: string;
  setParentCompanyId: Dispatch<SetStateAction<string>>;
  companyOptions: CustomerCompanyOption[];
  editingCustomer: CustomerItem | null;
  currencyCode: string;
  setCurrencyCode: Dispatch<SetStateAction<string>>;
  riskLimit: string;
  setRiskLimit: Dispatch<SetStateAction<string>>;
  paymentTermDays: string;
  setPaymentTermDays: Dispatch<SetStateAction<string>>;
  identityNumber: string;
  setIdentityNumber: Dispatch<SetStateAction<string>>;
  taxNumber: string;
  setTaxNumber: Dispatch<SetStateAction<string>>;
  taxOffice: string;
  setTaxOffice: Dispatch<SetStateAction<string>>;
  isEInvoiceRegistered: boolean;
  setIsEInvoiceRegistered: Dispatch<SetStateAction<boolean>>;
  eInvoiceRecipientAlias: string;
  setEInvoiceRecipientAlias: Dispatch<SetStateAction<string>>;
  phone:string; setPhone:Dispatch<SetStateAction<string>>; email:string; setEmail:Dispatch<SetStateAction<string>>; website:string; setWebsite:Dispatch<SetStateAction<string>>;
  contactName:string; setContactName:Dispatch<SetStateAction<string>>; contactPhone:string; setContactPhone:Dispatch<SetStateAction<string>>; contactEmail:string; setContactEmail:Dispatch<SetStateAction<string>>;
  priceListCode:string; setPriceListCode:Dispatch<SetStateAction<string>>; receivableAccountCode:string; setReceivableAccountCode:Dispatch<SetStateAction<string>>; payableAccountCode:string; setPayableAccountCode:Dispatch<SetStateAction<string>>;
  bankName:string; setBankName:Dispatch<SetStateAction<string>>; bankBranchCode:string; setBankBranchCode:Dispatch<SetStateAction<string>>; iban:string; setIban:Dispatch<SetStateAction<string>>;
  addressPostalCode: string;
  setAddressPostalCode: Dispatch<SetStateAction<string>>;
  addressCountry: string;
  setAddressCountry: Dispatch<SetStateAction<string>>;
  addressCity: string;
  setAddressCity: Dispatch<SetStateAction<string>>;
  addressDistrict: string;
  setAddressDistrict: Dispatch<SetStateAction<string>>;
  addressLine: string;
  setAddressLine: Dispatch<SetStateAction<string>>;
  locationDefinitions: CustomerLocationDefinitions;
  addressLatitude: number | null;
  setAddressLatitude: Dispatch<SetStateAction<number | null>>;
  addressLongitude: number | null;
  setAddressLongitude: Dispatch<SetStateAction<number | null>>;
  customerCreateFields: CustomerCustomFieldDefinition[];
  customerCreateValues: Record<string, string>;
  setCustomerCreateValues: Dispatch<SetStateAction<Record<string, string>>>;
  /** Success message shown in the status bar after "Kaydet ve Yeni". */
  notice?: string;
  /** Tells the container whether the next successful create keeps the form open for another record. */
  setStayAfterSave?: (value: boolean) => void;
  /** Clears every field of a new card back to its default. */
  onReset?: () => void;
};

export default function CustomerCreatePage({
  busy,
  error,
  setError,
  setModal,
  create,
  customerCreateTab,
  setCustomerCreateTab,
  code,
  setCode,
  name,
  setName,
  type,
  setType,
  groups,
  groupId,
  setGroupId,
  parentCompanyId,
  setParentCompanyId,
  companyOptions,
  editingCustomer,
  currencyCode,
  setCurrencyCode,
  riskLimit,
  setRiskLimit,
  paymentTermDays,
  setPaymentTermDays,
  identityNumber,
  setIdentityNumber,
  taxNumber,
  setTaxNumber,
  taxOffice,
  setTaxOffice,
  isEInvoiceRegistered,
  setIsEInvoiceRegistered,
  eInvoiceRecipientAlias,
  setEInvoiceRecipientAlias,
  phone, setPhone, email, setEmail, website, setWebsite,
  contactName, setContactName, contactPhone, setContactPhone, contactEmail, setContactEmail,
  priceListCode, setPriceListCode, receivableAccountCode, setReceivableAccountCode, payableAccountCode, setPayableAccountCode,
  bankName, setBankName, bankBranchCode, setBankBranchCode, iban, setIban,
  addressPostalCode,
  setAddressPostalCode,
  addressCountry,
  setAddressCountry,
  addressCity,
  setAddressCity,
  addressDistrict,
  setAddressDistrict,
  addressLine,
  setAddressLine,
  locationDefinitions,
  addressLatitude,
  setAddressLatitude,
  addressLongitude,
  setAddressLongitude,
  customerCreateFields,
  customerCreateValues,
  setCustomerCreateValues,
  notice,
  setStayAfterSave,
  onReset,
}: CustomerCreatePageProps) {
  const parentCompany = companyOptions.find(
    (company) => company.id === parentCompanyId,
  );
  const isEdit = !!editingCustomer;
  const tabs: RecordFormTab[] = [
    { key: "contact", label: "İletişim ve Adres" },
    { key: "finance", label: "Finans ve Muhasebe" },
    { key: "other", label: "Vergi ve E-Fatura" },
  ];
  if (customerCreateFields.length > 0) tabs.push({ key: "custom", label: "Özel Alanlar" });
  const activeTab = tabs.some((tab) => tab.key === customerCreateTab)
    ? customerCreateTab
    : "contact";
  const requiredFilled = [code.trim(), name.trim(), type, currencyCode.trim()].filter(Boolean).length;
  const eInvoiceWarning = !isEInvoiceRegistered
    ? ""
    : !taxNumber.trim() && !identityNumber.trim()
      ? "E-Fatura mükellefi için vergi no veya T.C. kimlik no girilmedi."
      : !eInvoiceRecipientAlias.trim()
        ? "E-Fatura mükellefi için alıcı etiketi girilmedi."
        : "";
  tabs[2].warning = !!eInvoiceWarning;
  const hasUnsavedInput = !isEdit && !!(code.trim() || name.trim());

  return (
    <RecordFormPage
      title={isEdit ? "Cari Kartı Düzenle" : "Cari Kart Tanımlama"}
      mode={isEdit ? "edit" : "create"}
      busy={busy}
      saveLabel={isEdit ? "Değişiklikleri Kaydet" : "Cari Kartı Kaydet"}
      formId="customer-create-form"
      onSubmit={create}
      onCancel={() => setModal(false)}
      onSaveIntent={setStayAfterSave}
      onReset={onReset}
      error={error}
      onDismissError={() => setError("")}
      status={
        <>
          <span>
            Zorunlu alanlar: <b>{requiredFilled} / 4</b>
          </span>
          {eInvoiceWarning && <span className="rf-status-warning">{eInvoiceWarning}</span>}
          {notice && <span className="rf-status-notice">{notice}</span>}
          {hasUnsavedInput && <span className="rf-status-end">Kaydedilmemiş değişiklik var</span>}
        </>
      }
    >
        <RecordFormGroup title="Cari Kimliği" bodyClassName="rf-identity">
            <label>
              <span>Cari kodu <RequiredMark /></span>
              <input
                className="rf-must rf-mono"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                maxLength={64}
                placeholder="Örn. C-1001"
              />
            </label>
            <label>
              <span>Ünvan <RequiredMark /></span>
              <input
                className="rf-must"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={200}
                placeholder="Firma veya kişi adı"
              />
            </label>
            <label>
              <span>Cari türü <RequiredMark /></span>
              <select
                className="rf-must"
                value={type}
                onChange={(e) => setType(e.target.value as CustomerItem["type"])}
              >
                <option value="Customer">Müşteri</option>
                <option value="Supplier">Tedarikçi</option>
                <option value="Both">Müşteri & Tedarikçi</option>
                <option value="Dealer">Bayi</option>
                <option value="Employee">Personel</option>
              </select>
            </label>
            <label>
              Cari grubu
              <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                <option value="">Grup atama</option>
                {groups
                  .filter((x) => x.isActive)
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
              </select>
            </label>
                  </RecordFormGroup>

        <RecordFormTabs
          tabs={tabs}
          active={activeTab}
          onChange={setCustomerCreateTab}
          label="Cari form bölümleri"
        >
            {activeTab === "contact" && (
              <div className="rf-columns">
                <RecordFormGroup title="İletişim">
                    <label>Telefon<input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={40} /></label>
                    <label>Kurumsal e-posta<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} /></label>
                    <label>Web sitesi<input type="url" value={website} onChange={(event) => setWebsite(event.target.value)} maxLength={255} placeholder="https://…" /></label>
                                  </RecordFormGroup>
                <RecordFormGroup title="Yetkili Kişi">
                    <label>Yetkili kişi<input value={contactName} onChange={(event) => setContactName(event.target.value)} maxLength={160} /></label>
                    <label>Yetkili telefon<input type="tel" value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} maxLength={40} /></label>
                    <label>Yetkili e-posta<input type="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} maxLength={254} /></label>
                                  </RecordFormGroup>
                <RecordFormGroup title="Adres">
                    <CustomerCountryInput
                      value={addressCountry}
                      onChange={(value) => {
                        setAddressCountry(value);
                        setAddressCity("");
                        setAddressDistrict("");
                      }}
                    />
                    <div className="rf-pair">
                      <CustomerLocationInput
                        id="customer-create-province"
                        label="İl"
                        optional={false}
                        value={addressCity}
                        options={addressCountry === "TR" ? locationDefinitions.provinces : []}
                        required={
                          !!(
                            addressLine.trim() ||
                            addressDistrict.trim() ||
                            addressPostalCode.trim()
                          )
                        }
                        onChange={(value) => {
                          setAddressCity(value);
                          setAddressDistrict("");
                        }}
                      />
                      <CustomerLocationInput
                        id="customer-create-district"
                        label="İlçe"
                        optional={false}
                        value={addressDistrict}
                        options={
                          addressCountry === "TR"
                            ? turkeyDistrictsForProvince(
                                addressCity,
                                locationDefinitions.provinces,
                                locationDefinitions.districts,
                              )
                            : []
                        }
                        onChange={setAddressDistrict}
                      />
                    </div>
                    <label className="rf-short">
                      Posta kodu
                      <input
                        value={addressPostalCode}
                        onChange={(e) => setAddressPostalCode(e.target.value)}
                        maxLength={20}
                      />
                    </label>
                    <label>
                      Adres
                      <textarea
                        value={addressLine}
                        onChange={(e) => setAddressLine(e.target.value)}
                        maxLength={400}
                        required={
                          !!(
                            addressCity.trim() ||
                            addressDistrict.trim() ||
                            addressPostalCode.trim()
                          )
                        }
                        placeholder="Mahalle, cadde, sokak ve kapı no"
                      />
                    </label>
                                  </RecordFormGroup>
                <div className="rf-columns-wide">
                  <CustomerLocationMap
                    latitude={addressLatitude}
                    longitude={addressLongitude}
                    onChange={(latitude, longitude) => {
                      setAddressLatitude(latitude);
                      setAddressLongitude(longitude);
                    }}
                  />
                </div>
              </div>
            )}
            {activeTab === "finance" && (
              <div className="rf-columns">
                <RecordFormGroup title="Finans">
                    <div className="rf-pair">
                      <label>
                        <span>Döviz kodu <RequiredMark /></span>
                        <input
                          className="rf-must rf-mono"
                          value={currencyCode}
                          onChange={(e) => setCurrencyCode(e.target.value.toUpperCase().slice(0, 3))}
                          required
                          maxLength={3}
                          placeholder="TRY"
                        />
                      </label>
                      <label>
                        Vade günü
                        <input
                          className="rf-num"
                          type="number"
                          min="0"
                          max="3650"
                          value={paymentTermDays}
                          onChange={(e) => setPaymentTermDays(e.target.value)}
                        />
                      </label>
                    </div>
                    <label>
                      Risk limiti
                      <input
                        className="rf-num"
                        type="number"
                        min="0"
                        step="0.01"
                        value={riskLimit}
                        onChange={(e) => setRiskLimit(e.target.value)}
                        placeholder="Belirtilmedi"
                      />
                    </label>
                    <label>Fiyat listesi kodu<input value={priceListCode} onChange={(event) => setPriceListCode(event.target.value)} maxLength={40} placeholder="Standart" /></label>
                                  </RecordFormGroup>
                <RecordFormGroup title="Muhasebe ve Banka">
                    <div className="rf-pair">
                      <label>Alıcı muhasebe hesabı<input className="rf-mono" value={receivableAccountCode} onChange={(event) => setReceivableAccountCode(event.target.value)} maxLength={40} placeholder="120" /></label>
                      <label>Satıcı muhasebe hesabı<input className="rf-mono" value={payableAccountCode} onChange={(event) => setPayableAccountCode(event.target.value)} maxLength={40} placeholder="320" /></label>
                    </div>
                    <div className="rf-pair">
                      <label>Banka adı<input value={bankName} onChange={(event) => setBankName(event.target.value)} maxLength={120} /></label>
                      <label>Şube kodu<input value={bankBranchCode} onChange={(event) => setBankBranchCode(event.target.value)} maxLength={40} /></label>
                    </div>
                    <label>IBAN<input className="rf-mono" value={iban} onChange={(event) => setIban(event.target.value.toUpperCase().replace(/\s/g, ""))} maxLength={34} placeholder="TR…" /></label>
                                  </RecordFormGroup>
                <RecordFormGroup title="Bağlı Firma">
                    <label>
                      Grup şirketi / Ana firma
                      <SearchableRecordPicker
                        options={companyOptions
                          .filter((company) => company.id !== editingCustomer?.id)
                          .map((company) => ({
                            id: company.id,
                            label: `${company.code} · ${company.name}`,
                          }))}
                        selectedId={parentCompanyId}
                        selectedLabel={
                          parentCompany
                            ? `${parentCompany.code} · ${parentCompany.name}`
                            : undefined
                        }
                        onSelect={setParentCompanyId}
                        title="Ana firma seçin"
                        placeholder="Bağımsız firma"
                        searchPlaceholder="Firma kodu veya adıyla ara"
                        emptyMessage="Aramanızla eşleşen firma bulunamadı."
                        triggerVariant="ellipsis"
                        clearable
                        clearLabel="Bağımsız firma"
                      />
                      <small>Bu cari seçilen ana firmanın alt firması olur.</small>
                    </label>
                                  </RecordFormGroup>
              </div>
            )}
            {activeTab === "other" && (
              <div className="rf-columns">
                <RecordFormGroup title="Vergi ve Kimlik">
                    <label>
                      Vergi dairesi
                      <input
                        value={taxOffice}
                        onChange={(e) => setTaxOffice(e.target.value)}
                        maxLength={120}
                      />
                    </label>
                    <label>
                      Vergi numarası
                      <input
                        className="rf-mono"
                        inputMode="numeric"
                        value={taxNumber}
                        onChange={(e) => setTaxNumber(e.target.value)}
                        maxLength={32}
                        placeholder="VKN"
                      />
                    </label>
                    <label>
                      T.C. kimlik no
                      <input
                        className="rf-mono"
                        inputMode="numeric"
                        value={identityNumber}
                        onChange={(e) =>
                          setIdentityNumber(e.target.value.replace(/\D/g, "").slice(0, 11))
                        }
                        maxLength={11}
                        placeholder="11 haneli TCKN"
                      />
                    </label>
                                  </RecordFormGroup>
                <RecordFormGroup title="E-Fatura">
                    <label className="rf-check">
                      <input
                        type="checkbox"
                        checked={isEInvoiceRegistered}
                        onChange={(event) => setIsEInvoiceRegistered(event.target.checked)}
                      />
                      E-Fatura mükellefi
                    </label>
                    {isEInvoiceRegistered ? (
                      <label>
                        Alıcı etiketi (PK)
                        <input
                          className="rf-mono"
                          value={eInvoiceRecipientAlias}
                          onChange={(event) => setEInvoiceRecipientAlias(event.target.value)}
                          maxLength={255}
                          placeholder="urn:mail:..."
                        />
                        <small>GİB kayıtlı e-fatura alıcısının posta kutusu adresi.</small>
                      </label>
                    ) : (
                      <small>Mükellef seçildiğinde alıcı posta kutusu etiketi girilebilir.</small>
                    )}
                                  </RecordFormGroup>
              </div>
            )}
            {activeTab === "custom" && (
              <RecordFormGroup title="Cari Özel Alanları">
                  <small>Zorunlu değerler cari kartıyla birlikte kaydedilir.</small>
                  <div className="rf-custom-grid">
                    {customerCreateFields.map((field) => (
                      <label key={field.id}>
                        <span>
                          {field.label}
                          {field.isRequired && <RequiredMark />}
                        </span>
                        {field.dataType === "Boolean" ? (
                          <select
                            required={field.isRequired}
                            value={customerCreateValues[field.code] || ""}
                            onChange={(e) =>
                              setCustomerCreateValues((current) => ({
                                ...current,
                                [field.code]: e.target.value,
                              }))
                            }
                          >
                            <option value="">Seçin</option>
                            <option value="true">Evet</option>
                            <option value="false">Hayır</option>
                          </select>
                        ) : (
                          <input
                            type={
                              field.dataType === "Decimal"
                                ? "number"
                                : field.dataType === "Date"
                                  ? "date"
                                  : "text"
                            }
                            step={field.dataType === "Decimal" ? "any" : undefined}
                            maxLength={field.dataType === "Text" ? field.maxLength : undefined}
                            required={field.isRequired}
                            value={customerCreateValues[field.code] || ""}
                            onChange={(e) =>
                              setCustomerCreateValues((current) => ({
                                ...current,
                                [field.code]: e.target.value,
                              }))
                            }
                          />
                        )}
                        <small>
                          {field.code} · {field.dataType}
                        </small>
                      </label>
                    ))}
                  </div>
                              </RecordFormGroup>
            )}
        </RecordFormTabs>
    </RecordFormPage>
  );
}
