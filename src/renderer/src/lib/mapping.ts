import {
  DeskExpenseEntry,
  DeskIncomeEntry,
  ExpenseCategory,
  WebsiteExpense,
  WebsiteExpenseType,
  WebsiteIncomingPayment
} from './types'

// The website's ExpenseType enum is coarser than our category list, so we
// bucket each desktop category into the closest existing website type.
// The exact desktop category text is preserved in `title` / `notes` so no
// detail is lost.
const CATEGORY_TO_WEBSITE_TYPE: Record<ExpenseCategory, WebsiteExpenseType> = {
  Grocery: 'Grocery Bills',
  'Vegetable shop': 'Vegetables',
  Meat: 'Grocery Bills',
  Eggs: 'Grocery Bills',
  'Gas bill': 'Utility Bills',
  'Electric bill': 'Utility Bills',
  'Internet bill': 'Utility Bills',
  'Grocery-Uday': 'Grocery Bills',
  'Rice bags': 'Grocery Bills',
  Rent: 'Others',
  Chapathis: 'Grocery Bills',
  Curd: 'Grocery Bills',
  'Hardware shop': 'Repairs',
  'Service charges': 'Others',
  'Delivery charges': 'Others',
  Salary: 'Employee Salaries',
  Others: 'Others'
}

export function expenseToWebsiteRecord(entry: DeskExpenseEntry): WebsiteExpense {
  const now = new Date()
  const timeOfPayment = `${String(now.getHours()).padStart(2, '0')}:${String(
    now.getMinutes()
  ).padStart(2, '0')}`

  return {
    title: entry.category,
    expenseType: CATEGORY_TO_WEBSITE_TYPE[entry.category],
    recipient: entry.paidTo,
    recipientCompany: '',
    dateOfPayment: entry.date,
    timeOfPayment,
    amount: entry.amount,
    balancePending: 0,
    transactionNumber: entry.paymentMode === 'Online' ? entry.onlineReference || '' : '',
    paidInCash: entry.paymentMode === 'Cash',
    recipientPhone: '',
    paidBy: entry.paidBy,
    notes: [`Category: ${entry.category}`, entry.remarks].filter(Boolean).join(' — ')
  }
}

export function incomeToWebsiteRecord(entry: DeskIncomeEntry): WebsiteIncomingPayment {
  if (entry.isAdvance) {
    return {
      title: `${entry.paidBy} — Room ${entry.roomNum} / Bed ${entry.bedNum} Advance / Security Deposit`,
      paymentType: 'Others',
      paymentDate: entry.date,
      payee: entry.paidTo,
      paidInCash: entry.paymentMode === 'Cash',
      transactionNumber: entry.paymentMode === 'Online' ? entry.onlineReference || '' : '',
      phonePayNumber: '',
      residentName: entry.paidBy,
      roomNum: entry.roomNum,
      bedNum: entry.bedNum,
      amount: entry.amount,
      balancePending: 0,
      notes: ['Advance / security deposit (returnable, not rent)', entry.remarks]
        .filter(Boolean)
        .join(' — ')
    }
  }

  return {
    title: `${entry.paidBy} — Room ${entry.roomNum} / Bed ${entry.bedNum} Rent (${entry.rentMonth})`,
    paymentType: 'Hostel Resident Monthly',
    paymentDate: entry.date,
    payee: entry.paidTo,
    paidInCash: entry.paymentMode === 'Cash',
    transactionNumber: entry.paymentMode === 'Online' ? entry.onlineReference || '' : '',
    phonePayNumber: '',
    residentName: entry.paidBy,
    roomNum: entry.roomNum,
    bedNum: entry.bedNum,
    amount: entry.amount,
    balancePending: 0,
    notes: [`Rent month: ${entry.rentMonth}`, entry.remarks].filter(Boolean).join(' — ')
  }
}
