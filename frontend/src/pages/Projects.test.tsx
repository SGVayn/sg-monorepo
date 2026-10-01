import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Projects } from './Projects'

const project = {
  id: 'd6cf221f-9514-44fc-a3fa-8e0c832a86bd',
  title: 'A project from the API',
  description: 'Stored in the database.',
  tags: ['React', 'C#'],
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Projects', () => {
  it('shows loading, then renders projects returned by the API', async () => {
    let resolveResponse: (response: Response) => void = () => {}
    const response = new Promise<Response>((resolve) => { resolveResponse = resolve })
    const fetchMock = vi.fn().mockReturnValue(response)
    vi.stubGlobal('fetch', fetchMock)

    render(<Projects />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading projects')

    await act(async () => { resolveResponse(Response.json([project])) })
    expect(await screen.findByRole('heading', { name: project.title })).toBeInTheDocument()
    expect(screen.getByText(project.description)).toBeInTheDocument()
    expect(screen.getByText('C#')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/projects', { signal: expect.any(AbortSignal) })
  })

  it('shows an empty state when no projects exist', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json([])))
    render(<Projects />)
    expect(await screen.findByText('No projects to show yet.')).toBeInTheDocument()
  })

  it('lets the user retry after a failed request', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(Response.json([project])))

    render(<Projects />)
    expect(await screen.findByRole('alert')).toHaveTextContent('couldn’t load')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: project.title })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('handles a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Network error')))
    render(<Projects />)
    expect(await screen.findByRole('alert')).toHaveTextContent('couldn’t load')
  })

  it('handles an unexpected response without breaking the page', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json([{ title: 'Incomplete' }])))
    render(<Projects />)
    expect(await screen.findByRole('alert')).toHaveTextContent('couldn’t load')
  })

  it('cancels the request when leaving the page', () => {
    let requestSignal: AbortSignal | undefined
    vi.stubGlobal('fetch', vi.fn((_url: string, options: RequestInit) => {
      requestSignal = options.signal ?? undefined
      return new Promise<Response>(() => {})
    }))

    const { unmount } = render(<Projects />)
    unmount()
    expect(requestSignal?.aborted).toBe(true)
  })
})
