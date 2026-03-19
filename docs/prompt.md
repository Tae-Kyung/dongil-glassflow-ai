# GlassFlow AI — 시스템 구축 프롬프트

## 1. 프로젝트 개요 및 목표

- **프로젝트명**: GlassFlow AI
- **목적**: 동일유리의 발주서(PDF) 및 발주현황(Excel) 데이터를 Supabase에 저장하고, 현장 시공 담당자의 자연어 질문에 실시간으로 생산/출고 현황을 답변하는 웹 시스템 구축
- **핵심 기술**:
  - **Frontend / Hosting**: Next.js (App Router) + Vercel
  - **Database**: Supabase (PostgreSQL)
  - **AI**: OpenAI API (GPT-4o — NL→SQL 변환, Vision — PDF 파싱, text-embedding-3-small — 현장명 벡터 검색)
  - **언어**: TypeScript

---

## 2. 기술 스택 및 아키텍처

```
[사용자 브라우저]
      │
      ▼
[Next.js on Vercel]
  ├── /app/page.tsx          ← 챗봇 UI (자연어 질의응답)
  ├── /app/dashboard/        ← 생산·출고 현황 관리 (담당자용)
  ├── /app/upload/           ← 발주서 PDF 업로드
  └── /api/                  ← Route Handlers
        ├── chat/route.ts    ← NL→SQL → Supabase 조회 → 답변 생성
        ├── upload/route.ts  ← PDF → OpenAI Vision → Supabase 저장
        └── orders/route.ts  ← 생산·출고 정보 CRUD
      │
      ▼
[Supabase]
  ├── orders 테이블          ← 발주서 핵심 데이터 (site_name_embedding 포함)
  ├── production 테이블      ← 생산 진행 정보 (담당자 수정 가능)
  └── shipments 테이블       ← 출고 정보 (담당자 수정 가능)
```

---

## 3. 데이터베이스 스키마 (Supabase / PostgreSQL)

### 3-1. orders 테이블 (발주서 원본 데이터)

```sql
create table orders (
  id              uuid primary key default gen_random_uuid(),
  order_no        text not null unique,       -- 의뢰번호 (예: 22-2821)
  customer        text,                       -- 거래처명
  site_name       text not null,              -- 현장명
  item_name       text,                       -- 품명 (유리 종류)
  spec            text,                       -- 규격 (두께·사이즈)
  order_qty       integer,                    -- 발주수량
  pending_qty     integer,                    -- 미출수량
  due_date        date,                       -- 납기일
  tps_date        date,                       -- TPS 일자
  request_date    date,                       -- 생산의뢰일
  arrival_date    date,                       -- 주문서도착일
  source          text default 'excel',       -- 데이터 출처 ('excel' | 'pdf')
  raw_pdf_url     text,                       -- 원본 PDF Storage URL
  site_name_embedding vector(1536),           -- OpenAI 임베딩 (벡터 검색용)
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- pg_trgm 확장 및 인덱스 (오타·부분일치 퍼지 검색)
create extension if not exists pg_trgm;
create index orders_site_name_trgm_idx on orders using gin (site_name gin_trgm_ops);

-- pgvector 확장 및 인덱스 (의미적 유사도 검색)
create extension if not exists vector;
create index orders_site_name_embedding_idx on orders
  using ivfflat (site_name_embedding vector_cosine_ops) with (lists = 100);
```

### 3-2. production_logs 테이블 (생산 회차 기록 — 담당자 수정 가능)

엑셀의 생산 컬럼(N~W) 구조를 반영한 다회차 로그 테이블입니다.

**엑셀 값 파싱 규칙**:
- `"1/29 16조"` → `date=1월29일`, `qty=16` (당일 생산 수량)
- `datetime(2024-01-18)` (날짜만) → `date=1월18일`, `qty=order_qty` (의뢰수량 전체 생산)
- `"완료"` → `date=null`, `qty=order_qty`, `is_completed=true`

