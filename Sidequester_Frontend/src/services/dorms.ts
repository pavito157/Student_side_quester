export type DormOption = {
  dormId: string
  dormName: string
}

export type DormProfile = {
  dormId: string | null
  dormName: string | null
  dorms: DormOption[]
}

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseDormProfile(value: unknown): DormProfile {
  if (
    !isRecord(value) ||
    !(value.dormId === null || typeof value.dormId === 'string') ||
    !(value.dormName === null || typeof value.dormName === 'string') ||
    !Array.isArray(value.dorms) ||
    !value.dorms.every(
      (dorm) =>
        isRecord(dorm) &&
        typeof dorm.dormId === 'string' &&
        typeof dorm.dormName === 'string',
    )
  ) {
    throw new Error('The backend returned invalid residence data.')
  }

  return {
    dormId: value.dormId,
    dormName: value.dormName,
    dorms: value.dorms,
  }
}

async function requestDormProfile(
  token: string,
  method: 'GET' | 'PUT',
  dormId?: string,
): Promise<DormProfile> {
  const response = await fetch(`${apiBaseUrl}/me/dorm`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(method === 'PUT' ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(method === 'PUT' ? { body: JSON.stringify({ dormId }) } : {}),
    credentials: 'omit',
  })
  const result: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const detail = isRecord(result) ? result.detail : null
    throw new Error(typeof detail === 'string' ? detail : 'Could not load your residence.')
  }
  return parseDormProfile(result)
}

export function getDormProfile(token: string): Promise<DormProfile> {
  return requestDormProfile(token, 'GET')
}

export function saveDormSelection(token: string, dormId: string): Promise<DormProfile> {
  return requestDormProfile(token, 'PUT', dormId)
}
