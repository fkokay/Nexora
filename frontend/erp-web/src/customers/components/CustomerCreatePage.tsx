import type { Dispatch, FormEvent, SetStateAction } from "react";
import {
  CircleDollarSign,
  FileText,
  Info,
  Layers,
  MapPin,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
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
}: CustomerCreatePageProps) {
  const parentCompany = companyOptions.find(
    (company) => company.id === parentCompanyId,
  );
  return (
    <div className="customer-create-page">
      <section className="customer-create-page-surface">
        <header className="customer-create-page-heading">
          <div className="customer-create-page-title">
            <span className="customer-create-page-icon">
              <Users size={22} />
            </span>
            <div>
              <p className="eyebrow">CARİ YÖNETİMİ</p>
              <h1>{editingCustomer ? "Cari Kartı Düzenle" : "Cari Kart Tanımlama"}</h1>
              <p>
                {editingCustomer
                  ? "Cari bilgilerini aynı çalışma alanında görüntüleyip güncelleyin."
                  : "Yeni cari oluşturun, temel bilgileri ve ilişkili detayları tanımlayın."}
              </p>
            </div>
          </div>
          <div className="customer-create-page-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => setModal(false)}
            >
              <X size={16} />
              Vazgeç
            </button>
            <button
              type="submit"
              form="customer-create-form"
              className="primary"
              disabled={busy}
            >
              <ShieldCheck size={16} />
              {busy ? "Kaydediliyor…" : editingCustomer ? "Değişiklikleri Kaydet" : "Cari Kartı Kaydet"}
            </button>
          </div>
        </header>
        {error && (
          <div
            className="alert inline-alert customer-create-page-error"
            role="alert"
          >
            {error}
            <button
              type="button"
              aria-label="Hatayı kapat"
              onClick={() => setError("")}
            >
              <X size={15} />
            </button>
          </div>
        )}
        <form
          id="customer-create-form"
          className="customer-create-form"
          onSubmit={create}
        >
          <nav
            className="customer-create-tabs"
            aria-label="Cari form bölümleri"
          >
            {[
              ["basic", "Genel Bilgiler", "customer-create-basic"],
              ["contact", "İletişim Bilgileri", "customer-create-contact"],
              ["finance", "Finansal Bilgiler", "customer-create-finance"],
              ["other", "Diğer / E-Fatura", "customer-create-other"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-current={customerCreateTab === key ? "page" : undefined}
                onClick={() => setCustomerCreateTab(key)}
              >
                {label}
              </button>
            ))}
          </nav>
          <div
            className={`customer-create-fields customer-create-fields--${customerCreateTab}`}
          >
            {customerCreateTab === "basic" && (
              <fieldset
                id="customer-create-basic"
                className="customer-create-section erp-form-group"
              >
                <legend>
                  <Info size={16} aria-hidden="true" />
                  Temel Bilgiler
                </legend>
                <div className="form-two">
                  <label>
                    Cari kodu
                    <input
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      required
                      maxLength={64}
                      placeholder="Örn. C-1001"
                    />
                  </label>
                  <label>
                    Cari türü
                    <select
                      value={type}
                      onChange={(e) =>
                        setType(e.target.value as CustomerItem["type"])
                      }
                    >
                      <option value="Customer">Müşteri</option>
                      <option value="Supplier">Tedarikçi</option>
                      <option value="Both">Müşteri & Tedarikçi</option>
                      <option value="Dealer">Bayi</option>
                      <option value="Employee">Personel</option>
                    </select>
                  </label>
                </div>
                <label>
                  Ünvan
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    maxLength={200}
                    placeholder="Firma veya kişi adı"
                  />
                </label>
              </fieldset>
            )}
            {customerCreateTab === "finance" && (
              <>
                <fieldset
                  id="customer-create-finance"
                  className="customer-create-section erp-form-group"
                >
                  <legend>
                    <CircleDollarSign size={16} aria-hidden="true" />
                    Finansal Bilgiler
                  </legend>
                  <div className="form-two">
                    <label>
                      Cari grubu
                      <select
                        value={groupId}
                        onChange={(e) => setGroupId(e.target.value)}
                      >
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
                    <label>
                      Grup şirketi / Ana firma
                      <SearchableRecordPicker
                        options={companyOptions
                          .filter(
                            (company) => company.id !== editingCustomer?.id,
                          )
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
                        clearable
                        clearLabel="Bağımsız firma"
                      />
                      <small>
                        Bu cari seçilen ana firmanın alt firması olur.
                      </small>
                    </label>
                    <label>
                      Döviz kodu
                      <input
                        value={currencyCode}
                        onChange={(e) =>
                          setCurrencyCode(
                            e.target.value.toUpperCase().slice(0, 3),
                          )
                        }
                        required
                        maxLength={3}
                        placeholder="TRY"
                      />
                    </label>
                    <label>
                      Risk limiti
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={riskLimit}
                        onChange={(e) => setRiskLimit(e.target.value)}
                        placeholder="Belirtilmedi"
                      />
                    </label>
                    <label>
                      Vade günü
                      <input
                        type="number"
                        min="0"
                        max="3650"
                        value={paymentTermDays}
                        onChange={(e) => setPaymentTermDays(e.target.value)}
                      />
                    </label>
                    <label>Fiyat listesi kodu<input value={priceListCode} onChange={(event) => setPriceListCode(event.target.value)} maxLength={40} placeholder="Standart" /></label>
                    <label>Alıcı muhasebe hesabı<input value={receivableAccountCode} onChange={(event) => setReceivableAccountCode(event.target.value)} maxLength={40} placeholder="120" /></label>
                    <label>Satıcı muhasebe hesabı<input value={payableAccountCode} onChange={(event) => setPayableAccountCode(event.target.value)} maxLength={40} placeholder="320" /></label>
                    <label>Banka adı<input value={bankName} onChange={(event) => setBankName(event.target.value)} maxLength={120} /></label>
                    <label>Şube kodu<input value={bankBranchCode} onChange={(event) => setBankBranchCode(event.target.value)} maxLength={40} /></label>
                    <label>IBAN<input value={iban} onChange={(event) => setIban(event.target.value.toUpperCase().replace(/\s/g, ""))} maxLength={34} placeholder="TR…" /></label>
                  </div>
                </fieldset>
                <fieldset
                  id="customer-create-tax"
                  className="customer-create-section erp-form-group"
                >
                  <legend>
                    <FileText size={16} aria-hidden="true" />
                    Vergi ve Kimlik Bilgileri
                  </legend>
                  <div className="form-two">
                    <label>
                      T.C. kimlik no{" "}
                      <span className="optional-label">İsteğe bağlı</span>
                      <input
                        inputMode="numeric"
                        value={identityNumber}
                        onChange={(e) =>
                          setIdentityNumber(
                            e.target.value.replace(/\D/g, "").slice(0, 11),
                          )
                        }
                        maxLength={11}
                        placeholder="11 haneli TCKN"
                      />
                    </label>
                    <label>
                      Vergi numarası{" "}
                      <span className="optional-label">İsteğe bağlı</span>
                      <input
                        inputMode="numeric"
                        value={taxNumber}
                        onChange={(e) => setTaxNumber(e.target.value)}
                        maxLength={32}
                        placeholder="VKN"
                      />
                    </label>
                    <label>
                      Vergi dairesi{" "}
                      <span className="optional-label">İsteğe bağlı</span>
                      <input
                        value={taxOffice}
                        onChange={(e) => setTaxOffice(e.target.value)}
                        maxLength={120}
                      />
                    </label>
                  </div>
                </fieldset>
              </>
            )}
            {customerCreateTab === "contact" && (
              <>
                <fieldset
                  id="customer-create-address"
                  className="customer-create-section erp-form-group"
                >
                  <legend>
                    <MapPin size={16} aria-hidden="true" />
                    Adres Bilgileri
                  </legend>
                  <div className="form-two">
                    <label>Telefon<input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={40} /></label>
                    <label>Kurumsal e-posta<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} /></label>
                    <label>Web sitesi<input type="url" value={website} onChange={(event) => setWebsite(event.target.value)} maxLength={255} placeholder="https://…" /></label>
                    <label>Yetkili kişi<input value={contactName} onChange={(event) => setContactName(event.target.value)} maxLength={160} /></label>
                    <label>Yetkili telefon<input type="tel" value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} maxLength={40} /></label>
                    <label>Yetkili e-posta<input type="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} maxLength={254} /></label>
                  </div>
                  <div className="form-two">
                    <CustomerCountryInput
                      value={addressCountry}
                      onChange={(value) => {
                        setAddressCountry(value);
                        setAddressCity("");
                        setAddressDistrict("");
                      }}
                    />
                    <label>
                      Posta kodu{" "}
                      <span className="optional-label">İsteğe bağlı</span>
                      <input
                        value={addressPostalCode}
                        onChange={(e) => setAddressPostalCode(e.target.value)}
                        maxLength={20}
                      />
                    </label>
                    <CustomerLocationInput
                      id="customer-create-province"
                      label="İl"
                      value={addressCity}
                      options={
                        addressCountry === "TR"
                          ? locationDefinitions.provinces
                          : []
                      }
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
                  <label>
                    Adres <span className="optional-label">İsteğe bağlı</span>
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
                  <CustomerLocationMap
                    latitude={addressLatitude}
                    longitude={addressLongitude}
                    onChange={(latitude, longitude) => {
                      setAddressLatitude(latitude);
                      setAddressLongitude(longitude);
                    }}
                  />
                </fieldset>
              </>
            )}
            {customerCreateTab === "other" && (
              <>
                <fieldset className="customer-create-section erp-form-group customer-einvoice-section">
                  <legend>
                    <FileText size={16} aria-hidden="true" />
                    E-Fatura Bilgileri
                  </legend>
                  <label className="customer-einvoice-toggle">
                    E-Fatura mükellefi
                    <select
                      value={isEInvoiceRegistered ? "yes" : "no"}
                      onChange={(event) => setIsEInvoiceRegistered(event.target.value === "yes")}
                    >
                      <option value="no">Hayır</option>
                      <option value="yes">Evet</option>
                    </select>
                    <small>Mükellef seçildiğinde alıcı posta kutusu etiketi girilebilir.</small>
                  </label>
                  {isEInvoiceRegistered && (
                    <label>
                      Alıcı etiketi (PK)
                      <input
                        value={eInvoiceRecipientAlias}
                        onChange={(event) => setEInvoiceRecipientAlias(event.target.value)}
                        maxLength={255}
                        placeholder="urn:mail:..."
                      />
                      <small>GİB kayıtlı e-fatura alıcısının posta kutusu adresi.</small>
                    </label>
                  )}
                </fieldset>
                {customerCreateFields.length > 0 && (
                <fieldset
                  id="customer-create-other"
                  className="customer-create-section erp-form-group"
                >
                  <legend>
                    <Layers size={16} aria-hidden="true" />
                    Cari Özel Alanları
                  </legend>
                  <p>Zorunlu değerler cari kartıyla birlikte kaydedilir.</p>
                  <div className="form-two">
                    {customerCreateFields.map((field) => (
                      <label key={field.id}>
                        {field.label}
                        {field.isRequired ? " *" : ""}
                        <small>
                          {field.code} · {field.dataType}
                        </small>
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
                            step={
                              field.dataType === "Decimal" ? "any" : undefined
                            }
                            maxLength={
                              field.dataType === "Text"
                                ? field.maxLength
                                : undefined
                            }
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
                      </label>
                    ))}
                  </div>
                </fieldset>
                )}
              </>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}
