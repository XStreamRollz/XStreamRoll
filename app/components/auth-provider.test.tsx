import { render, screen, waitFor } from '@testing-library/react'
import { AuthProvider } from './auth-provider'

const mockReplace = jest.fn()
const mockPathname = jest.fn(() => '/dashboard/streams')

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => mockPathname(),
}))

beforeEach(() => {
  jest.clearAllMocks()
})

describe('AuthProvider', () => {
  it('shows loading state initially', () => {
    global.fetch = jest.fn(() => new Promise(() => {}))
    render(<AuthProvider><div>content</div></AuthProvider>)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('redirects to login on refresh failure', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false })

    render(<AuthProvider><div>content</div></AuthProvider>)
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/auth/login'))
  })

  it('provides user context on success', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ user: { id: 1, username: 'test', email: 'a@b.com' }, accessToken: 'abc' }),
    })

    render(<AuthProvider><div>content</div></AuthProvider>)
    await waitFor(() => expect(screen.getByText('content')).toBeInTheDocument())
  })

  it('does not redirect when already on /auth/ page', async () => {
    mockPathname.mockReturnValue('/auth/login')
    global.fetch = jest.fn().mockResolvedValue({ ok: false })

    render(<AuthProvider><div>content</div></AuthProvider>)
    await waitFor(() => expect(mockReplace).not.toHaveBeenCalled())
  })
})
