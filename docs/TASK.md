# GlassFlow AI — 구현 태스크 체크리스트

**프로젝트**: 동일유리 발주·생산·출고 현황 관리 AI 시스템
**최종 업데이트**: 2026-03-19
**범례**: ⬜ 미시작 · 🔄 진행중 · ✅ 완료 · ⏸ 보류

---

## PHASE 0. 사전 준비

### 0-1. 외부 서비스 계정 및 키 발급
- ⬜ Supabase 프로젝트 생성 (Free 또는 Pro 플랜 결정)
- ⬜ OpenAI API 키 발급 및 GPT-4o, text-embedding-3-small 사용 권한 확인
- ⬜ Vercel 계정 연동 (GitHub 저장소 연결)
- ✅ GitHub 저장소 생성

### 0-2. 개발 환경 세팅
- ⬜ Node.js 18+ 설치 확인
- ✅ Next.js 프로젝트 생성 (`npx create-next-app@latest --typescript --app`)
- ✅ 의존성 패키지 설치
  - ✅ `@supabase/supabase-js`, `@supabase/ssr`
  - ✅ `openai`
  - ✅ `pdfjs-dist` (PDF → 이미지 변환)
  - ✅ `sharp` (이미지 처리)
  - ✅ `tailwindcss`, `shadcn/ui` (UI 컴포넌트)
- ⬜ `.env.local` 파일 생성 및 환경 변수 설정
  ```
  NEXT_PUBLIC_SUPABASE_URL=
  NEXT_PUBLIC_SUPABASE_ANON_KEY=
  SUPABASE_SERVICE_ROLE_KEY=
  OPENAI_API_KEY=
  ```
- ⬜ Vercel 프로젝트 연결 및 환경 변수 등록

---

## PHASE 1. 데이터베이스 구축

### 1-1. Supabase 확장 및 기본 설정
- ⬜ `pg_trgm` 확장 활성화 (SQL Editor에서 migration 실행)
- ⬜ `vector` (pgvector) 확장 활성화 (SQL Editor에서 migration 실행)
- ⬜ Supabase Storage 버킷 `order-pdfs` 생성 (공개 접근 OFF)

### 1-2. 테이블 생성 (`supabase/migrations/001_initial_schema.sql`)
- ✅ `order_docs` 테이블 생성
  - ✅ 컬럼: id, doc_no(unique), customer, site_name, request_date, due_date, tps_date, arrival_date, source, raw_pdf_url, site_name_embedding(vector 1536), created_at, updated_at
  - ✅ `gin_trgm_ops` 인덱스 생성 (site_name 퍼지 검색)
  - ✅ `ivfflat` 인덱스 생성 (site_name_embedding 벡터 검색)
- ✅ `order_items` 테이블 생성
  - ✅ 컬럼: id, doc_id(FK→order_docs), item_no, item_name, width_mm, height_mm, order_qty, area_m2, location, created_at, updated_at
- ✅ `production_logs` 테이블 생성
  - ✅ 컬럼: id, item_id(FK→order_items), seq, produced_date, produced_qty, is_completed, note, updated_by, updated_at
  - ✅ UNIQUE(item_id, seq) 제약 설정
- ✅ `shipment_logs` 테이블 생성
  - ✅ 컬럼: id, item_id(FK→order_items), seq, shipped_date, shipped_qty, note, updated_by, updated_at
  - ✅ UNIQUE(item_id, seq) 제약 설정

### 1-3. VIEW 생성
- ✅ `item_status` VIEW 생성
  - ✅ order_items ← order_docs JOIN
  - ✅ LEFT JOIN production_logs → total_produced_qty
  - ✅ LEFT JOIN shipment_logs → total_shipped_qty
  - ✅ pending_qty = order_qty - total_shipped_qty
  - ✅ status CASE 로직 (pending / in_progress / produced / partial / shipped)

### 1-4. 보안 (RLS)
- ✅ 모든 테이블에 RLS 활성화
- ✅ 읽기 정책 설정 (임시: 전체 허용 — 인증 방식 결정 후 수정 필요)
- ⬜ 쓰기 정책 설정 (내부 담당자만) — 인증 방식 결정 후 구현
- ✅ 단가 컬럼 노출 방지 확인 (현재 스키마에 단가 없음 — 추후 추가 시 주의)

