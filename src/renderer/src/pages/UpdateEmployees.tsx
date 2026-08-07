import { FormEvent, useMemo, useState } from 'react'
import { addDoc, collection, deleteDoc, doc, updateDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useCollection } from '../hooks/useCollection'
import { EditableEmployeeFields, EmployeeRole, EmploymentType, WebsiteEmployee } from '../lib/types'
import { showToast } from '../lib/toast'
import RequireAdmin from '../components/RequireAdmin'

const ROLES: EmployeeRole[] = ['Cook', 'Cleaner', 'Security Guard', 'Manager', 'Other']
const EMPLOYMENT_TYPES: EmploymentType[] = ['Permanent', 'Temporary']

const EMPTY_FORM: EditableEmployeeFields = {
  name: '',
  role: 'Cook',
  employmentType: 'Permanent',
  mobileNumber: '',
  salary: 0,
  advanceAmount: 0,
  joiningDate: '',
  permanentAddress: '',
  emergencyContact: '',
  status: 'active',
  specialNotes: ''
}

function todayISODate(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}

export default function UpdateEmployees(): React.JSX.Element {
  const { data: employees } = useCollection<WebsiteEmployee>('employees')

  const [search, setSearch] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<EditableEmployeeFields>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return employees
      .filter(
        (e) =>
          !q ||
          e.name?.toLowerCase().includes(q) ||
          e.role?.toLowerCase().includes(q) ||
          e.mobileNumber?.includes(q)
      )
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [employees, search])

  function openAdd(): void {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setIsOpen(true)
  }

  function openEdit(emp: WebsiteEmployee & { id: string }): void {
    setEditingId(emp.id)
    setForm({
      name: emp.name || '',
      role: emp.role || 'Cook',
      employmentType: emp.employmentType || 'Permanent',
      mobileNumber: emp.mobileNumber || '',
      salary: emp.salary || 0,
      advanceAmount: emp.advanceAmount || 0,
      joiningDate: emp.joiningDate || '',
      permanentAddress: emp.permanentAddress || '',
      emergencyContact: emp.emergencyContact || '',
      status: emp.status || 'active',
      specialNotes: emp.specialNotes || ''
    })
    setIsOpen(true)
  }

  function closeForm(): void {
    setIsOpen(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (!form.name || !form.mobileNumber) {
      showToast('Name and mobile number are required', 'error')
      return
    }

    setSaving(true)
    try {
      const payload = {
        name: form.name,
        role: form.role,
        employmentType: form.employmentType,
        mobileNumber: form.mobileNumber,
        salary: Number(form.salary) || 0,
        advanceAmount: Number(form.advanceAmount) || 0,
        joiningDate: form.joiningDate || todayISODate(),
        permanentAddress: form.permanentAddress || '',
        emergencyContact: form.emergencyContact || '',
        status: form.status,
        specialNotes: form.specialNotes || ''
      }

      if (editingId) {
        await updateDoc(doc(db, 'employees', editingId), payload)
        showToast('Employee updated')
      } else {
        await addDoc(collection(db, 'employees'), payload)
        showToast('Employee added')
      }
      closeForm()
    } catch (err) {
      console.error(err)
      showToast('Save failed: ' + (err as Error).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(emp: WebsiteEmployee & { id: string }): Promise<void> {
    if (!window.confirm(`Remove ${emp.name} from employees? This cannot be undone.`)) return
    try {
      await deleteDoc(doc(db, 'employees', emp.id))
      showToast('Employee removed')
      if (editingId === emp.id) closeForm()
    } catch (err) {
      console.error(err)
      showToast('Delete failed: ' + (err as Error).message, 'error')
    }
  }

  return (
    <RequireAdmin>
      <div className="page-header">
        <h1>Update Employees</h1>
        <p>Adds/edits write directly to the website's live employees database.</p>
      </div>

      <div className="filter-bar card">
        <div className="form-field" style={{ flex: 1 }}>
          <label>Search</label>
          <input
            placeholder="Name, role, mobile…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button className="btn btn-primary" onClick={openAdd}>
          + Add employee
        </button>
      </div>

      {isOpen && (
        <form className="card" onSubmit={handleSubmit} style={{ borderColor: 'var(--primary)' }}>
          <div className="page-header" style={{ marginBottom: 12 }}>
            <h1 style={{ fontSize: 16 }}>{editingId ? 'Edit employee' : 'New employee'}</h1>
          </div>
          <div className="form-grid">
            <div className="form-field">
              <label>Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="form-field">
              <label>Mobile number</label>
              <input
                value={form.mobileNumber}
                onChange={(e) => setForm({ ...form, mobileNumber: e.target.value })}
                required
              />
            </div>

            <div className="form-field">
              <label>Role</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as EmployeeRole })}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label>Employment type</label>
              <select
                value={form.employmentType}
                onChange={(e) => setForm({ ...form, employmentType: e.target.value as EmploymentType })}
              >
                {EMPLOYMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label>Salary (₹/month)</label>
              <input
                type="number"
                value={form.salary}
                onChange={(e) => setForm({ ...form, salary: Number(e.target.value) })}
              />
            </div>
            <div className="form-field">
              <label>Advance taken (₹)</label>
              <input
                type="number"
                value={form.advanceAmount}
                onChange={(e) => setForm({ ...form, advanceAmount: Number(e.target.value) })}
              />
            </div>

            <div className="form-field">
              <label>Joining date</label>
              <input
                type="date"
                value={form.joiningDate}
                onChange={(e) => setForm({ ...form, joiningDate: e.target.value })}
              />
            </div>
            <div className="form-field">
              <label>Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as 'active' | 'inactive' })}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            <div className="form-field">
              <label>Emergency contact</label>
              <input
                value={form.emergencyContact}
                onChange={(e) => setForm({ ...form, emergencyContact: e.target.value })}
              />
            </div>

            <div className="form-field full">
              <label>Permanent address</label>
              <textarea
                rows={2}
                value={form.permanentAddress}
                onChange={(e) => setForm({ ...form, permanentAddress: e.target.value })}
              />
            </div>
            <div className="form-field full">
              <label>Special notes</label>
              <textarea
                rows={2}
                value={form.specialNotes}
                onChange={(e) => setForm({ ...form, specialNotes: e.target.value })}
              />
            </div>
          </div>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : editingId ? 'Save changes' : 'Add employee'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={closeForm}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="card table-scroll">
        {filtered.length === 0 ? (
          <div className="empty-state">No employees match this search.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Type</th>
                <th>Mobile</th>
                <th>Salary</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id} style={{ opacity: e.status === 'inactive' ? 0.55 : 1 }}>
                  <td>{e.name}</td>
                  <td>{e.role}</td>
                  <td>{e.employmentType}</td>
                  <td>{e.mobileNumber || '—'}</td>
                  <td>{e.salary ? `₹${e.salary}` : '—'}</td>
                  <td>{e.status}</td>
                  <td>
                    <button className="btn btn-secondary btn-sm" onClick={() => openEdit(e)}>
                      Edit
                    </button>{' '}
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(e)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </RequireAdmin>
  )
}
