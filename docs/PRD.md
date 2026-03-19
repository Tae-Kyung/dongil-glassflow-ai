# GlassFlow AI — Product Requirements Document (PRD)

**버전**: 1.0
**작성일**: 2026-03-19
**프로젝트**: 동일유리 발주·생산·출고 현황 관리 AI 시스템

---

## 1. 배경 및 목표

### 1-1. 배경
동일유리는 건설 현장 수십~수백 곳에 유리를 납품한다. 발주서(PDF 스캔본)와 발주현황(Excel)으로 관리되는 데이터가 분산되어 있어, 현장 시공 담당자가 "우리 현장 유리 언제 나와요?"라고 전화할 때마다 담당자가 엑셀을 직접 뒤져야 하는 비효율이 발생하고 있다.

### 1-2. 목표
- 발주 데이터를 DB화하여 단일 진실 공급원(Single Source of Truth)으로 통합
- 자연어 질의로 생산·출고 현황을 즉시 조회할 수 있는 챗봇 제공
- 내부 담당자가 생산·출고 진행 상황을 직접 입력·수정할 수 있는 관리 대시보드 제공
- PDF 발주서를 업로드하면 자동으로 DB에 저장되는 파이프라인 구축

---

## 2. 사용자 및 역할

| 역할 | 설명 | 주요 기능 |
|------|------|-----------|
| **현장 담당자** | 건설 현장 시공 담당자. 비기술자 | 챗봇으로 자연어 질의 (조회 전용) |
| **내부 담당자** | 동일유리 생산·출고 관리 직원 | 대시보드에서 생산·출고 로그 입력·수정, PDF 업로드 |

---

## 3. 핵심 기능 요구사항

### FR-01. PDF 발주서 업로드 및 자동 파싱

**설명**: 스캔 이미지 형태의 발주서 PDF를 업로드하면 OpenAI Vision으로 데이터를 추출해 DB에 저장한다.

**처리 흐름**:
```
PDF 업로드
  → Supabase Storage(order-pdfs 버킷)에 원본 저장
  → PDF를 이미지로 변환
  → GPT-4o Vision API로 필드 추출 (JSON)
  → orders 테이블에 upsert (order_no 기준 중복 방지)
  → site_name을 text-embedding-3-small로 임베딩 → site_name_embedding 저장
  → production_logs, shipment_logs 초기 레코드 없이 빈 상태로 대기
```

**작업 의뢰서 실제 구조** (샘플 분석 기준):
- 문서 헤더 1개: 의뢰번호, 업체명, 의뢰일자, 납품일자, 현장명
- 품목 라인 N개 (샘플 기준 17개): No(항번), 품명, 규격(W×H mm), 수량, 면적(㎡), 비고(동·타입·층·위치)
- 소계 행 / 합계 행 (DB 저장 제외)

**추출 필드**:
- 헤더: `doc_no`(의뢰번호), `customer`(업체명), `site_name`(현장명), `request_date`(의뢰일자), `due_date`(납품일자)
- 품목(반복): `item_no`(No), `item_name`(품명), `width_mm`(규격W), `height_mm`(규격H), `order_qty`(수량), `area_m2`(면적), `location`(비고)

**수용 기준**:
- 동일 `doc_no` 재업로드 시 해당 문서의 품목 전체 교체(upsert), 중복 생성 안 됨
- 소계·합계 행은 파싱에서 제외
- 추출 실패 필드는 `null`로 저장, 업로드 자체는 성공 처리
- 업로드 완료 후 파싱 결과 미리보기 화면 제공 (수정 가능)

---

### FR-02. 현장명 하이브리드 검색

**설명**: 오타·축약어·의미적 유사어를 모두 처리하는 2단계 현장명 검색.

**검색 우선순위**:

| 단계 | 방식 | 임계값 | 처리 케이스 |
|------|------|--------|------------|
| 1st | pg_trgm 퍼지 검색 | similarity ≥ 0.3 | 오타, 부분일치 ("울산다운" → "울산다운2") |
| 2nd | pgvector 코사인 유사도 | 상위 5개 후보 반환 | 의미적 유사어 ("울산 2차" → "울산다운2") |

