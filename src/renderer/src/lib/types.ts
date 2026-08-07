// ── Types read from the website's existing Firestore collections ──────────
// (mirrors src/types.ts in the paying-guest-manager-2026 repo)

export interface WebsiteRoom {
  id: string
  roomNum: string
  floor: number
  capacity: number
  occupiedCount: number
  status: 'vacant' | 'partially-occupied' | 'fully-occupied'
}

export interface WebsiteResident {
  id: string
  name: string
  roomNum: string
  bedNum?: number
  mobileNumber?: string
  whatsappNumber?: string
  joiningDate?: string
  dob?: string
  balanceAmount?: number
  rentAmount?: number
  securityDeposit?: number
  permanentAddress?: string
  currentWorkingCompanyOrCollege?: string
  parentsInformation?: string
  emergencyContact?: string
  specialNotes?: string
}

// Fields the desktop app can create/edit for a resident. Deliberately excludes
// photo/idsJson/paymentHistoryJson — those stay website-only (camera capture,
// ID uploads, payment history) and are left untouched on edit.
export interface EditableResidentFields {
  name: string
  mobileNumber: string
  whatsappNumber: string
  roomNum: string
  bedNum: number | null
  dob: string
  joiningDate: string
  balanceAmount: number
  rentAmount: number
  securityDeposit: number
  permanentAddress: string
  currentWorkingCompanyOrCollege: string
  parentsInformation: string
  emergencyContact: string
  specialNotes: string
}

// Snapshot of a resident's record, kept for history when they move out.
// Written to the `vacatedResidents` collection right before the live
// `residents` doc is deleted. Deliberately its own shape (not extending
// WebsiteResident) so its `id` is always the vacated-record's own doc id,
// never confused with the original resident's id.
export interface VacatedResident {
  originalResidentId: string
  name: string
  roomNum: string
  bedNum?: number
  mobileNumber?: string
  whatsappNumber?: string
  joiningDate?: string
  dob?: string
  balanceAmount?: number
  rentAmount?: number
  securityDeposit?: number
  permanentAddress?: string
  currentWorkingCompanyOrCollege?: string
  parentsInformation?: string
  emergencyContact?: string
  specialNotes?: string
  vacatedAt: string
  vacatedBy: string
  reason: string
}

// A reservation — someone who paid an advance and is holding a room/bed but
// hasn't moved in yet. Kept in its own `bookings` collection, separate from
// `residents`, until they actually arrive (converted to a resident) or back
// out (cancelled).
export type BookingStatus = 'pending' | 'moved-in' | 'cancelled'

export interface Booking {
  id: string
  name: string
  mobileNumber: string
  roomNum?: string
  bedNum?: number
  expectedJoiningDate: string
  advanceAmount: number
  rentAmount: number
  notes?: string
  bookedBy: string
  bookedAt: string
  status: BookingStatus
}

export interface EditableBookingFields {
  name: string
  mobileNumber: string
  roomNum: string
  bedNum: number | null
  expectedJoiningDate: string
  advanceAmount: number
  rentAmount: number
  notes: string
}

export type EmployeeRole = 'Cook' | 'Cleaner' | 'Security Guard' | 'Manager' | 'Other'
export type EmploymentType = 'Permanent' | 'Temporary'

export interface WebsiteEmployee {
  id: string
  name: string
  role: EmployeeRole
  employmentType: EmploymentType
  mobileNumber?: string
  salary?: number
  advanceAmount?: number
  joiningDate?: string
  permanentAddress?: string
  emergencyContact?: string
  status: 'active' | 'inactive'
  specialNotes?: string
}

// Fields the desktop app can create/edit for an employee. Excludes
// photo/idsJson — those stay website-only (camera capture, ID uploads).
export interface EditableEmployeeFields {
  name: string
  role: EmployeeRole
  employmentType: EmploymentType
  mobileNumber: string
  salary: number
  advanceAmount: number
  joiningDate: string
  permanentAddress: string
  emergencyContact: string
  status: 'active' | 'inactive'
  specialNotes: string
}

// Visitor enquiries submitted from the website's public enquiry form.
// Read-only on the desktop app — managed (status updates) only on the website.
export interface WebsiteEnquiry {
  id: string
  name: string
  email: string
  phone: string
  companyCollege: string
  expectedJoiningDate: string
  sharingInterest: '4room share' | '5room share'
  submittedAt: string
  status: 'Pending' | 'Contacted' | 'Closed' | 'Elapsed'
}

export type WebsiteExpenseType =
  | 'Employee Salaries'
  | 'Grocery Bills'
  | 'Utility Bills'
  | 'Vegetables'
  | 'Repairs'
  | 'Advance Return'
  | 'Others'

export interface WebsiteExpense {
  title: string
  expenseType: WebsiteExpenseType
  recipient: string
  recipientCompany: string
  dateOfPayment: string
  timeOfPayment: string
  amount: number
  balancePending: number
  transactionNumber: string
  paidInCash: boolean
  recipientPhone: string
  paidBy: string
  notes?: string
}

