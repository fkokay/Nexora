import React, { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Power } from "lucide-react";
import { api } from "./erpApi";
import type * as AppTypes from "./erp-types";
import { CustomerLocationDefinitionsFeedback } from "./customer-location-definitions/components/CustomerLocationDefinitionsFeedback";
import {
  DistrictForm,
  DistrictGrid,
  defaultDistrictFields,
} from "./customer-location-definitions/components/DistrictSection";
import { ProvinceForm } from "./customer-location-definitions/components/ProvinceSection";
import { ProvinceList, type ProvinceStatusFilter } from "./customer-location-definitions/components/ProvinceList";
import { LocationStatusTag } from "./customer-location-definitions/components/LocationStatusTag";
import { ListPageHeader } from "./list-page/ListPageHeader";
import { ListToolbar } from "./list-page/ListToolbar";
import { PageCommandsSlot } from "./commands/PageCommandsSlot";
import type { PageCommands } from "./commands/types";
import "./operational-definitions.css";
import "./customer-location-definitions/location-definitions-list-v2.css";
type CustomerLocationDefinitions = AppTypes.CustomerLocationDefinitions;
type CustomerLocationProvinceView = AppTypes.CustomerLocationProvinceView;
type TurkeyDistrictOption = AppTypes.TurkeyDistrictOption;
type TurkeyLocationOption = AppTypes.TurkeyLocationOption;
type BuiltInScreenLayoutField = AppTypes.BuiltInScreenLayoutField;

