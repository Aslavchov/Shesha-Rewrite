import { useQuery } from "@tanstack/react-query"

import type { FormList, FormRecord } from "@/generated"
import { apiGet } from "@/lib/api"

/** Every form, most recently updated first. */
export function useForms() {
  return useQuery({
    queryKey: ["forms"],
    queryFn: ({ signal }) => apiGet<FormList>("/api/forms", signal),
  })
}

/** One form: its document and revision. */
export function useForm(id: string) {
  return useQuery({
    queryKey: ["forms", id],
    queryFn: ({ signal }) => apiGet<FormRecord>(`/api/forms/${encodeURIComponent(id)}`, signal),
  })
}
