-- ============================================================
-- GlassFlow AI — Initial Schema
-- 동일유리 발주·생산·출고 현황 관리 시스템
-- ============================================================

-- Extensions
create extension if not exists pg_trgm;
create extension if not exists vector;

-- ============================================================
-- glassflow_order_docs (의뢰서 헤더)
-- ============================================================
create table glassflow_order_docs (
  id                   uuid primary key default gen_random_uuid(),
  doc_no               text not null unique,      -- 의뢰번호 (예: 26-0385)
  customer             text,                      -- 업체명 (거래처)
  site_name            text not null,             -- 현장명
  request_date         date,                      -- 의뢰일자
  due_date             date,                      -- 납품일자
  tps_date             date,                      -- TPS 일자 (Excel 전용)
  arrival_date         date,                      -- 주문서도착일 (Excel 전용)
  source               text default 'excel',      -- 'excel' | 'pdf'
  raw_pdf_url          text,                      -- 원본 PDF Storage URL (PDF 전용)
  site_name_embedding  vector(1536),              -- 현장명 임베딩 (pgvector 검색용)
  created_at           timestamptz default now(),
  updated_at           timestamptz default now()
);

-- 퍼지 검색 (오타·부분일치)
create index glassflow_order_docs_site_name_trgm_idx
  on glassflow_order_docs using gin (site_name gin_trgm_ops);

-- 벡터 검색 (의미적 유사어)
create index glassflow_order_docs_site_name_embedding_idx
  on glassflow_order_docs using ivfflat (site_name_embedding vector_cosine_ops)
  with (lists = 100);

-- updated_at 자동 갱신 트리거
create or replace function glassflow_update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger glassflow_order_docs_updated_at
  before update on glassflow_order_docs
  for each row execute function glassflow_update_updated_at();

-- ============================================================
-- glassflow_order_items (품목 라인)
-- ============================================================
create table glassflow_order_items (
  id           uuid primary key default gen_random_uuid(),
  doc_id       uuid references glassflow_order_docs(id) on delete cascade,
  item_no      integer,                -- 항번 (PDF의 No 컬럼, Excel은 null)
  item_name    text,                   -- 품명 (유리 종류·스펙 명칭)
  width_mm     integer,                -- 규격 가로 (mm)
  height_mm    integer,                -- 규격 세로 (mm)
  order_qty    integer,                -- 수량 (매)
  area_m2      numeric(10, 2),         -- 면적 (㎡)
  location     text,                   -- 비고 (동·타입·층·위치 정보)
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

create trigger glassflow_order_items_updated_at
  before update on glassflow_order_items
  for each row execute function glassflow_update_updated_at();

-- ============================================================
-- glassflow_production_logs (생산 회차 로그)
-- ============================================================
create table glassflow_production_logs (
  id             uuid primary key default gen_random_uuid(),
  item_id        uuid references glassflow_order_items(id) on delete cascade,
  seq            integer not null,           -- 회차 (1, 2, 3 ...)
  produced_date  date,                       -- 생산 날짜
  produced_qty   integer not null,           -- 당일 생산 수량
  is_completed   boolean default false,      -- 전체 생산 완료 여부
  note           text,                       -- 메모 (공장명, 특이사항 등)
  updated_by     text,                       -- 수정 담당자
  updated_at     timestamptz default now(),
  unique (item_id, seq)
);

-- ============================================================
-- glassflow_shipment_logs (출고 회차 로그)
-- ============================================================
create table glassflow_shipment_logs (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid references glassflow_order_items(id) on delete cascade,
  seq           integer not null,            -- 회차 (1, 2, 3 ...)
  shipped_date  date,                        -- 출고 날짜
  shipped_qty   integer not null,            -- 당일 출고 수량
  note          text,                        -- 메모 (출고 방법, 업체 등)
  updated_by    text,                        -- 수정 담당자
  updated_at    timestamptz default now(),
  unique (item_id, seq)
);

-- ============================================================
-- glassflow_item_status VIEW (품목별 현황 실시간 계산)
-- ============================================================
create view glassflow_item_status as
select
  i.id,
  i.doc_id,
  d.doc_no,
  d.customer,
  d.site_name,
  d.due_date,
  i.item_no,
  i.item_name,
  i.width_mm,
  i.height_mm,
  i.order_qty,
  i.area_m2,
  i.location,
  coalesce(sum(pl.produced_qty), 0)                       as total_produced_qty,
  coalesce(sum(sl.shipped_qty),  0)                       as total_shipped_qty,
  i.order_qty - coalesce(sum(sl.shipped_qty), 0)          as pending_qty,
  case
    when coalesce(sum(sl.shipped_qty), 0) >= i.order_qty  then 'shipped'
    when coalesce(sum(sl.shipped_qty), 0) > 0             then 'partial'
    when coalesce(sum(pl.produced_qty), 0) >= i.order_qty then 'produced'
    when coalesce(sum(pl.produced_qty), 0) > 0            then 'in_progress'
    else 'pending'
  end as status
from glassflow_order_items i
join glassflow_order_docs d            on d.id = i.doc_id
left join glassflow_production_logs pl on pl.item_id = i.id
left join glassflow_shipment_logs   sl on sl.item_id = i.id
group by i.id, d.id;

-- ============================================================
-- RLS (Row Level Security)
-- ============================================================
alter table glassflow_order_docs      enable row level security;
alter table glassflow_order_items     enable row level security;
alter table glassflow_production_logs enable row level security;
alter table glassflow_shipment_logs   enable row level security;

-- 임시 정책: 전체 읽기 허용 (인증 방식 결정 후 수정 필요)
create policy "allow_read_order_docs"
  on glassflow_order_docs for select using (true);

create policy "allow_read_order_items"
  on glassflow_order_items for select using (true);

create policy "allow_read_production_logs"
  on glassflow_production_logs for select using (true);

create policy "allow_read_shipment_logs"
  on glassflow_shipment_logs for select using (true);

-- 서비스 롤(service_role)은 RLS 우회 가능 (API Route에서 사용)