export function CustomerLocationDefinitionsPage({ token }: { token: string }) {
  const [definitions, setDefinitions] = useState<CustomerLocationDefinitions>({
    provinces: [],
    districts: [],
  });
  const [selectedProvinceId, setSelectedProvinceId] = useState(0);
  const [provinceQuery, setProvinceQuery] = useState("");
  const [provinceStatus, setProvinceStatus] = useState<ProvinceStatusFilter>("all");
  const [dialog, setDialog] = useState<"province" | "district" | null>(null);
  const [districtToolsSlot, setDistrictToolsSlot] = useState<HTMLDivElement | null>(null);
  const [provinceEditingId, setProvinceEditingId] = useState<number | null>(
      null,
    ),
    [provinceName, setProvinceName] = useState(""),
    [provinceActive, setProvinceActive] = useState(true);
  const [districtEditingId, setDistrictEditingId] = useState<number | null>(
      null,
    ),
    [districtProvinceId, setDistrictProvinceId] = useState(""),
    [districtName, setDistrictName] = useState(""),
    [districtActive, setDistrictActive] = useState(true),
    [districtQuery, setDistrictQuery] = useState("");
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  // The province column is a fixed list (name, Pasif tag, district count); the district grid keeps its screen view.
  const [districtFields, setDistrictFields] = useState<
    BuiltInScreenLayoutField[]
  >(defaultDistrictFields);
  useEffect(() => {
    let active = true;
    api<{ fields: BuiltInScreenLayoutField[] }>(
      "/api/screen-views/customer-districts/active",
      token,
    )
      .then((view) => {
        if (active && view.fields?.length) setDistrictFields(view.fields);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [token]);
  async function load() {
    setLoading(true);
    try {
      const data = await api<CustomerLocationDefinitions>(
        "/api/location-definitions/admin",
        token,
      );
      setDefinitions(data);
      setSelectedProvinceId((current) =>
        data.provinces.some((item) => item.id === current)
          ? current
          : (data.provinces[0]?.id ?? 0),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [token]);
  function resetProvince() {
    setProvinceEditingId(null);
    setProvinceName("");
    setProvinceActive(true);
  }
  function resetDistrict(provinceId = selectedProvinceId) {
    setDistrictEditingId(null);
    setDistrictName("");
    setDistrictActive(true);
    setDistrictProvinceId(provinceId ? String(provinceId) : "");
  }
  async function saveProvince(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api<CustomerLocationProvinceView>(
        provinceEditingId
          ? `/api/location-definitions/provinces/${provinceEditingId}`
          : "/api/location-definitions/provinces",
        token,
        {
          method: provinceEditingId ? "PUT" : "POST",
          body: JSON.stringify({
            name: provinceName,
            isActive: provinceActive,
          }),
        },
      );
      setNotice(
        provinceEditingId ? "İl tanımı güncellendi." : "İl tanımı oluşturuldu.",
      );
      setSelectedProvinceId(result.id);
      setDistrictProvinceId(String(result.id));
      resetProvince();
      setDialog(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function saveDistrict(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api<TurkeyDistrictOption>(
        districtEditingId
          ? `/api/location-definitions/districts/${districtEditingId}`
          : "/api/location-definitions/districts",
        token,
        {
          method: districtEditingId ? "PUT" : "POST",
          body: JSON.stringify({
            provinceId: Number(districtProvinceId),
            name: districtName,
            isActive: districtActive,
          }),
        },
      );
      setNotice(
        districtEditingId
          ? "İlçe tanımı güncellendi."
          : "İlçe tanımı oluşturuldu.",
      );
      setSelectedProvinceId(result.provinceId);
      resetDistrict(result.provinceId);
      setDialog(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function toggleProvince(item: TurkeyLocationOption) {
    setBusy(true);
    setError("");
    try {
      await api<CustomerLocationProvinceView>(
        `/api/location-definitions/provinces/${item.id}`,
        token,
        {
          method: "PUT",
          body: JSON.stringify({ name: item.name, isActive: !item.isActive }),
        },
      );
      setNotice(
        item.isActive
          ? "İl tanımı pasife alındı."
          : "İl tanımı etkinleştirildi.",
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function toggleDistrict(item: TurkeyDistrictOption) {
    setBusy(true);
    setError("");
    try {
      await api<TurkeyDistrictOption>(
        `/api/location-definitions/districts/${item.id}`,
        token,
        {
          method: "PUT",
          body: JSON.stringify({
            provinceId: item.provinceId,
            name: item.name,
            isActive: !item.isActive,
          }),
        },
      );
      setNotice(
        item.isActive
          ? "İlçe tanımı pasife alındı."
          : "İlçe tanımı etkinleştirildi.",
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const selectedProvince = definitions.provinces.find(
    (item) => item.id === selectedProvinceId,
  );
  const selectedDistricts = definitions.districts.filter(
    (item) => item.provinceId === selectedProvinceId,
  );
  const visibleDistricts = selectedDistricts.filter((item) =>
    item.name
      .toLocaleLowerCase("tr-TR")
      .includes(districtQuery.toLocaleLowerCase("tr-TR")),
  );
  const visibleProvinces = definitions.provinces.filter(
    (item) =>
      (provinceStatus === "all" ||
        item.isActive === (provinceStatus === "active")) &&
      item.name
        .toLocaleLowerCase("tr-TR")
        .includes(provinceQuery.toLocaleLowerCase("tr-TR")),
  );
  const districtCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const item of definitions.districts)
      counts.set(item.provinceId, (counts.get(item.provinceId) ?? 0) + 1);
    return counts;
  }, [definitions.districts]);

  // Yeni il / Yeni ilçe / Düzenle open a small dialog; the lists stay in view behind it.
  function openNewProvince() {
    resetProvince();
    setError("");
    setDialog("province");
  }
  function openEditProvince(item: CustomerLocationProvinceView) {
    setProvinceEditingId(item.id);
    setProvinceName(item.name);
    setProvinceActive(item.isActive);
    setError("");
    setDialog("province");
  }
  function openNewDistrict() {
    resetDistrict();
    setError("");
    setDialog("district");
  }
  function openEditDistrict(item: TurkeyDistrictOption) {
    setDistrictEditingId(item.id);
    setDistrictProvinceId(String(item.provinceId));
    setDistrictName(item.name);
    setDistrictActive(item.isActive);
    setError("");
    setDialog("district");
  }
  function closeDialog() {
    if (busy) return;
    if (dialog === "province") resetProvince();
    else resetDistrict();
    setError("");
    setDialog(null);
  }

  // Yeni adds a district to the selected province; the province commands are in İşlemler and the panel heads.
  const commands: PageCommands = {
    new: {
      primary: true,
      disabledReason: selectedProvince ? undefined : "Önce bir il seçin",
      run: openNewDistrict,
    },
    delete: { disabledReason: "Tanımlar silinmez; pasife alın" },
    more: [
      { id: "location-new-province", label: "Yeni il", run: openNewProvince },
      {
        id: "location-edit-province",
        label: "Seçili ili düzenle",
        disabledReason: selectedProvince ? undefined : "Önce bir il seçin",
        run: () => {
          if (selectedProvince) openEditProvince(selectedProvince);
        },
      },
      {
        id: "location-toggle-province",
        label: selectedProvince?.isActive === false ? "Seçili ili etkinleştir" : "Seçili ili pasife al",
        disabledReason: selectedProvince ? (busy ? "İşleniyor…" : undefined) : "Önce bir il seçin",
        run: () => {
          if (selectedProvince) return toggleProvince(selectedProvince);
        },
      },
    ],
  };

  return (
    <div className="customer-location-definitions-page list-v2 cld-v2">
      {!dialog && <PageCommandsSlot commands={commands} />}
      <ListPageHeader
        title="Adres tanımları"
        description={`${definitions.provinces.length} il · ${definitions.districts.length} ilçe. Cari adreslerinde kullanılan il ve ilçeler; pasif kayıtlar yeni seçimlerde gösterilmez.`}
      />
      <CustomerLocationDefinitionsFeedback
        error={dialog ? "" : error}
        notice={notice}
        onDismissError={() => setError("")}
        onDismissNotice={() => setNotice("")}
      />
      <div className="cld-layout">
        <ProvinceList
          provinces={visibleProvinces}
          totalCount={definitions.provinces.length}
          districtCounts={districtCounts}
          selectedProvinceId={selectedProvinceId}
          loading={loading}
          query={provinceQuery}
          status={provinceStatus}
          onQueryChange={setProvinceQuery}
          onStatusChange={setProvinceStatus}
          onSelect={(id) => {
            setSelectedProvinceId(id);
            setDistrictProvinceId(String(id));
            setDistrictQuery("");
          }}
          onNew={openNewProvince}
        />
        <section className="cld-panel cld-districts" aria-labelledby="cld-districts-title">
          <header className="cld-panel-head">
            <div className="cld-panel-title">
              <h2 id="cld-districts-title">
                {selectedProvince ? `${selectedProvince.name} ilçeleri` : "İlçeler"}
              </h2>
              <span className="cld-count">{selectedDistricts.length}</span>
              {selectedProvince && <LocationStatusTag active={selectedProvince.isActive} />}
            </div>
            {selectedProvince && (
              <div className="cld-head-actions">
                <button type="button" className="secondary small-button" onClick={() => openEditProvince(selectedProvince)}>
                  <Pencil size={14} aria-hidden="true" /> İli düzenle
                </button>
                <button
                  type="button"
                  className="secondary small-button"
                  disabled={busy}
                  onClick={() => void toggleProvince(selectedProvince)}
                >
                  <Power size={14} aria-hidden="true" /> {selectedProvince.isActive ? "Pasife al" : "Etkinleştir"}
                </button>
                <button type="button" className="primary small-button" onClick={openNewDistrict}>
                  <Plus size={14} aria-hidden="true" /> Yeni ilçe
                </button>
              </div>
            )}
          </header>
          <ListToolbar
            search={districtQuery}
            onSearchChange={setDistrictQuery}
            searchLabel="İlçe ara"
            searchPlaceholder="İlçe ara"
            toolsSlotRef={setDistrictToolsSlot}
            onRefresh={() => {
              if (!loading) void load();
            }}
          />
          <DistrictGrid
            districts={visibleDistricts}
            provinces={definitions.provinces}
            loading={loading}
            busy={busy}
            onEdit={openEditDistrict}
            onToggle={(item) => void toggleDistrict(item)}
            fields={districtFields}
            toolbarContainer={districtToolsSlot}
            emptyMessage={
              !selectedProvince
                ? "Soldan bir il seçin."
                : selectedDistricts.length
                  ? "Aramanızla eşleşen ilçe yok."
                  : "Bu ile henüz ilçe eklenmedi."
            }
          />
        </section>
      </div>
      {dialog && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeDialog();
          }}
        >
          <div
            className="modal cld-modal sales-rf-host"
            role="dialog"
            aria-modal="true"
            aria-label={dialog === "province" ? "İl tanımı" : "İlçe tanımı"}
          >
            {dialog === "province" ? (
              <ProvinceForm
                editingId={provinceEditingId}
                name={provinceName}
                active={provinceActive}
                busy={busy}
                error={error}
                onDismissError={() => setError("")}
                onNameChange={setProvinceName}
                onActiveChange={setProvinceActive}
                onSubmit={saveProvince}
                onCancel={closeDialog}
              />
            ) : (
              <DistrictForm
                provinces={definitions.provinces}
                editingId={districtEditingId}
                provinceId={districtProvinceId || String(selectedProvinceId || "")}
                name={districtName}
                active={districtActive}
                busy={busy}
                error={error}
                onDismissError={() => setError("")}
                onProvinceIdChange={setDistrictProvinceId}
                onNameChange={setDistrictName}
                onActiveChange={setDistrictActive}
                onSubmit={saveDistrict}
                onCancel={closeDialog}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