- 1단계에서 후보가 나오면 2단계 스킵 (API 비용 절감)
- 최종 매칭된 정확한 현장명을 SQL 조건에 사용 (LIKE 미사용)
- 매칭 후보가 복수일 경우 챗봇이 "다음 중 어느 현장인가요?" 되물음

---

### FR-03. 자연어 챗봇 (NL→SQL)

**설명**: 현장 담당자가 자연어로 질문하면 SQL로 변환하여 Supabase를 조회하고 한국어로 답변한다.

**처리 흐름**:
```
자연어 입력
  → GPT-4o: 현장명 키워드 추출
  → FR-02 하이브리드 검색으로 현장명 확정
  → GPT-4o: 스키마 + 확정 현장명 기반 SQL 생성
  → Supabase item_status VIEW 조회
  → GPT-4o: 결과 → 한국어 친절 답변 생성
  → 스트리밍 응답
```

**기본 검색 조건** (사용자가 명시하지 않아도 자동 적용):
- `pending_qty > 0` (미출고 건 우선)
- `due_date >= CURRENT_DATE` (오늘 이후 납기 건)

**질의 예시**:
- "울산다운2 현장 미출 유리 언제 나와?"
- "이번 주 납기인 현장 알려줘"
- "포스코 현장들 생산 완료됐어?"

**수용 기준**:
- 존재하지 않는 컬럼 사용 금지 (시스템 프롬프트에 스키마 명시로 Hallucination 방지)
- SELECT만 허용, DML 생성 시 에러 처리
- 결과 0건이면 "해당 조건의 데이터가 없습니다" 안내

---

### FR-04. 생산 로그 관리 (담당자)

**설명**: 내부 담당자가 작업 의뢰서 업로드 후, 품목별 생산 진행 상황을 회차별로 입력·수정한다.

**엑셀 데이터 구조 반영**:
생산 컬럼(N~W)은 1건이 여러 날짜에 나눠 생산되는 로그 방식:
- `"1/29 16조"` → 1월 29일에 16매 생산
- 날짜만 (datetime) → 해당일에 의뢰수량 전체 생산 완료
- `"완료"` → 날짜 없이 생산 완료 상태

**기능**:
- 회차별 (날짜, 수량, 메모) 추가
- 기존 회차 수정 및 삭제
- `is_completed = true` 설정으로 생산 완료 처리
- 수정 시 담당자명(`updated_by`)·시간 자동 기록

---

### FR-05. 출고 로그 관리 (담당자)

**설명**: 내부 담당자가 생산 완료된 품목에 대해 출고 진행 상황을 회차별로 입력·수정한다.

**엑셀 데이터 구조 반영**:
출고 컬럼(X~AJ)은 생산 컬럼과 동일한 구조의 로그 방식.

**기능**: FR-04와 동일 구조 (날짜, 수량, 메모 회차별 CRUD)

**미출수량 자동 계산**:
```
pending_qty = order_qty - SUM(shipment_logs.shipped_qty)
```
출고 로그 변경 시 `item_status` VIEW를 통해 실시간 반영.

---

### FR-06. 대시보드 (담당자)

**설명**: 전체 발주 현황을 테이블로 조회하고 생산·출고 로그를 인라인 편집하는 관리 화면.

**기본 뷰**:
- `due_date >= 오늘` 기본 필터 (미래 납기 건만 표시)
- 컬럼: 의뢰번호, 현장명, 거래처, 품명, 의뢰수량, 생산량, 출고량, 미출수량, 상태, 납기일

**고급 검색** (토글 확장):
- 납기일 기간 (시작일 ~ 종료일)
- 현장명 / 거래처 / 생산상태 / 출고상태 복합 필터
- 기간 미설정 시 오늘 이후 기본값 자동 복원

**로그 편집**:
- 행 클릭 → 생산 로그 / 출고 로그 패널 확장
- 회차별 인라인 추가·수정·삭제
- Supabase Realtime으로 다중 담당자 동시 편집 시 실시간 반영

---

## 4. 비기능 요구사항