```sql
create table production_logs (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid references orders(id) on delete cascade,
  seq             integer not null,           -- 회차 순서 (1, 2, 3 ...)
  produced_date   date,                       -- 생산 날짜
  produced_qty    integer not null,           -- 당일 생산 수량
  is_completed    boolean default false,      -- 전체 생산 완료 여부
  note            text,                       -- 담당자 메모 (공장명, 특이사항 등)
  updated_by      text,                       -- 수정한 담당자
  updated_at      timestamptz default now(),
  unique (order_id, seq)
);
```

**미출수량 계산 (VIEW)**:
```sql
-- 출고 기준으로 미출수량 계산
create view order_status as
select
  o.id,
  o.order_no,
  o.site_name,
  o.customer,
  o.item_name,
  o.spec,
  o.order_qty,
  o.due_date,
  coalesce(sum(pl.produced_qty), 0)            as total_produced_qty,
  coalesce(sum(sl.shipped_qty), 0)             as total_shipped_qty,
  o.order_qty - coalesce(sum(sl.shipped_qty), 0) as pending_qty,  -- 미출수량
  case
    when coalesce(sum(sl.shipped_qty), 0) >= o.order_qty then 'shipped'
    when coalesce(sum(sl.shipped_qty), 0) > 0             then 'partial'
    when coalesce(sum(pl.produced_qty), 0) >= o.order_qty then 'produced'
    when coalesce(sum(pl.produced_qty), 0) > 0            then 'in_progress'
    else 'pending'
  end as status
from orders o
left join production_logs pl on pl.order_id = o.id
left join shipment_logs sl   on sl.order_id = o.id
group by o.id;
```

### 3-3. shipment_logs 테이블 (출고 회차 기록 — 담당자 수정 가능)

엑셀의 출고 컬럼(X~AJ) 구조를 반영한 다회차 로그 테이블입니다. 생산 컬럼과 동일한 파싱 규칙을 따릅니다.

```sql
create table shipment_logs (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid references orders(id) on delete cascade,
  seq             integer not null,           -- 회차 순서 (1, 2, 3 ...)
  shipped_date    date,                       -- 출고 날짜
  shipped_qty     integer not null,           -- 당일 출고 수량
  note            text,                       -- 담당자 메모 (출고 방법, 업체 등)
  updated_by      text,                       -- 수정한 담당자
  updated_at      timestamptz default now(),
  unique (order_id, seq)
);
```

---

## 4. 주요 기능 상세

### Feature 1: PDF 발주서 업로드 및 파싱

**파일**: `/api/upload/route.ts`

**처리 흐름**:
1. 사용자가 발주서 PDF(스캔 이미지)를 업로드
2. Supabase Storage의 `order-pdfs` 버킷에 원본 파일 저장
3. PDF를 이미지로 변환 후 **OpenAI GPT-4o Vision API**로 전송
4. Vision API 응답에서 아래 필드를 JSON으로 추출:
   - `order_no`, `customer`, `site_name`, `item_name`, `spec`, `order_qty`, `due_date`
5. 추출된 데이터를 `orders` 테이블에 upsert (`order_no` 기준 중복 방지)
6. 저장 시 `site_name`을 OpenAI `text-embedding-3-small`로 임베딩하여 `site_name_embedding` 컬럼에 함께 저장
7. `production`, `shipments` 테이블에 초기 레코드 자동 생성

**OpenAI Vision 프롬프트 예시**:
```
다음은 유리 발주서 이미지입니다. 아래 필드를 JSON 배열로 추출해주세요.
각 품목별로 하나의 객체를 생성하세요.
필드: order_no(의뢰번호), customer(거래처), site_name(현장명),
      item_name(품명), spec(규격), order_qty(수량), due_date(납기일 YYYY-MM-DD)
값이 없는 필드는 null로 설정하세요.
```

---

### Feature 2: 현장명 하이브리드 검색 (Fuzzy + Vector)

