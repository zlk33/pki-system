const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export interface Certificate {
  id: number
  serial_number: string
  common_name: string
  organization?: string
  type: 'ROOT' | 'INTERMEDIATE' | 'SERVER' | 'CLIENT'
  status: 'VALID' | 'REVOKED' | 'EXPIRED'
  not_before: string
  not_after: string
  pem_data?: string
  revoked_at?: string
  revocation_reason?: string
}

export interface CertRequest {
  id: number
  common_name: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  created_at: string
  csr_pem_data?: string
}

export interface GeneratedCertificateResponse {
  message: string
  certificate_id: number
  serial_number: string
  certificate_pem: string
  private_key_pem: string
}

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
    ...options,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Błąd serwera')
  }

  const contentType = res.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    return res.json()
  }
  return res.text() as Promise<T>
}

export const api = {
  initCA: () =>
    req<{ message: string; serial_number: string }>('/api/ca/init', {
      method: 'POST',
    }),

  getCertificates: () =>
    req<Certificate[]>('/api/certificates'),

  getCertificateDetails: (id: number) =>
    req<Certificate>(`/api/certificates/${id}`),

  getCertificatePem: (id: number) =>
    req<string>(`/api/certificates/${id}/pem`),

  getRequests: () =>
    req<CertRequest[]>('/api/requests'),

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
    req<{ message: string; status: string }>(`/api/requests/${id}/reject`, {
      method: 'POST',
    }),

  issueCertificate: (requestId: number) =>
    req<{ message: string; serial_number: string }>('/api/certificates/issue', {
      method: 'POST',
      body: JSON.stringify({ request_id: requestId }),
    }),

  generateCertificate: (data: { common_name: string; organization: string; cert_type: 'SERVER' | 'CLIENT' }) =>
    req<GeneratedCertificateResponse>('/api/certificates/generate', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  revokeCertificate: (id: number, reason: string) =>
    req<{ message: string; revoked_at: string; revocation_reason: string }>(`/api/certificates/${id}/revoke`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
}