| 구분 | 요구사항 |
|------|----------|
| **보안** | 단가 정보는 조회 결과 및 챗봇 응답에서 제외. Supabase RLS 적용 |
| **정확성** | GPT-4o 스키마 고정 프롬프트로 Hallucination 방지 |
| **실시간성** | Supabase Realtime으로 대시보드 자동 갱신 |
| **확장성** | `source` 컬럼으로 Excel/PDF 출처 구분. 미출재고 등 추가 시트 동일 스키마 통합 가능 |
| **응답 속도** | 챗봇 응답은 스트리밍으로 체감 지연 최소화 |

---

## 5. 데이터베이스 스키마

### 테이블 관계도
```
order_docs (의뢰서 헤더, PDF 1장 = 1행)
    │ 1
    │ N
order_items (품목 라인, PDF 1장의 각 행 = 1행)  ←── Excel 행도 여기 직접 저장
    │ 1                          │ 1
    │ N                          │ N
production_logs              shipment_logs
(생산 회차 로그)              (출고 회차 로그)
```

> **Excel vs PDF 통합 전략**
> - Excel의 각 행(의뢰번호 단위): `order_docs`에 dummy 헤더 생성 → `order_items`에 1개 품목 저장
> - PDF의 각 문서: `order_docs`에 헤더 1개 → `order_items`에 N개 품목 저장
> - 생산·출고 로그는 항상 `order_items` 단위로 관리

---

### order_docs (의뢰서 헤더)
```sql
create table order_docs (
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
create extension if not exists pg_trgm;
create index order_docs_site_name_trgm_idx
  on order_docs using gin (site_name gin_trgm_ops);

-- 벡터 검색 (의미적 유사어)
create extension if not exists vector;
create index order_docs_site_name_embedding_idx
  on order_docs using ivfflat (site_name_embedding vector_cosine_ops)
  with (lists = 100);
```

---

### order_items (품목 라인)
```sql
create table order_items (
  id           uuid primary key default gen_random_uuid(),
  doc_id       uuid references order_docs(id) on delete cascade,
  item_no      integer,                -- 항번 (PDF의 No 컬럼, Excel은 null)
  item_name    text,                   -- 품명 (유리 종류·스펙 명칭)
                                       -- 예: "22T 5CL+12A+5로이"
  width_mm     integer,                -- 규격 가로 (mm), 예: 1445
  height_mm    integer,                -- 규격 세로 (mm), 예: 690
  order_qty    integer,                -- 수량 (매)
  area_m2      numeric(10, 2),         -- 면적 (㎡), 예: 4.00
  location     text,                   -- 비고 (동·타입·층·위치 정보)
                                       -- 예: "103동 8타입 27-30층 자실 외부"
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);
```

---

### production_logs (생산 회차 로그)
```sql
-- 엑셀 생산 컬럼(N~W) 구조 반영: 1건이 여러 날짜에 나눠 생산
-- 파싱 규칙:
--   "1/29 16조" → produced_date=1/29, produced_qty=16
--   날짜만(datetime) → produced_date=해당일, produced_qty=order_qty (전체 생산)
--   "완료" → produced_date=null, produced_qty=order_qty, is_completed=true

create table production_logs (
  id             uuid primary key default gen_random_uuid(),
  item_id        uuid references order_items(id) on delete cascade,
  seq            integer not null,           -- 회차 (1, 2, 3 ...)
  produced_date  date,                       -- 생산 날짜
  produced_qty   integer not null,           -- 당일 생산 수량
  is_completed   boolean default false,      -- 전체 생산 완료 여부
  note           text,                       -- 메모 (공장명, 특이사항 등)
  updated_by     text,                       -- 수정 담당자
  updated_at     timestamptz default now(),
  unique (item_id, seq)
);
```

---

### shipment_logs (출고 회차 로그)
```sql
-- 엑셀 출고 컬럼(X~AJ) 구조 반영: production_logs와 동일 파싱 규칙

create table shipment_logs (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid references order_items(id) on delete cascade,
  seq           integer not null,            -- 회차 (1, 2, 3 ...)
  shipped_date  date,                        -- 출고 날짜
  shipped_qty   integer not null,            -- 당일 출고 수량
  note          text,                        -- 메모 (출고 방법, 업체 등)
  updated_by    text,                        -- 수정 담당자
  updated_at    timestamptz default now(),
  unique (item_id, seq)
);
```

---

