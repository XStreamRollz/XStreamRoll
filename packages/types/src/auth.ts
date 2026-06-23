export type UserRole = "admin" | "viewer"

export interface User {
  id: string
  email: string
  displayName: string
  role: UserRole
  createdAt: string
  updatedAt: string
}

export interface CreateUserDto {
  email: string
  password: string
  displayName: string
}

export interface UpdateUserDto {
  displayName?: string
  email?: string
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
  expiresIn: number
}
