import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { authenticatedFetch } from './authApi';
import './warehouse-locations.css'
import { CreateLocationForm, EditLocationModal } from './warehouse-locations/components/WarehouseLocationForms'
import { WarehouseLocationOverview } from './warehouse-locations/components/WarehouseLocationOverview'
import { LocationBalancePanel, LocationListPanel, ReconciliationPanel } from './warehouse-locations/components/WarehouseLocationPanels'
import type { Balance, Location, Reconciliation, ScreenField, WarehouseRow } from './warehouse-locations/types'

async function request<T>(url: string, token: string, init?: RequestInit): Promise<T> {
  const response = await authenticatedFetch(url, token, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers } })
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string; detail?: string } | null
    throw new Error(body?.error ?? body?.detail ?? `İstek başarısız (${response.status})`)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export default function WarehouseLocationsPage({ token, role }: { token: string; role: string }) {
  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([])
  const [warehouseId, setWarehouseId] = useState('')
  const [locations, setLocations] = useState<Location[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [balances, setBalances] = useState<Balance[]>([])
  const [reconciliation, setReconciliation] = useState<Reconciliation[]>([])
  const [search, setSearch] = useState('')
  const [balanceFields, setBalanceFields] = useState<ScreenField[]>([
    { key: 'stockItemCode', label: 'Stok kodu', visible: true, position: 0 },
    { key: 'stockItemName', label: 'Stok adı', visible: true, position: 1 },
    { key: 'quantity', label: 'Konum miktarı', visible: true, position: 2 },
    { key: 'unitCode', label: 'Birim', visible: true, position: 3 },
  ])
  const [locationFields, setLocationFields] = useState<ScreenField[]>([
    { key: 'code', label: 'Konum kodu', visible: true, position: 0 },
    { key: 'name', label: 'Konum adı', visible: true, position: 1 },
    { key: 'parentLocation', label: 'Üst konum', visible: true, position: 2 },
    { key: 'status', label: 'Durum', visible: true, position: 3 },
    { key: 'actions', label: 'İşlem', visible: true, position: 4, fixed: true },
  ])
  const [reconciliationFields, setReconciliationFields] = useState<ScreenField[]>([
    { key: 'stockItemCode', label: 'Stok kodu', visible: true, position: 0 },
    { key: 'stockItemName', label: 'Stok adı', visible: true, position: 1 },
    { key: 'warehouseQuantity', label: 'Depo bakiyesi', visible: true, position: 2 },
    { key: 'locatedQuantity', label: 'Konumlandırılmış', visible: true, position: 3 },
    { key: 'unlocatedQuantity', label: 'Konumu boş', visible: true, position: 4 },
    { key: 'unitCode', label: 'Birim', visible: true, position: 5 },
  ])
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [parentLocationId, setParentLocationId] = useState('')
  const [editing, setEditing] = useState<Location | null>(null)
  const [editCode, setEditCode] = useState('')
  const [editName, setEditName] = useState('')
  const [editParentLocationId, setEditParentLocationId] = useState('')
  const [editIsActive, setEditIsActive] = useState(true)
  const [warehousesLoading, setWarehousesLoading] = useState(true)
  const [loading, setLoading] = useState(true)
  const [balancesLoading, setBalancesLoading] = useState(false)
  const [balanceError, setBalanceError] = useState('')
  const [reconciliationError, setReconciliationError] = useState('')
  const [reconciliationLoading, setReconciliationLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const locationRequestId = useRef(0)
  const balanceRequestId = useRef(0)
  const reconciliationRequestId = useRef(0)
  const selected = locations.find(location => location.id === selectedId) ?? null
  const filteredLocations = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('tr-TR')
    if (!term) return locations
    return locations.filter(location => {
      const parentCode = locations.find(row => row.id === location.parentLocationId)?.code ?? ''
      return `${location.code} ${location.name} ${parentCode}`.toLocaleLowerCase('tr-TR').includes(term)
    })
  }, [locations, search])
  const visibleBalanceFields = useMemo(() => balanceFields.filter(field => field.visible).sort((a, b) => a.position - b.position), [balanceFields])
  const visibleLocationFields = useMemo(() => locationFields.filter(field => field.visible).sort((a, b) => a.position - b.position), [locationFields])
  const visibleReconciliationFields = useMemo(() => reconciliationFields.filter(field => field.visible).sort((a, b) => a.position - b.position), [reconciliationFields])

  const loadWarehouses = useCallback(async () => {
    setError('')
    setWarehousesLoading(true)
    try {
      const rows = await request<WarehouseRow[]>('/api/warehouses/', token)
      setWarehouses(rows)
      setWarehouseId(current => current || rows.find(row => row.isActive)?.id || '')
    } catch (e) { setError((e as Error).message) }
    finally { setWarehousesLoading(false) }
  }, [token])

  const loadLocations = useCallback(async () => {
    const requestId = ++locationRequestId.current
    if (!warehouseId) { setLocations([]); setSelectedId(''); setBalances([]); setLoading(false); return }
    setLoading(true); setError('')
    try {
      const rows = await request<Location[]>(`/api/warehouses/${warehouseId}/locations`, token)
      if (requestId === locationRequestId.current) {
        setLocations(rows)
        setSelectedId(current => rows.some(row => row.id === current) ? current : rows.find(row => row.isActive)?.id ?? '')
      }
    } catch (e) { if (requestId === locationRequestId.current) setError((e as Error).message) }
    finally { if (requestId === locationRequestId.current) setLoading(false) }
  }, [token, warehouseId])

  const loadBalances = useCallback(async (locationId: string) => {
    const requestId = ++balanceRequestId.current
    if (!warehouseId || !locationId) { setBalances([]); setBalanceError(''); setBalancesLoading(false); return }
    setBalances([]); setBalancesLoading(true); setBalanceError('')
    try {
      const result = await request<{ items: Balance[] }>(`/api/warehouses/${warehouseId}/locations/${locationId}/balances`, token)
      if (requestId === balanceRequestId.current) setBalances(result.items)
    } catch (e) { if (requestId === balanceRequestId.current) setBalanceError((e as Error).message) }
    finally { if (requestId === balanceRequestId.current) setBalancesLoading(false) }
  }, [token, warehouseId])

  const loadReconciliation = useCallback(async () => {
    const requestId = ++reconciliationRequestId.current
    if (!warehouseId) { setReconciliation([]); setReconciliationError(''); setReconciliationLoading(false); return }
    setReconciliation([]); setReconciliationLoading(true); setReconciliationError('')
    try {
      const result = await request<{ items: Reconciliation[] }>(`/api/warehouses/${warehouseId}/location-reconciliation`, token)
      if (requestId === reconciliationRequestId.current) setReconciliation(result.items)
    } catch (e) { if (requestId === reconciliationRequestId.current) setReconciliationError((e as Error).message) }
    finally { if (requestId === reconciliationRequestId.current) setReconciliationLoading(false) }
  }, [token, warehouseId])

  useEffect(() => { void loadWarehouses() }, [loadWarehouses])
  useEffect(() => { void loadLocations() }, [loadLocations])
  useEffect(() => { void loadBalances(selectedId) }, [loadBalances, selectedId])
  useEffect(() => { void loadReconciliation() }, [loadReconciliation])
  useEffect(() => {
    let cancelled = false
    void request<{ fields: ScreenField[] }>('/api/screen-views/warehouse-location-balances/active', token)
      .then(view => { if (!cancelled && view.fields?.length) setBalanceFields(view.fields) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [token])
  useEffect(() => {
    let cancelled = false
    void request<{ fields: ScreenField[] }>('/api/screen-views/inventory-warehouse-locations/active', token)
      .then(view => { if (!cancelled && view.fields?.length) setLocationFields(view.fields) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [token])
  useEffect(() => {
    let cancelled = false
    void request<{ fields: ScreenField[] }>('/api/screen-views/inventory-warehouse-reconciliation/active', token)
      .then(view => { if (!cancelled && view.fields?.length) setReconciliationFields(view.fields) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [token])
  useEffect(() => {
    if (!editing) return
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) setEditing(null)
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [editing, busy])

  async function refresh() {
    await loadWarehouses()
    await loadLocations()
    if (selectedId) await loadBalances(selectedId)
    await loadReconciliation()
  }

  async function createLocation(event: FormEvent) {
    event.preventDefault()
    if (!warehouseId) return
    setBusy(true); setError(''); setNotice('')
    try {
      const created = await request<Location>(`/api/warehouses/${warehouseId}/locations`, token, { method: 'POST', body: JSON.stringify({ code, name, parentLocationId: parentLocationId || null }) })
      setLocations(current => [...current, created].sort((a, b) => a.code.localeCompare(b.code, 'tr')))
      setSelectedId(created.id); setCode(''); setName(''); setParentLocationId(''); setSearch('')
      setNotice('Depo konumu oluşturuldu.')
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }

  function beginEdit(location: Location) {
    setEditing(location); setEditCode(location.code); setEditName(location.name); setEditParentLocationId(location.parentLocationId ?? ''); setEditIsActive(location.isActive)
  }

  async function saveLocation(event: FormEvent) {
    event.preventDefault()
    if (!editing) return
    setBusy(true); setError(''); setNotice('')
    try {
      const updated = await request<Location>(`/api/warehouses/${warehouseId}/locations/${editing.id}`, token, { method: 'PUT', body: JSON.stringify({ code: editCode, name: editName, parentLocationId: editParentLocationId || null, isActive: editIsActive, rowVersion: editing.rowVersion }) })
      setLocations(current => current.map(row => row.id === updated.id ? updated : row).sort((a, b) => a.code.localeCompare(b.code, 'tr')))
      setEditing(null)
      setNotice('Depo konumu güncellendi.')
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }

  return <div className="warehouse-locations-page">
    <WarehouseLocationOverview
      warehouses={warehouses}
      warehouseId={warehouseId}
      locations={locations}
      selected={selected}
      balanceCount={balances.length}
      warehousesLoading={warehousesLoading}
      loading={loading}
      balancesLoading={balancesLoading}
      reconciliationLoading={reconciliationLoading}
      error={error}
      notice={notice}
      onRefresh={() => void refresh()}
      onDismissError={() => setError('')}
      onDismissNotice={() => setNotice('')}
      onWarehouseSelect={nextWarehouseId => {
        setWarehouseId(nextWarehouseId)
        setSelectedId('')
        setLocations([])
        setBalances([])
        setBalanceError('')
        setLoading(Boolean(nextWarehouseId))
        setSearch('')
      }}
    />
    <div className="warehouse-location-layout">
      <LocationListPanel
        locations={locations}
        filteredLocations={filteredLocations}
        visibleFields={visibleLocationFields}
        selectedId={selectedId}
        search={search}
        loading={loading}
        warehouseId={warehouseId}
        busy={busy}
        role={role}
        onSearchChange={setSearch}
        onSelect={setSelectedId}
        onEdit={beginEdit}
      />
      <LocationBalancePanel
        selected={selected}
        locations={locations}
        balances={balances}
        visibleFields={visibleBalanceFields}
        loading={balancesLoading}
        error={balanceError}
        role={role}
        busy={busy}
        onEdit={beginEdit}
      />
    </div>
    <ReconciliationPanel rows={reconciliation} visibleFields={visibleReconciliationFields} loading={reconciliationLoading} error={reconciliationError}/>
    {role === 'TenantAdmin' && <CreateLocationForm
      locations={locations}
      warehouseId={warehouseId}
      code={code}
      name={name}
      parentLocationId={parentLocationId}
      busy={busy}
      onCodeChange={setCode}
      onNameChange={setName}
      onParentChange={setParentLocationId}
      onSubmit={event => void createLocation(event)}
    />}
    {editing && <EditLocationModal
      editing={editing}
      locations={locations}
      editCode={editCode}
      editName={editName}
      editParentLocationId={editParentLocationId}
      editIsActive={editIsActive}
      busy={busy}
      onEditCodeChange={setEditCode}
      onEditNameChange={setEditName}
      onEditParentChange={setEditParentLocationId}
      onEditIsActiveChange={setEditIsActive}
      onClose={() => setEditing(null)}
      onSubmit={event => void saveLocation(event)}
    />}
  </div>
}