**파일**: `/lib/site-search.ts`

현장명은 사용자가 오타를 내거나 축약어를 사용하는 경우가 많으므로 두 단계 검색을 조합합니다.

**검색 전략 (우선순위 순)**:

| 단계 | 방식 | 처리 위치 | 잡아내는 케이스 |
|------|------|-----------|----------------|
| 1st | **pg_trgm 퍼지 검색** | PostgreSQL | 오타, 부분일치 ("울산다운" → "울산다운2") |
| 2nd | **pgvector 벡터 검색** | PostgreSQL + OpenAI | 의미적 유사어 ("울산 2차" → "울산다운2") |

**처리 흐름**:
```
사용자 질문에서 현장명 키워드 추출 (GPT-4o)
         │
         ▼
[Step 1] pg_trgm으로 유사도 ≥ 0.3 현장명 후보 조회
         │ 결과 있음 → 해당 현장명으로 최종 조회
         │ 결과 없음 ↓
[Step 2] 키워드를 text-embedding-3-small로 임베딩
         │
         ▼
         pgvector cosine similarity로 가장 유사한 현장명 반환
         │
         ▼
         매칭된 실제 현장명을 SQL WHERE 조건에 삽입 (정확한 일치)
```

**pg_trgm 퍼지 검색 쿼리 예시**:
```sql
select site_name, similarity(site_name, '울산다운') as score
from (select distinct site_name from orders) t
where similarity(site_name, '울산다운') > 0.3
order by score desc
limit 5;
```

**pgvector 벡터 검색 쿼리 예시**:
```sql
select distinct site_name,
       1 - (site_name_embedding <=> $1::vector) as similarity
from orders
order by site_name_embedding <=> $1::vector
limit 5;
-- $1: 사용자 키워드의 OpenAI 임베딩 벡터
```

---

### Feature 3: NL→SQL 챗봇 (자연어 질의응답)

**파일**: `/api/chat/route.ts`

**처리 흐름**:
1. 사용자 자연어 입력 수신 (예: "울산다운2 현장 미출 유리 언제 나와?")
2. GPT-4o로 질문에서 현장명 키워드 추출
3. **하이브리드 검색**으로 실제 DB 현장명 확정 (Feature 2)
4. 확정된 현장명 + 스키마 정보를 GPT-4o에 전달 → SQL 생성
5. 생성된 SQL을 Supabase에서 실행
6. 결과를 다시 GPT-4o에 전달 → 친절한 한국어 답변 생성
7. 스트리밍 응답으로 UI에 전달

**SQL 생성 시스템 프롬프트**:
```
당신은 동일유리 발주 현황 조회를 위한 SQL 생성 전문가입니다.

[사용 가능한 테이블 및 컬럼]
- order_status (VIEW): id, order_no, customer, site_name, item_name, spec, order_qty, due_date,
                       total_produced_qty, total_shipped_qty, pending_qty, status
  → pending_qty = order_qty - total_shipped_qty (미출수량)
  → status: 'pending' | 'in_progress' | 'produced' | 'partial' | 'shipped'
- production_logs: order_id, seq, produced_date, produced_qty, is_completed, note
- shipment_logs: order_id, seq, shipped_date, shipped_qty, note

[규칙]
1. site_name은 이미 검색으로 확정된 정확한 값을 WHERE site_name = '{{확정된 현장명}}' 으로 사용
2. pending_qty > 0 조건을 기본으로 미출고 현황 우선 조회
3. 날짜 조건 미지정 시 due_date >= CURRENT_DATE 를 기본 적용 (오늘 이후 건만 조회)
4. 존재하지 않는 컬럼은 절대 사용하지 말 것
5. SELECT만 허용, DML(INSERT/UPDATE/DELETE)은 생성 금지
6. 결과는 SQL 쿼리만 반환 (설명 없이)
```

---

### Feature 4: 생산·출고 정보 수정 (담당자용 대시보드)

