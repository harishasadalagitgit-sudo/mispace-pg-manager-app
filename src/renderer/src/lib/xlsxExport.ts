import * as XLSX from 'xlsx'
import { collection, getDocs } from 'firebase/firestore'
import { db } from './firebase'
import {
  WebsiteEmployee,
  WebsiteExpense,
  WebsiteIncomingPayment,
  WebsiteResident,
  WebsiteRoom
} from './types'

function todayISODate(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}

async function fetchAll<T>(collectionName: string): Promise<(T & { id: string })[]> {
  const snap = await getDocs(collection(db, collectionName))
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as T) }))
}

export async function exportFullBackup(): Promise<{ ok: boolean; path?: string }> {
  const [residents, rooms, expenses, income, employees] = await Promise.all([
    fetchAll<WebsiteResident>('residents'),
    fetchAll<WebsiteRoom>('rooms'),
    fetchAll<WebsiteExpense>('expenses'),
    fetchAll<WebsiteIncomingPayment>('incomingPayments'),
    fetchAll<WebsiteEmployee>('employees')
  ])

  const wb = XLSX.utils.book_new()

  const residentRows = residents.map((r) => ({
    Name: r.name,
    Room: r.roomNum,
    Bed: r.bedNum ?? '',
    Mobile: r.mobileNumber || '',
    WhatsApp: r.whatsappNumber || '',
    DOB: r.dob || '',
    'Joining Date': r.joiningDate || '',
    Rent: r.rentAmount || 0,
    'Security Deposit': r.securityDeposit || 0,
    Balance: r.balanceAmount || 0,
    Address: r.permanentAddress || '',
    'Company/College': r.currentWorkingCompanyOrCollege || '',
    Parents: r.parentsInformation || '',
    'Emergency Contact': r.emergencyContact || '',
    Notes: r.specialNotes || ''
  }))

  const roomRows = rooms.map((r) => ({
    Room: r.roomNum,
    Floor: r.floor,
    Capacity: r.capacity,
    Occupied: r.occupiedCount,
    Status: r.status
  }))

  const expenseRows = expenses.map((e) => ({
    Date: e.dateOfPayment,
    Type: e.expenseType,
    Title: e.title,
    Recipient: e.recipient,
    'Recipient Company': e.recipientCompany || '',
    Amount: e.amount,
    'Balance Pending': e.balancePending || 0,
    Mode: e.paidInCash ? 'Cash' : 'Online',
    'Transaction No.': e.transactionNumber || '',
    'Paid By': e.paidBy,
    Notes: e.notes || ''
  }))

  const incomeRows = income.map((i) => ({
    Date: i.paymentDate,
    Type: i.paymentType,
    Title: i.title,
    Payee: i.payee,
    Resident: i.residentName,
    Room: i.roomNum,
    Bed: i.bedNum ?? '',
    Amount: i.amount,
    'Balance Pending': i.balancePending || 0,
    Mode: i.paidInCash ? 'Cash' : 'Online',
    'Transaction No.': i.transactionNumber || '',
    Notes: i.notes || ''
  }))

  const employeeRows = employees.map((e) => ({
    Name: e.name,
    Role: e.role,
    Type: e.employmentType,
    Mobile: e.mobileNumber || '',
    Salary: e.salary || 0,
    Advance: e.advanceAmount || 0,
    'Joining Date': e.joiningDate || '',
    Status: e.status,
    Address: e.permanentAddress || '',
    'Emergency Contact': e.emergencyContact || '',
    Notes: e.specialNotes || ''
  }))

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(residentRows), 'Residents')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(roomRows), 'Rooms')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(expenseRows), 'Expenses')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(incomeRows), 'Income')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(employeeRows), 'Employees')

  const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  return window.api.exportBinary(new Uint8Array(buffer), `mispace-pg-export-${todayISODate()}.xlsx`)
}
