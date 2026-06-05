const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export interface Certificate {
  id: number
  serial_number: string
  common_name: string
  organization: string
  type: 'ROOT' | 'INTERMEDIATE' | 'SERVER' | 'CLIENT'
  status: 'VALID' | 'REVOKED' | 'EXPIRED'
  not_before: string
  not_after: string
  pem_data: string
  revoked_at?: string
  revocation_reason?: string
}

export interface CertRequest {
  id: number
  common_name: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  csr_pem_data: string
  created_at: string
}

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Błąd serwera')
  }
  return res.json()
}

export const api = {
  initCA: () => req<{ message: string; serial_number: string }>('/api/ca/init', { method: 'POST' }),
  getCertificates: () => req<Certificate[]>('/api/certificates'),
  getCertificate: (id: number) => req<Certificate>(`/api/certificates/${id}`),
  issueCertificate: (data: {
    common_name: string
    organization: string
    type: 'SERVER' | 'CLIENT' | 'INTERMEDIATE'
    validity_days: number
    country?: string
    state?: string
    locality?: string
  }) => req<{ message: string; certificate: Certificate }>('/api/certificates/issue', { method: 'POST', body: JSON.stringify(data) }),
  revokeCertificate: (id: number, reason: string) =>
    req<{ message: string }>(`/api/certificates/${id}/revoke`, { method: 'POST', body: JSON.stringify({ reason }) }),
  getRequests: () => req<CertRequest[]>('/api/requests'),
  submitCSR: (data: { common_name: string; csr_pem_data: string }) =>
    req<{ message: string; request: CertRequest }>('/api/requests', { method: 'POST', body: JSON.stringify(data) }),
  approveRequest: (id: number) => req<{ message: string }>(`/api/requests/${id}/approve`, { method: 'POST' }),
  rejectRequest: (id: number) => req<{ message: string }>(`/api/requests/${id}/reject`, { method: 'POST' }),
}
