"use client"

import { useEffect, useState } from "react"
import { aurexAPI } from "@/lib/api-client"

interface Project {
  id: string
  name: string
  slug?: string
}

interface Props {
  value: string | null
  onChange: (projectId: string | null) => void
}

export function ProjectSelector({ value, onChange }: Props) {
  const [projects, setProjects] = useState<Project[]>([])
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1"

  useEffect(() => {
    const token = aurexAPI.getToken()
    if (!token) return
    fetch(`${apiUrl}/dashboard/projects`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.projects) return
        setProjects(data.projects)
        if (!value && data.active_project_id) {
          onChange(data.active_project_id)
        }
      })
      .catch(() => {})
  }, [apiUrl, onChange, value])

  if (projects.length <= 1) return null

  return (
    <select
      className="text-sm border rounded-md px-3 py-1.5 bg-background"
      value={value || ""}
      onChange={(e) => onChange(e.target.value || null)}
    >
      {projects.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  )
}
