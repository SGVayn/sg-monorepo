export type Project = {
  id: string
  title: string
  description: string
  tags: string[]
}

function isProject(value: unknown): value is Project {
  return (
    typeof value === 'object' && value !== null &&
    'id' in value && typeof value.id === 'string' &&
    'title' in value && typeof value.title === 'string' &&
    'description' in value && typeof value.description === 'string' &&
    'tags' in value && Array.isArray(value.tags) &&
    value.tags.every((tag: unknown) => typeof tag === 'string')
  )
}

export async function getProjects(signal: AbortSignal): Promise<Project[]> {
  const response = await fetch('/api/projects', { signal })
  if (!response.ok) throw new Error('Projects could not be loaded.')

  const data: unknown = await response.json()
  if (!Array.isArray(data) || !data.every(isProject)) {
    throw new Error('The projects response was invalid.')
  }

  return data
}
