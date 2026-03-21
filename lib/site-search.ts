import { supabaseAdmin } from './supabase-admin'
import { embedText } from './openai'

/**
 * Step 1: pg_trgm 퍼지 검색
 * 오타·부분일치 처리 (similarity ≥ 0.3)
 */
export async function fuzzySearchSite(keyword: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin.rpc('search_site_fuzzy', {
    query: keyword,
    threshold: 0.3,
    max_results: 5,
  })

  if (error) throw error
  return (data ?? []).map((row: { site_name: string }) => row.site_name)
}

/**
 * Step 2: pgvector 코사인 유사도 검색
 * 의미적 유사어 처리 (Step 1 결과 없을 때 폴백)
 */
export async function vectorSearchSite(keyword: string): Promise<string[]> {
  const embedding = await embedText(keyword)

  const { data, error } = await supabaseAdmin.rpc('search_site_vector', {
    query_embedding: embedding,
    max_results: 5,
  })

  if (error) throw error
  return (data ?? []).map((row: { site_name: string }) => row.site_name)
}

/**
 * 하이브리드 검색: fuzzy → 결과 없으면 vector
 * @returns 매칭된 현장명 목록 (0개 = 없음, 1개 = 확정, 2개+ = 후보)
 */
export async function searchSite(keyword: string): Promise<string[]> {
  const fuzzyResults = await fuzzySearchSite(keyword)
  if (fuzzyResults.length > 0) return fuzzyResults

  return await vectorSearchSite(keyword)
}