---

## PHASE 2. 공통 라이브러리

### 2-1. Supabase 클라이언트 (`lib/supabase.ts`)
- ✅ 서버 컴포넌트용 클라이언트 (service role key)
- ✅ 클라이언트 컴포넌트용 클라이언트 (anon key)

### 2-2. OpenAI 클라이언트 (`lib/openai.ts`)
- ✅ GPT-4o 인스턴스 초기화
- ✅ text-embedding-3-small 임베딩 함수 작성
  ```ts
  async function embedText(text: string): Promise<number[]>
  ```

### 2-3. 현장명 하이브리드 검색 (`lib/site-search.ts`)
- ✅ Step 1: pg_trgm 퍼지 검색 함수
  ```ts
  async function fuzzySearchSite(keyword: string): Promise<string[]>
  // similarity(site_name, keyword) > 0.3, ORDER BY score DESC, LIMIT 5
  ```
- ✅ Step 2: pgvector 벡터 검색 함수 (Step 1 결과 없을 때 폴백)
  ```ts
  async function vectorSearchSite(keyword: string): Promise<string[]>
  // site_name_embedding <=> embedding, LIMIT 5
  ```
- ✅ 통합 함수: fuzzy → 결과 없으면 vector 순서로 실행
- ✅ 복수 후보 반환 시 챗봇 되물음 처리

### 2-4. PDF 파서 (`lib/pdf-parser.ts`)
- ✅ PDF 파일을 이미지(base64)로 변환하는 함수
  ```ts
  async function pdfToImages(buffer: Buffer): Promise<string[]>
  ```
- ✅ 다중 페이지 PDF 처리 (페이지별 이미지 배열 반환)

### 2-5. TypeScript 타입 정의 (`types/index.ts`)
- ✅ `OrderDoc`, `OrderItem`, `ProductionLog`, `ShipmentLog` 타입
- ✅ `ItemStatus` (VIEW 결과 타입)
- ✅ `ParsedPdfResult` (Vision API 응답 타입)
- ✅ `ChatMessage` 타입

---

## PHASE 3. PDF 업로드 파이프라인 (FR-01)

### 3-1. API Route (`app/api/upload/route.ts`)
- ✅ POST 핸들러 구현
  - ✅ multipart/form-data로 PDF 파일 수신
  - ✅ Supabase Storage `order-pdfs` 버킷에 원본 업로드
  - ✅ `pdf-parser.ts`로 이미지 변환
  - ✅ GPT-4o Vision API 호출
    - ✅ 시스템 프롬프트: 헤더 필드 + 품목 배열 JSON 추출 지시
    - ✅ 소계·합계 행 제외 지시 명시
    - ✅ 응답 파싱 및 유효성 검증
  - ✅ `order_docs` upsert (doc_no 기준)
  - ✅ 기존 `order_items` 삭제 후 재삽입 (재업로드 시)
  - ✅ site_name → text-embedding-3-small 임베딩 → site_name_embedding 저장
  - ✅ 파싱 결과 JSON 응답 반환

### 3-2. 업로드 UI (`app/upload/page.tsx`)
- ✅ PDF 드래그앤드롭 업로더 (`components/PdfUploader.tsx`)
  - ✅ 파일 선택 또는 드래그앤드롭
  - ✅ 업로드 진행 상태 표시 (로딩 스피너)
- ✅ 파싱 결과 미리보기 테이블 (수정 가능)
  - ✅ 헤더 정보 (의뢰번호, 업체명, 현장명, 날짜) 편집 필드
  - ✅ 품목 목록 인라인 편집 (품명, 규격, 수량, 면적, 비고)
  - ✅ \"저장 확정\" 버튼 → 수정된 데이터로 최종 DB 저장
  - ✅ \"다시 업로드\" 버튼

---

## PHASE 4. 자연어 챗봇 (FR-02, FR-03)

