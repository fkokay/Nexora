import React, { useEffect, useState } from 'react'
import { api } from './erpApi'
import type * as AppTypes from './erp-types'
import { CustomerLocationDefinitionsFeedback } from './customer-location-definitions/components/CustomerLocationDefinitionsFeedback'
import { CustomerLocationDefinitionsHeader } from './customer-location-definitions/components/CustomerLocationDefinitionsHeader'
import { DistrictSection } from './customer-location-definitions/components/DistrictSection'
import { ProvinceSection } from './customer-location-definitions/components/ProvinceSection'
type CustomerLocationDefinitions=AppTypes.CustomerLocationDefinitions
type CustomerLocationProvinceView=AppTypes.CustomerLocationProvinceView
type TurkeyDistrictOption=AppTypes.TurkeyDistrictOption
type TurkeyLocationOption=AppTypes.TurkeyLocationOption

export function CustomerLocationDefinitionsPage({token}:{token:string}) {
  const [definitions,setDefinitions]=useState<CustomerLocationDefinitions>({provinces:[],districts:[]})
  const [selectedProvinceId,setSelectedProvinceId]=useState(0)
  const [provinceEditingId,setProvinceEditingId]=useState<number|null>(null),[provinceName,setProvinceName]=useState(''),[provinceActive,setProvinceActive]=useState(true)
  const [districtEditingId,setDistrictEditingId]=useState<number|null>(null),[districtProvinceId,setDistrictProvinceId]=useState(''),[districtName,setDistrictName]=useState(''),[districtActive,setDistrictActive]=useState(true),[districtQuery,setDistrictQuery]=useState('')
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
  async function load(){setLoading(true);try{const data=await api<CustomerLocationDefinitions>('/api/location-definitions/admin',token);setDefinitions(data);setSelectedProvinceId(current=>data.provinces.some(item=>item.id===current)?current:(data.provinces[0]?.id??0))}catch(e){setError((e as Error).message)}finally{setLoading(false)}}
  useEffect(()=>{void load()},[token])
  function resetProvince(){setProvinceEditingId(null);setProvinceName('');setProvinceActive(true)}
  function resetDistrict(provinceId=selectedProvinceId){setDistrictEditingId(null);setDistrictName('');setDistrictActive(true);setDistrictProvinceId(provinceId?String(provinceId):'')}
  async function saveProvince(event:React.FormEvent){event.preventDefault();setBusy(true);setError('');setNotice('');try{const result=await api<CustomerLocationProvinceView>(provinceEditingId?`/api/location-definitions/provinces/${provinceEditingId}`:'/api/location-definitions/provinces',token,{method:provinceEditingId?'PUT':'POST',body:JSON.stringify({name:provinceName,isActive:provinceActive})});setNotice(provinceEditingId?'İl tanımı güncellendi.':'İl tanımı oluşturuldu.');setSelectedProvinceId(result.id);resetProvince();await load()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
  async function saveDistrict(event:React.FormEvent){event.preventDefault();setBusy(true);setError('');setNotice('');try{const result=await api<TurkeyDistrictOption>(districtEditingId?`/api/location-definitions/districts/${districtEditingId}`:'/api/location-definitions/districts',token,{method:districtEditingId?'PUT':'POST',body:JSON.stringify({provinceId:Number(districtProvinceId),name:districtName,isActive:districtActive})});setNotice(districtEditingId?'İlçe tanımı güncellendi.':'İlçe tanımı oluşturuldu.');setSelectedProvinceId(result.provinceId);resetDistrict(result.provinceId);await load()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
  async function toggleProvince(item:TurkeyLocationOption){setBusy(true);setError('');try{await api<CustomerLocationProvinceView>(`/api/location-definitions/provinces/${item.id}`,token,{method:'PUT',body:JSON.stringify({name:item.name,isActive:!item.isActive})});setNotice(item.isActive?'İl tanımı pasife alındı.':'İl tanımı etkinleştirildi.');await load()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
  async function toggleDistrict(item:TurkeyDistrictOption){setBusy(true);setError('');try{await api<TurkeyDistrictOption>(`/api/location-definitions/districts/${item.id}`,token,{method:'PUT',body:JSON.stringify({provinceId:item.provinceId,name:item.name,isActive:!item.isActive})});setNotice(item.isActive?'İlçe tanımı pasife alındı.':'İlçe tanımı etkinleştirildi.');await load()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
  const selectedProvince=definitions.provinces.find(item=>item.id===selectedProvinceId)
  const visibleDistricts=definitions.districts.filter(item=>item.provinceId===selectedProvinceId&&item.name.toLocaleLowerCase('tr-TR').includes(districtQuery.toLocaleLowerCase('tr-TR')))
  return <div className="customer-location-definitions-page">
    <CustomerLocationDefinitionsHeader/>
    <CustomerLocationDefinitionsFeedback error={error} notice={notice} onDismissError={()=>setError('')} onDismissNotice={()=>setNotice('')}/>
    <ProvinceSection
      provinces={definitions.provinces}
      districts={definitions.districts}
      selectedProvinceId={selectedProvinceId}
      loading={loading}
      busy={busy}
      editingId={provinceEditingId}
      name={provinceName}
      active={provinceActive}
      onSelect={id=>{setSelectedProvinceId(id);setDistrictProvinceId(String(id))}}
      onEdit={item=>{setProvinceEditingId(item.id);setProvinceName(item.name);setProvinceActive(item.isActive)}}
      onToggle={item=>void toggleProvince(item)}
      onNameChange={setProvinceName}
      onActiveChange={setProvinceActive}
      onSubmit={saveProvince}
      onCancel={resetProvince}
    />
    <DistrictSection
      provinces={definitions.provinces}
      districts={visibleDistricts}
      loading={loading}
      busy={busy}
      editingId={districtEditingId}
      provinceId={districtProvinceId||String(selectedProvinceId||'')}
      name={districtName}
      active={districtActive}
      title={selectedProvince?`${selectedProvince.name} ilçeleri`:'İlçeler'}
      resultCount={visibleDistricts.length}
      query={districtQuery}
      onProvinceIdChange={setDistrictProvinceId}
      onNameChange={setDistrictName}
      onActiveChange={setDistrictActive}
      onSubmit={saveDistrict}
      onCancel={()=>resetDistrict()}
      onQueryChange={setDistrictQuery}
      onEdit={item=>{setDistrictEditingId(item.id);setDistrictProvinceId(String(item.provinceId));setDistrictName(item.name);setDistrictActive(item.isActive)}}
      onToggle={item=>void toggleDistrict(item)}
    />
  </div>
}