export type WebsiteIncomingPaymentType =
  | 'Hostel Resident Monthly'
  | 'Hotel Payment'
  | 'Temporary Accommodation Payment'
  | 'Others'

export interface WebsiteIncomingPayment {
  title: string
  paymentType: WebsiteIncomingPaymentType
  paymentDate: string
  payee: string
  paidInCash: boolean
  transactionNumber: string
  phonePayNumber: string
  residentName: string
  roomNum: string
  bedNum?: number
  amount: number
  balancePending: number
  notes?: string
}

// ── Desktop-only staging collections ────────────────────────────────────────
// Entries live here until a reviewer approves them; approval copies a mapped
// record into the website's live `incomingPayments` / `expenses` collections.

export type EntryStatus = 'pending' | 'approved' | 'rejected'
export type PaymentMode = 'Cash' | 'Online'

export interface DeskIncomeEntry {
  id?: string
  date: string // YYYY-MM-DD, date the payment was received
  amount: number
  roomNum: string
  bedNum: number
  rentMonth: string // YYYY-MM, month the rent covers — or "Advance" when isAdvance is true
  isAdvance?: boolean // advance/security deposit — excluded from rent-balance math
  paymentMode: PaymentMode
  onlineReference?: string
  paidTo: string // staff member who received the payment
  paidBy: string // resident who paid
  remarks?: string
  enteredBy: string
  enteredAt: string // ISO timestamp
  status: EntryStatus
  reviewedBy?: string
  reviewedAt?: string
  reviewNotes?: string
  linkedIncomingPaymentId?: string
}

export const EXPENSE_CATEGORIES = [
  'Grocery',
  'Vegetable shop',
  'Meat',
  'Eggs',
  'Gas bill',
  'Electric bill',
  'Internet bill',
  'Grocery-Uday',
  'Rice bags',
  'Rent',
  'Chapathis',
  'Curd',
  'Hardware shop',
  'Service charges',
  'Delivery charges',
  'Salary',
  'Others'
] as const

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]

export interface DeskExpenseEntry {
  id?: string
  date: string // YYYY-MM-DD
  category: ExpenseCategory
  amount: number
  paidTo: string
  paidBy: string
  paymentMode: PaymentMode
  onlineReference?: string
  remarks?: string
  enteredBy: string
  enteredAt: string
  status: EntryStatus
  reviewedBy?: string
  reviewedAt?: string
  reviewNotes?: string
  linkedExpenseId?: string
}

// ── Monthly recurring-expense checklist ─────────────────────────────────────
// A reminder list (not tied to actual income/expense records) so Admin and
// Supervisor don't forget recurring monthly payments. One Firestore doc per
// month, doc id = the month string itself (e.g. "2026-08").

export const CHECKLIST_ITEMS = [
  'Salary to manager paid?',
  'Salary to chef paid?',
  'Salary to cleaners',
  'Salary to washroom cleaners',
  'Salary to other labour paid?',
  'Electricity bill paid?',
  'Internet bill paid?',
  'Rice bags bill included?',
  'Monthly Groceries bill added?',
  'Curd bill added?',
  'Chapathi order bills added?',
  'Vegetable bills added?',
  'Gas bills reviewed?',
  'Meat and Eggs bills included?',
  'Biriyani bills included?',
  'Toilet cleaner bills included?',
  'Paneer bill added?',
  'Amazon bills included?',
  'Other bills covered?',
  'Building rent paid?'
] as const

export type ChecklistItemName = (typeof CHECKLIST_ITEMS)[number]

// Keyword(s) to search for in that month's expense records (category, paid
// to/by, remarks/notes — all lowercased) when verifying a checklist item.
// "Other bills covered?" has no keyword — it's verified by category === 'Others' instead.
export const CHECKLIST_ITEM_KEYWORDS: Partial<Record<ChecklistItemName, string[]>> = {
  'Salary to manager paid?': ['manager'],
  'Salary to chef paid?': ['chef'],
  'Salary to cleaners': ['cleaner'],
  'Salary to washroom cleaners': ['washroom'],
  'Salary to other labour paid?': ['labour', 'labor'],
  'Electricity bill paid?': ['electric'],
  'Internet bill paid?': ['internet'],
  'Rice bags bill included?': ['rice'],
  'Monthly Groceries bill added?': ['grocery', 'groceries'],
  'Curd bill added?': ['curd'],
  'Chapathi order bills added?': ['chapathi', 'chapati'],
  'Vegetable bills added?': ['vegetable'],
  'Gas bills reviewed?': ['gas'],
  'Meat and Eggs bills included?': ['meat', 'egg'],
  'Biriyani bills included?': ['biriyani'],
  'Toilet cleaner bills included?': ['toilet'],
  'Paneer bill added?': ['paneer'],
  'Amazon bills included?': ['amazon'],
  'Building rent paid?': ['rent']
}

export interface ChecklistItemStatus {
  checked: boolean
  checkedBy?: string
  checkedAt?: string
}

export interface MonthlyChecklist {
  id?: string // = month, "YYYY-MM"
  month: string
  items: Partial<Record<string, ChecklistItemStatus>>
}
