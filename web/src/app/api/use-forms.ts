import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import {
  type CreateFormRequest,
  FORM_FORMAT_VERSION,
  type FormList,
  type FormRecord,
} from "@/generated"
import { apiGet, apiPost, apiPut } from "@/lib/api"

const FORMS = ["forms"] as const

export const formUrl = (id: string) => `/api/forms/${encodeURIComponent(id)}`

/** Reads one form as the server has it now. */
export const fetchForm = (id: string, signal?: AbortSignal) =>
  apiGet<FormRecord>(formUrl(id), signal)

/** Every form, most recently updated first. */
export function useForms() {
  return useQuery({
    queryKey: FORMS,
    queryFn: ({ signal }) => apiGet<FormList>("/api/forms", signal),
  })
}

/** One form: its document and revision. */
export function useForm(id: string) {
  return useQuery({
    queryKey: [...FORMS, id],
    queryFn: ({ signal }) => fetchForm(id, signal),
  })
}

/**
 * One form, to design. It is read once per visit and never refreshed behind
 * the designer's back: from then on the designer holds the document, and a
 * newer one on the server is a conflict it handles itself.
 */
export function useFormToDesign(id: string) {
  return useQuery({
    queryKey: ["designer", id],
    queryFn: ({ signal }) => fetchForm(id, signal),
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
}

/** Creates an empty form with a name and an optional description. */
export function useCreateForm() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ name, description }: { name: string; description: string }) => {
      const request: CreateFormRequest = {
        document: {
          formatVersion: FORM_FORMAT_VERSION,
          name,
          // Left out when empty: a document only states what was decided.
          ...(description === "" ? {} : { description }),
          components: [],
        },
      }
      return apiPost<FormRecord>("/api/forms", request)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: FORMS, exact: true }),
  })
}

/** Comfortably under the 64 KiB a browser allows a keepalive request, whatever the characters. */
const KEEPALIVE_LIMIT = 20_000

/**
 * Saving a form from the designer, and telling the rest of the app what was
 * stored: the form's own page shows the new revision, and the lists show the
 * new time.
 */
export function useSaveForm(id: string) {
  const queryClient = useQueryClient()
  return {
    save: (revision: number, document: FormRecord["document"], options: { keepalive: boolean }) => {
      const body = { revision, document }
      // A browser refuses to keep a request alive past its page when the body
      // is over 64 KiB. A form that large is sent the ordinary way.
      const keepalive = options.keepalive && JSON.stringify(body).length <= KEEPALIVE_LIMIT
      return apiPut<FormRecord>(formUrl(id), body, { keepalive })
    },
    saved: (record: FormRecord) => {
      queryClient.setQueryData([...FORMS, id], record)
      void queryClient.invalidateQueries({ queryKey: FORMS, exact: true })
    },
  }
}
