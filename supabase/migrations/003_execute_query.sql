-- ============================================================
-- 챗봇 NL→SQL 실행용 안전 함수
-- SELECT 쿼리만 허용, glassflow_ 테이블/뷰만 접근 가능
-- ============================================================

create or replace function glassflow_execute_select(query text)
returns jsonb
language plpgsql
security definer  -- 함수 소유자 권한으로 실행
as $$
declare
  upper_query text;
  result      jsonb;
begin
  upper_query := upper(trim(query));

  -- SELECT 외 DML 차단
  if upper_query not like 'SELECT%' then
    raise exception 'SELECT 쿼리만 허용됩니다.';
  end if;

  -- 위험 키워드 차단
  if upper_query ~ '(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE)' then
    raise exception '허용되지 않는 SQL 키워드가 포함되어 있습니다.';
  end if;

  execute 'select jsonb_agg(row_to_json(t)) from (' || query || ') t'
    into result;

  return coalesce(result, '[]'::jsonb);
end;
$$;
