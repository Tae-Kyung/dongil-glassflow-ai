-- ============================================================
-- 004: glassflow_item_status 뷰 수정
--
-- 문제: production_logs + shipment_logs를 동시에 JOIN하면
--       카테시안 곱이 발생해 수량이 N×M배로 부풀려짐
-- 해결: 각 로그를 서브쿼리로 먼저 집계 후 JOIN
-- ============================================================

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
