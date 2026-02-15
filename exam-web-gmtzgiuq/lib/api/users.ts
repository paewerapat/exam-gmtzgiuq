// Users API Service
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface UserProfile {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  avatar: string | null;
  isEmailVerified: boolean;
  provider: string;
  isActive: boolean;
  role: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedUsers {
  items: UserProfile[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface UserStats {
  totalUsers: number;
  activeUsers: number;
  adminUsers: number;
  googleUsers: number;
}

export interface GetUsersParams {
  page?: number;
  limit?: number;
  search?: string;
  role?: string;
}

function getAuthHeaders(): HeadersInit {
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// Admin - Get all users
export async function getAdminUsers(
  params: GetUsersParams = {},
): Promise<PaginatedUsers> {
  const { page = 1, limit = 10, search, role } = params;

  const queryParams = new URLSearchParams();
  queryParams.set('page', String(page));
  queryParams.set('limit', String(limit));
  if (search) queryParams.set('search', search);
  if (role) queryParams.set('role', role);

  const response = await fetch(
    `${API_URL}/users/admin/all?${queryParams.toString()}`,
    {
      method: 'GET',
      headers: getAuthHeaders(),
      cache: 'no-store',
    },
  );

  if (!response.ok) {
    throw new Error('Failed to fetch users');
  }

  return response.json();
}

// Admin - Get user stats
export async function getAdminUserStats(): Promise<UserStats> {
  const response = await fetch(`${API_URL}/users/admin/stats`, {
    method: 'GET',
    headers: getAuthHeaders(),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch user stats');
  }

  return response.json();
}

// Admin - Get single user
export async function getAdminUser(id: string): Promise<UserProfile> {
  const response = await fetch(`${API_URL}/users/admin/${id}`, {
    method: 'GET',
    headers: getAuthHeaders(),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('User not found');
  }

  return response.json();
}