### 4-1. API Route (`app/api/chat/route.ts`)
- ✅ POST 핸들러 구현 (스트리밍 응답)
- ✅ Step 1: 사용자 메시지에서 현장명 키워드 추출 (GPT-4o)
- ✅ Step 2: `site-search.ts`로 현장명 확정
  - ✅ 후보 복수 시: 후보 목록을 사용자에게 반환 (되물음)
  - ✅ 후보 0건 시: \"해당 현장을 찾을 수 없습니다\" 응답
- ✅ Step 3: SQL 생성 (GPT-4o)
  - ✅ 시스템 프롬프트에 item_status VIEW 스키마 고정
  - ✅ 기본 조건 자동 적용: `pending_qty > 0`, `due_date >= CURRENT_DATE`
  - ✅ SELECT 외 DML 포함 시 거부 처리
- ✅ Step 4: Supabase에서 SQL 실행
- ✅ Step 5: 결과 → GPT-4o로 한국어 친절 답변 생성 (스트리밍)
- ✅ 결과 0건 시 \"해당 조건의 데이터가 없습니다\" 처리

### 4-2. 챗봇 UI (`app/page.tsx`, `components/ChatInterface.tsx`)
- ✅ 메시지 입력창 + 전송 버튼
- ✅ 대화 히스토리 표시 (사용자/AI 구분)
- ✅ 스트리밍 응답 실시간 렌더링
- ✅ 로딩 상태 표시
- ✅ 되물음(현장명 후보 선택) UI — 버튼 형태로 후보 표시
- ✅ 모바일 반응형 레이아웃

---

## PHASE 5. 담당자 대시보드 (FR-04, FR-05, FR-06)

### 5-1. 발주 목록 API (`app/api/items/route.ts`)
- ✅ GET: item_status VIEW 조회
  - ✅ 기본 필터: `due_date >= CURRENT_DATE`, `pending_qty > 0`
  - ✅ 쿼리 파라미터: site_name, customer, status, date_from, date_to
  - ✅ 페이지네이션 (limit, offset)

### 5-2. 생산 로그 API (`app/api/items/[itemId]/production/route.ts`)
- ✅ POST: 회차 추가
  - ✅ seq 자동 채번 (현재 max(seq) + 1)
  - ✅ updated_by 기록
- ✅ PATCH (`/[seq]/route.ts`): 특정 회차 수정
- ✅ DELETE (`/[seq]/route.ts`): 특정 회차 삭제

### 5-3. 출고 로그 API (`app/api/items/[itemId]/shipment/route.ts`)
- ✅ POST / PATCH / DELETE (생산 로그 API와 동일 구조)

### 5-4. 대시보드 UI (`app/dashboard/page.tsx`)
- ✅ 발주 목록 테이블 (`components/OrdersTable.tsx`)
  - ✅ 컬럼: 의뢰번호, 현장명, 거래처, 품명, 규격(WxH), 수량, 생산량, 출고량, 미출수량, 상태, 납기일
  - ✅ 상태 뱃지 (`components/StatusBadge.tsx`): pending/in_progress/produced/partial/shipped 색상 구분
  - ✅ 기본 필터: 오늘 이후 납기 건만 표시
- ✅ 고급 검색 패널 (토글)
  - ✅ 납기일 기간 선택 (DatePicker: 시작일 ~ 종료일)
  - ✅ 현장명 검색 입력
  - ✅ 거래처 검색 입력
  - ✅ 상태 필터 (멀티셀렉트)
  - ✅ 초기화 버튼 → 오늘 이후 기본값 복원
- ✅ 로그 편집 패널 (`components/LogPanel.tsx`)
  - ✅ 행 클릭 → 해당 품목의 생산/출고 로그 패널 슬라이드 오픈
  - ✅ 생산 로그 섹션: 회차별 (날짜, 수량, 메모) 목록 + 추가 폼
  - ✅ 출고 로그 섹션: 회차별 (날짜, 수량, 메모) 목록 + 추가 폼
  - ✅ 각 회차 행: 수정 버튼(인라인 편집 전환) / 삭제 버튼(확인 모달)
  - ✅ 저장 시 미출수량·상태 뱃지 실시간 갱신