### item_status VIEW (품목별 미출수량 실시간 계산)
```sql
create view item_status as
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
from order_items i
join order_docs d       on d.id = i.doc_id
left join production_logs pl on pl.item_id = i.id
left join shipment_logs   sl on sl.item_id = i.id
group by i.id, d.id;
```

**status 정의**:
| 값 | 의미 |
|----|------|
| `pending` | 생산 미시작 |
| `in_progress` | 생산 일부 완료 |
| `produced` | 생산 완료, 출고 전 |
| `partial` | 일부 출고 |
| `shipped` | 전량 출고 완료 |

---

## 6. API 엔드포인트

```
# 챗봇
POST   /api/chat                                  → 자연어 질의 → 스트리밍 답변

# PDF 업로드
POST   /api/upload                                → PDF 파싱 → order_docs + order_items 저장

# 의뢰서(문서) 조회
GET    /api/docs                                  → order_docs 목록 조회
GET    /api/docs/[docId]/items                    → 문서 내 품목 목록 (item_status VIEW)

# 품목 조회
GET    /api/items                                 → item_status VIEW 전체 조회

# 생산 로그 (품목 단위)
POST   /api/items/[itemId]/production             → 회차 추가
PATCH  /api/items/[itemId]/production/[seq]       → 특정 회차 수정
DELETE /api/items/[itemId]/production/[seq]       → 특정 회차 삭제

# 출고 로그 (품목 단위)
POST   /api/items/[itemId]/shipment               → 회차 추가
PATCH  /api/items/[itemId]/shipment/[seq]         → 특정 회차 수정
DELETE /api/items/[itemId]/shipment/[seq]         → 특정 회차 삭제
```

---

## 7. 기술 스택

| 영역 | 기술 |
|------|------|
| Frontend | Next.js (App Router) + TypeScript |
| Hosting | Vercel |
| Database | Supabase (PostgreSQL) |
| 파일 저장 | Supabase Storage |
| 퍼지 검색 | PostgreSQL pg_trgm |
| 벡터 검색 | PostgreSQL pgvector |
| AI — 챗봇 | OpenAI GPT-4o (NL→SQL, 답변 생성) |
| AI — PDF OCR | OpenAI GPT-4o Vision |
| AI — 임베딩 | OpenAI text-embedding-3-small |
| 실시간 | Supabase Realtime |

---

## 8. 프로젝트 구조

```
/
├── app/
│   ├── page.tsx                        # 챗봇 UI
│   ├── dashboard/page.tsx              # 담당자 대시보드
│   ├── upload/page.tsx                 # PDF 업로드
│   └── api/
│       ├── chat/route.ts
│       ├── upload/route.ts
│       └── orders/
│           ├── route.ts
│           └── [id]/
│               ├── production/route.ts
│               ├── production/[seq]/route.ts
│               ├── shipment/route.ts
│               └── shipment/[seq]/route.ts
├── components/
│   ├── ChatInterface.tsx               # 챗봇 UI
│   ├── OrdersTable.tsx                 # 발주 목록 + 인라인 편집
│   ├── LogPanel.tsx                    # 생산/출고 회차 로그 패널
│   ├── PdfUploader.tsx                 # PDF 드래그앤드롭 업로더
│   └── StatusBadge.tsx                 # 상태 뱃지
├── lib/
│   ├── supabase.ts                     # Supabase 클라이언트
│   ├── openai.ts                       # OpenAI 클라이언트
│   ├── site-search.ts                  # 하이브리드 현장명 검색
│   └── pdf-parser.ts                   # PDF → 이미지 변환
├── types/index.ts
└── supabase/migrations/
    └── 001_initial_schema.sql
```

---

## 9. 환경 변수

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
```

---

## 10. 미결 사항 (추후 결정 필요)

| # | 항목 | 옵션 |
|---|------|------|
| 1 | 사용자 인증 | Supabase Auth vs 별도 인증 없이 내부망 접근 제한 |
| 2 | 챗봇 접근 권한 | 현장 담당자 URL 공개 vs 로그인 필요 |
| 3 | Excel 일괄 업로드 | 기존 발주현황.xlsx 초기 마이그레이션 스크립트 필요 |
| 4 | 모바일 지원 | 현장 담당자 스마트폰 사용 고려 시 반응형 필수 |
