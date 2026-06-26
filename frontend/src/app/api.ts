const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const TOKEN_KEY = 'token'

export interface User {
  id: number
  email: string
  first_name: string
  last_name: string
  role: string
  created_at?: string
}

export interface Certificate {
  id: number
  serial_number: string
  common_name: string
  organization?: string
  type: 'ROOT' | 'INTERMEDIATE' | 'SERVER' | 'CLIENT'
  status: 'VALID' | 'REVOKED' | 'EXPIRED'
  not_before?: string
  not_after?: string
  pem_data?: string
  revoked_at?: string
  revocation_reason?: string
  user_id?: number
  owner_first_name?: string
  owner_last_name?: string
  owner_email?: string
  has_private_key?: boolean
}

export interface CertRequest {
  id: number
  common_name: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  created_at: string
  csr_pem_data?: string
  user_id?: number
  owner_first_name?: string
  owner_last_name?: string
  owner_email?: string
}

export interface SignedDocument {
  id: number
  user_id: number
  certificate_id: number
  file_name: string
  mime_type?: string
  document_hash: string
  signed_at?: string
  created_at: string
}

export interface VerifySignatureResult {
  valid: boolean
  hash_matches: boolean
  signature_valid: boolean
  timestamp_valid?: boolean | null
  certificate_status_valid: boolean
  certificate_time_valid: boolean
  signed_document_id?: number
  signed_at?: string
  file_name: string
  message: string
  certificate: {
    id?: number | null
    common_name?: string
    serial_number: string
    owner_email?: string
    status: string
    not_before?: string
    not_after?: string
  }
}

export interface SignaturePackage {
  format: string
  signed_document_id: number
  file_name: string
  document_hash_sha256: string
  signature_hex: string
  certificate_pem: string
  certificate_serial_number: string
  certificate_common_name?: string
  certificate_owner_email?: string
  signed_at?: string
  timestamp_signature_hex?: string
}

export interface AuditLogActor {
  id?: number | null
  email?: string | null
  first_name?: string | null
  last_name?: string | null
  role?: string | null
  display_name?: string | null
}

export interface AuditLogEntry {
  id: number
  action: string
  created_at: string
  resource_type?: string
  resource_id?: string
  target_label?: string
  summary?: string
  metadata?: Record<string, unknown>
  actor: AuditLogActor
}

function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(TOKEN_KEY)
}

function setStoredToken(token: string) {
  if (typeof window === 'undefined') return
  localStorage.setItem(TOKEN_KEY, token)
}

function clearStoredToken() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(TOKEN_KEY)
}

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getStoredToken()

  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers || {}),
    },
    ...options,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Błąd serwera')
  }

  return res.json()
}

async function reqForm<T>(path: string, form: FormData): Promise<T> {
  const token = getStoredToken()

  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Błąd serwera')
  }

  return res.json()
}

export function saveSignaturePackage(pkg: SignaturePackage, filename?: string) {
  const name = filename || `${pkg.file_name}.pki.sig.json`
  const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}

async function reqBlob(path: string): Promise<{ blob: Blob; filename: string }> {
  const token = getStoredToken()
  const res = await fetch(`${BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Błąd serwera')
  }

  const disposition = res.headers.get('Content-Disposition') || ''
  const match = disposition.match(/filename="?([^"]+)"?/)
  const filename = match?.[1] || 'podpis.pki.sig.json'
  const blob = await res.blob()
  return { blob, filename }
}

export const api = {
  getStoredToken,
  setStoredToken,
  clearStoredToken,

  setSession(token: string, _user?: User) {
    setStoredToken(token)
  },

  clearSession() {
    clearStoredToken()
  },

  me: () => req<User>('/api/auth/me'),

  login: async (data: { email: string; password: string }) =>
    req<{ access_token: string; token_type: string; user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  register: async (data: {
    email: string
    password: string
    first_name: string
    last_name: string
  }) =>
    req<{ message: string; user: User }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getMe: () => req<User>('/api/auth/me'),

  getUsers: () => req<User[]>('/api/users'),

  createUser: (data: {
    email: string
    password: string
    first_name: string
    last_name: string
    role: 'user' | 'admin'
  }) =>
    req<{ message: string; user: User }>('/api/users', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateUser: (id: number, data: { first_name?: string; last_name?: string; role?: 'user' | 'admin' }) =>
    req<{ message: string; user: User }>(`/api/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  resetUserPassword: (id: number, password: string) =>
    req<{ message: string }>(`/api/users/${id}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),

  deleteUser: (id: number) =>
    req<{ message: string }>(`/api/users/${id}`, { method: 'DELETE' }),

  getAuditLogs: () => req<AuditLogEntry[]>('/api/audit-logs'),

  downloadCrl: async () => {
    const { blob, filename } = await reqBlob('/api/crl')
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
  },

  downloadPrivateKey: async (certificateId: number) => {
    const { blob, filename } = await reqBlob(`/api/certificates/${certificateId}/private-key`)
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
  },

  initCA: () =>
    req<{ message: string; serial_number: string }>('/api/ca/init', {
      method: 'POST',
    }),

  getCertificates: () => req<Certificate[]>('/api/certificates'),

  getRequests: () => req<CertRequest[]>('/api/requests'),

  submitCSR: (data: { common_name: string; csr_pem_data: string }) =>
    req<{ message: string; status: string; request_id: number }>('/api/certs/request', {
      method: 'POST',
      body: JSON.stringify({
        common_name: data.common_name,
        csr_pem: data.csr_pem_data,
      }),
    }),

  approveRequest: (id: number) =>
    req<{ message: string; serial_number: string }>(`/api/certs/approve/${id}`, {
      method: 'POST',
    }),

  rejectRequest: (id: number) =>
    req<{ message: string }>(`/api/requests/${id}/reject`, {
      method: 'POST',
    }),

  issueCertificate: (requestId: number) =>
    req<{ message: string; serial_number: string }>('/api/certificates/issue', {
      method: 'POST',
      body: JSON.stringify({ request_id: requestId }),
    }),

  revokeCertificate: (id: number, reason: string) =>
    req<{ message: string }>(`/api/certificates/${id}/revoke`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  issueCertificateForUser: (data: {
    user_id: number
    common_name: string
    organization: string
    country?: string
    state?: string
    locality?: string
    type: 'SERVER' | 'CLIENT' | 'INTERMEDIATE'
    validity_days: number
  }) =>
    req<{
      message: string
      certificate: Certificate
    }>('/api/certificates/issue-for-user', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getSignedDocuments: () => req<SignedDocument[]>('/api/documents'),

  signDocument: (certificateId: number, file: File) => {
    const form = new FormData()
    form.append('certificate_id', String(certificateId))
    form.append('file', file)
    return reqForm<{
      message: string
      file_name: string
      signed_document_id: number
      signature_package: SignaturePackage
      signature_package_filename: string
    }>('/api/documents/sign', form)
  },

  downloadSignaturePackage: async (documentId: number) => {
    const { blob, filename } = await reqBlob(`/api/documents/${documentId}/package`)
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
  },

  verifyDocumentSignature: (signedDocumentId: number, file: File) => {
    const form = new FormData()
    form.append('signed_document_id', String(signedDocumentId))
    form.append('file', file)
    return reqForm<VerifySignatureResult>('/api/documents/verify', form)
  },

  verifySignaturePackage: (file: File, signatureFile: File) => {
    const form = new FormData()
    form.append('file', file)
    form.append('signature_file', signatureFile)
    return reqForm<VerifySignatureResult>('/api/documents/verify-package', form)
  },
}
