import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type {
  TurkeyLocationOption,
  TurkeyDistrictOption,
} from "../../erp-types";

const customerCountryCodes =
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(
    " ",
  );
const customerCountryNames = new Intl.DisplayNames(["tr"], { type: "region" });
export function turkeyDistrictsForProvince(
  province: string,
  provinces: TurkeyLocationOption[],
  districts: TurkeyDistrictOption[],
): TurkeyLocationOption[] {
  const selected = provinces.find(
    (item) =>
      item.name.toLocaleLowerCase("tr-TR") ===
      province.trim().toLocaleLowerCase("tr-TR"),
  );
  return selected
    ? districts.filter((item) => item.provinceId === selected.id)
    : [];
}

export function CustomerLocationInput({
  id,
  label,
  value,
  options,
  onChange,
  required = false,
  optional = true,
}: {
  id: string;
  label: string;
  value: string;
  options: TurkeyLocationOption[];
  onChange: (value: string) => void;
  required?: boolean;
  optional?: boolean;
}) {
  return (
    <label>
      {label}
      {optional && <span className="optional-label">İsteğe bağlı</span>}
      <input
        list={`${id}-options`}
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={100}
        required={required}
      />
      <datalist id={`${id}-options`}>
        {options.map((option) => (
          <option key={option.id} value={option.name} />
        ))}
      </datalist>
      {options.length === 0 && (
        <small className="customer-location-hint">
          Konum listesi boşsa il veya ilçeyi elle yazabilirsiniz.
        </small>
      )}
    </label>
  );
}

export function CustomerCountryInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      Ülke
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required
      >
        {customerCountryCodes.map((code) => (
          <option key={code} value={code}>
            {customerCountryNames.of(code) ?? code} ({code})
          </option>
        ))}
      </select>
    </label>
  );
}

export function CustomerLocationMap({
  latitude,
  longitude,
  onChange,
}: {
  latitude: number | null;
  longitude: number | null;
  onChange: (latitude: number | null, longitude: number | null) => void;
}) {
  const [mapOpen, setMapOpen] = useState(false);
  const mapElement = useRef<HTMLDivElement | null>(null),
    mapInstance = useRef<L.Map | null>(null),
    pin = useRef<L.CircleMarker | null>(null),
    onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  useEffect(() => {
    if (!mapOpen || !mapElement.current) return;
    const map = L.map(mapElement.current, {
      center:
        latitude !== null && longitude !== null
          ? [latitude, longitude]
          : [39, 35],
      zoom: latitude !== null && longitude !== null ? 14 : 6,
      scrollWheelZoom: true,
    });
    const environment = import.meta.env as ImportMetaEnv & {
      VITE_MAP_TILE_URL?: string;
    };
    L.tileLayer(
      environment.VITE_MAP_TILE_URL ||
        "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        maxZoom: 19,
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>',
      },
    ).addTo(map);
    map.on("click", (event) =>
      onChangeRef.current(event.latlng.lat, event.latlng.lng),
    );
    mapInstance.current = map;
    window.requestAnimationFrame(() => map.invalidateSize());
    return () => {
      map.remove();
      mapInstance.current = null;
      pin.current = null;
    };
  }, [mapOpen]);
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;
    if (latitude === null || longitude === null) {
      if (pin.current) {
        map.removeLayer(pin.current);
        pin.current = null;
      }
      return;
    }
    if (pin.current) pin.current.setLatLng([latitude, longitude]);
    else
      pin.current = L.circleMarker([latitude, longitude], {
        radius: 9,
        color: "#ffffff",
        weight: 3,
        fillColor: "#0878f9",
        fillOpacity: 1,
      }).addTo(map);
  }, [latitude, longitude, mapOpen]);
  const coordinatesRequired = latitude !== null || longitude !== null;
  return (
    <section className="customer-location-picker" aria-label="Harita konumu">
      <div className="customer-location-picker-heading">
        <div>
          <b>Harita konumu</b>
          <small>
            Haritaya tıklayarak pini seçin. Harita alanı OpenStreetMap harita
            sunucusuna iletilir.
          </small>
        </div>
        <button
          type="button"
          className="secondary small-button"
          aria-expanded={mapOpen}
          onClick={() => setMapOpen((value) => !value)}
        >
          {mapOpen ? "Haritayı kapat" : "Haritayı aç"}
        </button>
      </div>
      {mapOpen && (
        <>
          <p className="customer-map-privacy-note">
            Cari adresinin metni harita hizmetine gönderilmez; ancak
            görüntülenen harita bölgesi tile isteklerinden tahmin edilebilir.
          </p>
          <div
            ref={mapElement}
            className="customer-location-map"
            role="application"
            aria-label="Konum seçme haritası"
          />
          <div className="form-two customer-coordinate-fields">
            <label>
              Enlem
              <input
                aria-label="Enlem"
                type="number"
                min="-90"
                max="90"
                step="0.000001"
                value={latitude ?? ""}
                required={coordinatesRequired}
                onChange={(event) =>
                  onChange(
                    event.target.value === ""
                      ? null
                      : Number(event.target.value),
                    longitude,
                  )
                }
              />
            </label>
            <label>
              Boylam
              <input
                aria-label="Boylam"
                type="number"
                min="-180"
                max="180"
                step="0.000001"
                value={longitude ?? ""}
                required={coordinatesRequired}
                onChange={(event) =>
                  onChange(
                    latitude,
                    event.target.value === ""
                      ? null
                      : Number(event.target.value),
                  )
                }
              />
            </label>
          </div>
        </>
      )}
      <small className="customer-location-coordinates">
        {latitude !== null && longitude !== null
          ? `Seçilen konum: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
          : "Haritada konum seçilmedi."}
      </small>
    </section>
  );
}
