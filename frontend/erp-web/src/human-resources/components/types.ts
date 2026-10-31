export type Employee = {
  id: string
  personnelCode: string
  fullName: string
  department: string | null
  jobTitle: string | null
  employmentCategory: string | null
  workEmail: string | null
  hireDate: string
  terminationDate: string | null
  status: string
  userId: string | null
  rowVersion: string
}

export type EmployeeScreenField = {
  key: string
  label: string
  visible: boolean
  position: number
  fixed?: boolean
  width?: number | null
}

export type Translate = (turkish: string, english: string) => string
