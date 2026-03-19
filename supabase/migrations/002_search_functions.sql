-- ============================================================
-- 현장명 하이브리드 검색 RPC 함수
-- ============================================================

-- Step 1: pg_trgm 퍼지 검색
create or replace function search_site_fuzzy(
  query      text,
  threshold  float default 0.3,
  max_results int default 5
)
returns table(site_name text, score float)
language sql stable
as $$
  select distinct d.site_name,
         similarity(d.site_name, query) as score
  from glassflow_order_docs d
  where similarity(d.site_name, query) >= threshold
  order by score desc
  limit max_results;
$$;

-- Step 2: pgvector 코사인 유사도 검색
create or replace function search_site_vector(
  query_embedding vector(1536),
  max_results     int default 5
)
returns table(site_name text, distance float)
language sql stable
as $$
  select distinct d.site_name,
         (d.site_name_embedding <=> query_embedding) as distance
  from glassflow_order_docs d
  where d.site_name_embedding is not null
  order by distance asc
  limit max_results;
$$;