**파일**: `/app/dashboard/page.tsx`, `/api/orders/route.ts`

**기능**:
- 전체 발주 목록 테이블 뷰 (기본 필터: `due_date >= 오늘` — 현재 시점 이후 건만 표시)
- **고급 검색** (토글로 확장):
  - 납기일 기간 설정 (시작일 ~ 종료일)
  - 현장명 / 거래처 / 미출여부 / 생산상태 / 출고상태 복합 필터
  - 기간 미설정 시 자동으로 오늘 이후 기본값 복원
- 각 발주 행 클릭 시 회차별 로그 패널 확장:
  - **생산 로그**: 회차별 (날짜, 수량, 메모) 추가·수정·삭제
  - **출고 로그**: 회차별 (날짜, 수량, 메모) 추가·수정·삭제
  - `order_status` VIEW의 `pending_qty`, `status` 실시간 반영
- 수정 시 `updated_by`(담당자명)와 `updated_at` 자동 기록
- Supabase Realtime 구독으로 다중 사용자 동시 편집 충돌 방지

**API 엔드포인트**:
```
GET    /api/orders                          → order_status VIEW 조회 (미출수량 계산 포함)
POST   /api/orders/[id]/production          → production_logs 회차 추가
PATCH  /api/orders/[id]/production/[seq]    → production_logs 특정 회차 수정
DELETE /api/orders/[id]/production/[seq]    → production_logs 특정 회차 삭제
POST   /api/orders/[id]/shipment            → shipment_logs 회차 추가
PATCH  /api/orders/[id]/shipment/[seq]      → shipment_logs 특정 회차 수정
DELETE /api/orders/[id]/shipment/[seq]      → shipment_logs 특정 회차 삭제
```

---

## 5. 프로젝트 구조

```
/
├── app/
│   ├── page.tsx                  # 메인 챗봇 페이지
│   ├── dashboard/
│   │   └── page.tsx              # 담당자용 관리 대시보드
│   ├── upload/
│   │   └── page.tsx              # PDF 업로드 페이지
│   └── api/
│       ├── chat/route.ts         # NL→SQL 챗봇 API
│       ├── upload/route.ts       # PDF 파싱·저장 API
│       └── orders/
│           ├── route.ts          # 발주 목록 조회
│           └── [id]/
│               ├── production/route.ts
│               └── shipment/route.ts
├── components/
│   ├── ChatInterface.tsx          # 챗봇 UI 컴포넌트
│   ├── OrdersTable.tsx            # 발주 목록 편집 테이블
│   ├── PdfUploader.tsx            # PDF 드래그앤드롭 업로더
│   └── StatusBadge.tsx            # 생산/출고 상태 뱃지
├── lib/
│   ├── supabase.ts               # Supabase 클라이언트 초기화
│   ├── openai.ts                 # OpenAI 클라이언트 초기화
│   ├── site-search.ts            # 하이브리드 현장명 검색 (pg_trgm + pgvector)
│   └── pdf-parser.ts             # PDF → 이미지 변환 유틸
├── types/
│   └── index.ts                  # 공통 TypeScript 타입 정의
└── supabase/
    └── migrations/
        └── 001_initial_schema.sql # 초기 DB 스키마
```

---

## 6. 환경 변수 (`.env.local`)

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
```

---

## 7. 제약 사항 및 요구 사항

- **보안**: 단가 정보는 조회 결과에서 제외. Supabase RLS(Row Level Security) 적용
- **정확성**: SQL 생성 시 스키마 정보를 시스템 프롬프트에 명시하여 Hallucination 방지
- **확장성**: `미출재고` 등 추가 시트도 동일 스키마로 통합 가능하도록 `source` 컬럼 활용
- **실시간성**: Supabase Realtime으로 대시보드 데이터 자동 갱신
- **PDF 처리**: 발주서는 스캔 이미지 형식이므로 OpenAI GPT-4o Vision으로 OCR 처리
