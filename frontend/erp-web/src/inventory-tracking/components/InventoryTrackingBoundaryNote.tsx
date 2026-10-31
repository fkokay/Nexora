import { ShieldCheck } from 'lucide-react'

export default function InventoryTrackingBoundaryNote() {
  return <div className="boundary-note inventory-tracking-boundary"><ShieldCheck size={16} aria-hidden="true"/><span>Bakiye yalnız iz kodu bulunan stok hareketlerinden hesaplanır. Geçmişte konum veya iz kodu kaydedilmemiş hareketler geriye dönük atanmaz.</span></div>
}
