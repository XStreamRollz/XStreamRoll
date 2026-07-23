import type { CreateUserDto } from "@xstreamroll/types"
import type { Contract } from "./contract"
import { authResponseSchema } from "./schemas"

export const registerBody: CreateUserDto = {
  username: "contractuser",
  email: "contract-user@example.com",
  password: "P4ssw0rd!",
}

export const loginBody = {
  email: registerBody.email,
  password: registerBody.password,
}

export const authContracts: Contract[] = [
  {
    name: "register",
    description: "POST /auth/register creates a user and returns an access token",
    consumer: "xstreamroll-sdk",
    provider: "api",
    request: {
      method: "POST",
      path: "/auth/register",
      body: registerBody,
    },
    response: {
      status: 201,
      schema: authResponseSchema,
    },
  },
  {
    name: "login",
    description: "POST /auth/login authenticates a user and returns an access token",
    consumer: "xstreamroll-sdk",
    provider: "api",
    request: {
      method: "POST",
      path: "/auth/login",
      body: loginBody,
    },
    response: {
      status: 200,
      schema: authResponseSchema,
    },
  },
]