- ⬜ Supabase Realtime 구독
  - ⬜ `production_logs`, `shipment_logs` 변경 감지
  - ⬜ 테이블 자동 갱신 (다중 담당자 동시 사용 지원)

---

## PHASE 6. 기존 Excel 데이터 마이그레이션

### 6-1. 마이그레이션 스크립트 (`scripts/migrate-excel.ts`)
- ✅ 발주현황.xlsx 읽기 (xlsx 라이브러리)
- ✅ 헤더 행 파싱: 의뢰번호(A), 거래처(B), 현장명(C), 의뢰수량(D), TPS(H), 주문서도착일(K), 생산의뢰일(L), 납품요청일(M)
- ✅ 생산 컬럼(N~W) 파싱
  - ✅ `\"M/D N조\"` → produced_date, produced_qty=N
  - ✅ datetime 값 → produced_date, produced_qty=order_qty
  - ✅ `\"완료\"` → is_completed=true, produced_qty=order_qty
  - ✅ 기타 텍스트(메모성) → note 컬럼 저장
- ✅ 출고 컬럼(X~AJ) 파싱 (생산 컬럼과 동일 규칙)
- ✅ order_docs에 dummy 헤더 생성 (Excel 행 = doc_no 기준)
- ✅ order_items에 품목 1개씩 삽입
- ✅ production_logs, shipment_logs 회차별 삽입
- ✅ site_name → 임베딩 생성 후 site_name_embedding 저장
- ✅ 실행 로그 및 오류 행 리포트 출력
- ✅ 드라이런(dry-run) 옵션 지원 (`npm run migrate:dry`)

---

## PHASE 7. 배포 및 운영

### 7-1. Vercel 배포 설정
- ⬜ Vercel 프로젝트 생성 및 GitHub 연동
- ⬜ 환경 변수 등록 (Production / Preview 분리)
- ⬜ 빌드 오류 없음 확인
- ⬜ 도메인 설정 (커스텀 도메인 or Vercel 기본 도메인)

### 7-2. 엔드투엔드 검증
- ⬜ PDF 업로드 → Vision 파싱 → DB 저장 전 과정 정상 동작 확인
- ⬜ 챗봇: 정상 현장명 질의 → 정확한 답변 확인
- ⬜ 챗봇: 오타 현장명 질의 → 퍼지 검색으로 정상 매칭 확인
- ⬜ 챗봇: 의미적 유사어 질의 → 벡터 검색으로 정상 매칭 확인
- ⬜ 대시보드: 생산 로그 추가 → 미출수량 실시간 반영 확인
- ⬜ 대시보드: 출고 로그 추가 → pending_qty 차감 확인
- ⬜ 대시보드: 다중 탭 동시 접속 → Realtime 동기화 확인
- ⬜ Excel 마이그레이션: 기존 데이터 정상 적재 확인

### 7-3. 미결 사항 결정 및 처리
- ⏸ 사용자 인증 방식 결정 (Supabase Auth vs 내부망 제한)
- ⏸ 챗봇 접근 권한 결정 (URL 공개 vs 로그인 필요)
- ⏸ 모바일 반응형 지원 여부 결정

---

## 진행 현황 요약

| Phase | 내용 | 상태 |
|-------|------|------|
| 0. 사전 준비 | 계정, 환경 세팅 | 🔄 |
| 1. DB 구축 | 테이블, VIEW, RLS | 🔄 |
| 2. 공통 라이브러리 | Supabase, OpenAI, 검색, PDF | ✅ |
| 3. PDF 업로드 파이프라인 | Vision OCR → DB 저장 | ✅ |
| 4. 자연어 챗봇 | NL→SQL, 하이브리드 검색 | ✅ |
| 5. 담당자 대시보드 | 생산·출고 로그 관리 UI | 🔄 |
| 6. Excel 마이그레이션 | 기존 데이터 적재 | ✅ |
| 7. 배포 및 검증 | Vercel 배포, E2E 테스트 | ⬜ |
