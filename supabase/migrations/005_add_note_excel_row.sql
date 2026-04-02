-- ============================================================
-- 005: order_items에 note, excel_row 컬럼 추가 및 뷰 갱신
--
-- note     : 엑셀 F열(간봉/비고) + G열(품명) 통합 텍스트 — 비고 검색용
-- excel_row: 엑셀 원본 행 번호 (1-based) — doc_id + excel_row 복합 유일키
-- ============================================================

-- 1. 컬럼 추가
alter table glassflow_order_items
  add column if not exists note      text,
  add column if not exists excel_row int;

-- 2. 복합 유일 인덱스 (doc_id + excel_row)
create unique index if not exists idx_order_items_doc_row
  on glassflow_order_items(doc_id, excel_row)
  where excel_row is not null;

-- 3. 뷰 재생성 (note 컬럼 추가)
drop view if exists glassflow_item_status;

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
  i.note,
  i.width_mm,
  i.height_mm,
  i.order_qty,
  i.area_m2,
  i.location,
  coalesce(pl.total_produced, 0)                          as total_produced_qty,
  coalesce(sl.total_shipped,  0)                          as total_shipped_qty,
  i.order_qty - coalesce(sl.total_shipped, 0)             as pending_qty,
  case
    when coalesce(sl.total_shipped,  0) >= i.order_qty    then 'shipped'
    when coalesce(sl.total_shipped,  0) > 0               then 'partial'
    when coalesce(pl.total_produced, 0) >= i.order_qty    then 'produced'
    when coalesce(pl.total_produced, 0) > 0               then 'in_progress'
    else 'pending'
  end as status
from glassflow_order_items i
join glassflow_order_docs d on d.id = i.doc_id
left join (
  select item_id, sum(produced_qty) as total_produced
  from glassflow_production_logs
  group by item_id
) pl on pl.item_id = i.id
left join (
  select item_id, sum(shipped_qty) as total_shipped
  from glassflow_shipment_logs
  group by item_id
) sl on sl.item_id = i.id;
