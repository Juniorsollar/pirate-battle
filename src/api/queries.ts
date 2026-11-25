import { keepPreviousData, QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useSyncExternalStore } from 'react'
import { describeError, fetchHistory, fetchRanking, isRetryable, submitMatch } from './client'
import { PAGE_SIZE, type MatchRecord } from './contracts'
import { outbox, outboxStore } from './outbox'

export const queryKeys = {
  ranking: (configKey: string, page: number) => ['ranking', configKey, page] as const,
  history: (playerId: string, page: number) => ['history', playerId, page] as const,
}

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 10_000,
        // Refresh the tabs every time they are shown again.
        refetchOnMount: 'always',
        retry: (failureCount, error) => isRetryable(error) && failureCount < 2,
        retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 2000),
      },
      mutations: {
        retry: (failureCount, error) => isRetryable(error) && failureCount < 1,
        retryDelay: 500,
      },
    },
  })
}

// The AbortSignal cancels superseded requests, and each page has its own cache key,
// so a late response can never overwrite newer data on screen.
export function useRanking(configKey: string, page: number) {
  return useQuery({
    queryKey: queryKeys.ranking(configKey, page),
    queryFn: ({ signal }) => fetchRanking({ configKey, page, pageSize: PAGE_SIZE }, signal),
    placeholderData: keepPreviousData,
  })
}

export function useHistory(playerId: string, page: number) {
  return useQuery({
    queryKey: queryKeys.history(playerId, page),
    queryFn: ({ signal }) => fetchHistory(playerId, { page, pageSize: PAGE_SIZE }, signal),
    placeholderData: keepPreviousData,
  })
}

/** Match ids with a request in flight: repeated clicks or flushes never send twice at once. */
const inFlight = new Set<string>()

/** Registers finished matches through the outbox; safe to call repeatedly for the same match. */
export function useMatchSubmitter() {
  const queryClient = useQueryClient()
  const { mutateAsync } = useMutation({ mutationKey: ['submitMatch'], mutationFn: submitMatch })

  const submit = useCallback(
    (record: MatchRecord) => {
      const { matchId } = record
      if (inFlight.has(matchId)) return
      inFlight.add(matchId)
      outbox.add(record)
      outbox.setStatus(matchId, 'sending')
      mutateAsync(record)
        .then(() => {
          outbox.remove(matchId)
          void queryClient.invalidateQueries({ queryKey: ['ranking'] })
          void queryClient.invalidateQueries({ queryKey: ['history'] })
        })
        .catch((error: unknown) => outbox.setStatus(matchId, 'failed', describeError(error)))
        .finally(() => inFlight.delete(matchId))
    },
    [mutateAsync, queryClient],
  )

  const flush = useCallback(() => outbox.entries().forEach((e) => submit(e.record)), [submit])
  return { submit, flush }
}

export function useOutbox() {
  return useSyncExternalStore(outboxStore.subscribe, outboxStore.get).entries
}
