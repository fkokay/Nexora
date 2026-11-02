# GİB e-Beyanname source schemas (release 133.0)

**Official kit:** GİB e-Beyanname Uygulama Hazırlama Kılavuzu, release 133.0, published 2026-10-02. The kit is for software producers that generate XML packages for e-Beyanname. Source page: <https://ebeyanname.gib.gov.tr/ebeyannameHazirlamaKilavuzu.html>. The official kit archive is <https://ebeyanname.gib.gov.tr/UygulamaHazirlamaKilavuzu.zip>.

The selected source files are the Muhtasar ve Prim Hizmet schemas for 1003A (`MUHSGK_21`) and 1003B (`MUHSGK2_12`), their code lists, and the shared `EBYN.xsd` included by both schemas. They were extracted from the official release 133.0 archive. The schema package alone does not establish that a particular employer is eligible for 1003A or 1003B, nor that a tenant's mapping is correct.

| File | Archive timestamp | SHA-256 |
|---|---:|---|
| `MUHSGK_21.xsd` | 2025-09-30 14:04:10 +03:00 | `6A9DD99FF3EB287586452E27BE66B10A2673A51E620BD9A4527824AB4414F542` |
| `MUHSGK_21_Kodlar.xml` | 2025-09-30 14:04:10 +03:00 | `4421F5565762779C9980F3C63F9FA7E5ED3F5BEE1E84BB3806E8E80FAC4E76B7` |
| `MUHSGK2_12.xsd` | 2025-10-01 15:00:54 +03:00 | `E730F452994735F11FC122C78D471BAF362B4F602D65DD7CD706012D9BCCD438` |
| `MUHSGK2_12_Kodlar.xml` | 2025-10-01 15:00:54 +03:00 | `4C71F1F303A981FFE525CC8E712DD6B7809BEBDC5C3C81BA838F8279787102` |
| `EBYN.xsd` | 2026-06-30 16:20:54 +03:00 | `73D78DA9AA818FEA4ABC9BBC0656E068340F4CC8F48A3EA0BA6A16CFD84DA378` |

`MUHSGK_21.xsd` and `MUHSGK2_12.xsd` include `EBYN.xsd`; keep the files together when validating. The XML schemas cover structure and data types. GİB's business checks, employer's tax office/branch and period profile, current workplace registration details, employee declaration fields, and the company's payroll item mappings must also be supplied and validated. The archived user guides dated 2020 are not treated as the current schema authority. No production payload or legal filing is generated from this source bundle by itself.

## Source verification

- GİB's current e-Beyanname developer page lists release 133.0 dated 2026-10-02 and describes it as the integration guide for software producers.
- GİB's Muhtasar ve Prim Hizmet page lists the 1003A and 1003B form guides: <https://ebeyanname.gib.gov.tr/mphb.html>.
- The checked-in files are byte-for-byte extracted from the release 133.0 official ZIP; hashes above allow re-verification.
