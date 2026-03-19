# GlassFlow AI — 테스트 시나리오 & 체크리스트

**프로젝트**: 동일유리 발주·생산·출고 현황 관리 AI 시스템
**최종 업데이트**: 2026-03-19
**범례**: ⬜ 미실행 · 🔄 진행중 · ✅ 통과 · ❌ 실패

---

## T1. 환경 및 연결 확인

### T1-1. Supabase 연결
- ⬜ Supabase 클라이언트 초기화 성공 (에러 없음)
- ⬜ `order_docs` 테이블 SELECT 가능 확인
- ⬜ `item_status` VIEW SELECT 가능 확인
- ⬜ `pg_trgm` 확장 활성화 확인
  ```sql
  SELECT * FROM pg_extension WHERE extname = 'pg_trgm';
  -- 결과: 1행 반환되어야 함
  ```
- ⬜ `vector` 확장 활성화 확인
  ```sql
  SELECT * FROM pg_extension WHERE extname = 'vector';
  -- 결과: 1행 반환되어야 함
  ```
- ⬜ Supabase Storage `order-pdfs` 버킷 존재 확인

### T1-2. OpenAI API 연결
- ⬜ GPT-4o 호출 성공 (간단한 텍스트 요청)
- ⬜ text-embedding-3-small 호출 성공 → 1536차원 벡터 반환 확인
- ⬜ GPT-4o Vision 호출 성공 (테스트 이미지 전달)

### T1-3. 환경 변수
- ⬜ `NEXT_PUBLIC_SUPABASE_URL` 로드 확인
- ⬜ `NEXT_PUBLIC_SUPABASE_ANON_KEY` 로드 확인
- ⬜ `SUPABASE_SERVICE_ROLE_KEY` 로드 확인 (서버 사이드만)
- ⬜ `OPENAI_API_KEY` 로드 확인

---

## T2. 데이터베이스 스키마 검증

### T2-1. 테이블 구조
- ⬜ `order_docs` 컬럼 전체 존재 확인
  ```sql
  SELECT column_name, data_type FROM information_schema.columns
  WHERE table_name = 'order_docs';
  -- 확인: id, doc_no, customer, site_name, request_date, due_date,
  --        tps_date, arrival_date, source, raw_pdf_url,
  --        site_name_embedding, created_at, updated_at
  ```
- ⬜ `order_items` 컬럼 전체 존재 확인
  - 확인: id, doc_id, item_no, item_name, width_mm, height_mm, order_qty, area_m2, location
- ⬜ `production_logs` UNIQUE(item_id, seq) 제약 확인
  ```sql
  -- 동일 item_id, seq 중복 INSERT 시 에러 발생해야 함
  ```
- ⬜ `shipment_logs` UNIQUE(item_id, seq) 제약 확인
- ⬜ CASCADE DELETE 확인
  ```sql
  -- order_docs 삭제 → order_items 자동 삭제 → logs 자동 삭제
  ```

### T2-2. item_status VIEW 계산 검증
테스트 데이터 삽입 후 각 케이스 확인:

- ⬜ **status = 'pending'**: production_logs 없음
  ```sql
  -- order_qty=10, 로그 없음 → pending_qty=10, status='pending'
  ```
- ⬜ **status = 'in_progress'**: 일부 생산
  ```sql
  -- order_qty=10, produced_qty=5 → status='in_progress'
  ```
- ⬜ **status = 'produced'**: 전체 생산, 출고 없음
  ```sql
  -- order_qty=10, produced_qty=10, shipped=0 → status='produced'
  ```
- ⬜ **status = 'partial'**: 일부 출고
  ```sql
  -- order_qty=10, shipped_qty=5 → pending_qty=5, status='partial'
  ```
- ⬜ **status = 'shipped'**: 전체 출고
  ```sql
  -- order_qty=10, shipped_qty=10 → pending_qty=0, status='shipped'
  ```
- ⬜ **다회차 합산**: shipped_qty 여러 회차 SUM 정확성
  ```sql
  -- seq=1: shipped_qty=3, seq=2: shipped_qty=4 → total_shipped_qty=7
  ```

---

## T3. PDF 업로드 파이프라인 (FR-01)

### T3-1. PDF → 이미지 변환
- ⬜ `pdf-parser.ts`: 샘플 PDF(발주서 샘플.pdf) → base64 이미지 변환 성공
- ⬜ 변환된 이미지 크기 확인 (너무 크면 Vision API 오류 — 20MB 이하)
- ⬜ 다중 페이지 PDF 처리 시 페이지별 이미지 배열 반환 확인

### T3-2. GPT-4o Vision 파싱
- ⬜ 샘플 발주서(26-0385) 파싱 결과 검증

  **기대 출력**:
  ```json
  {
    "doc_no": "26-0385",
    "customer": "(주)태영건설c",
    "site_name": "부산 메디컬카운터 지역주택조합사업현장",
    "request_date": "2026-03-03",
    "due_date": "2026-04-11",
    "items": [
      { "item_no": 1, "item_name": "25.76T 8.76(4cl+0.76+4cl)접합+12A+5로이", "width_mm": 1445, "height_mm": 690, "order_qty": 4, "area_m2": 4.00, "location": "103동 8타입 27-30층 자실 외부루프스. 차방" },
      { "item_no": 2, "item_name": "25.76T 8.76(4cl+0.76+4cl)접합+12A+5로이", "width_mm": 760, "height_mm": 690, "order_qty": 8, "area_m2": 4.16, "location": "..." },
      ...
      { "item_no": 17, "item_name": "46.76T 8.76투명접합+14Ar+5로이h/s+14Ar.+5로이", "width_mm": 886, "height_mm": 508, "order_qty": 4, "area_m2": 1.80, "location": null }
    ]
  }
  ```
  - ⬜ 품목 수 17개 확인 (소계·합계 행 제외 확인)
  - ⬜ doc_no 정확히 추출 (`26-0385`)
  - ⬜ 날짜 형식 `YYYY-MM-DD` 변환 확인
  - ⬜ 규격 W/H 숫자 분리 확인 (`1,445 X 690` → `1445`, `690`)
  - ⬜ 면적 소수점 2자리 확인 (`4.00`)

### T3-3. DB 저장
- ⬜ `order_docs` 1행 정상 삽입 확인
- ⬜ `order_items` 17행 정상 삽입 확인
- ⬜ `site_name_embedding` 1536차원 벡터 저장 확인
  ```sql
  SELECT array_length(site_name_embedding::real[], 1) FROM order_docs
  WHERE doc_no = '26-0385';
  -- 결과: 1536
  ```
- ⬜ Supabase Storage에 원본 PDF 업로드 확인
- ⬜ `raw_pdf_url` 컬럼에 Storage URL 저장 확인

### T3-4. 재업로드 (upsert) 검증
- ⬜ 동일 doc_no 재업로드 시 order_docs 중복 생성 없음 확인
- ⬜ 기존 order_items 삭제 후 새 데이터로 교체 확인
- ⬜ 관련 production_logs, shipment_logs도 CASCADE 삭제 확인

### T3-5. 업로드 UI
- ⬜ 드래그앤드롭으로 파일 선택 동작 확인
- ⬜ 업로드 중 로딩 스피너 표시 확인
- ⬜ 파싱 완료 후 미리보기 테이블 렌더링 확인
- ⬜ 미리보기에서 값 수정 후 "저장 확정" → DB 반영 확인
- ⬜ PDF 이외 파일 업로드 시 에러 메시지 표시 확인

---

## T4. 현장명 하이브리드 검색 (FR-02)

### T4-1. pg_trgm 퍼지 검색
테스트 전제: DB에 `"부산 메디컬카운터 지역주택조합사업현장"` 등록

- ⬜ **정확 입력**: `"부산 메디컬카운터"` → 정상 매칭
- ⬜ **부분 입력**: `"메디컬카운터"` → 정상 매칭
- ⬜ **오타**: `"메디컬카우터"` (글자 누락) → 유사도 0.3 이상으로 매칭
- ⬜ **유사도 임계값**: 완전히 관련 없는 문자열 → 결과 없음 (0.3 미만)
- ⬜ **복수 후보**: 유사한 현장명 2개 이상 존재 시 목록 반환 확인

### T4-2. pgvector 벡터 검색 (퍼지 결과 없을 때)
- ⬜ pg_trgm에서 결과 없는 키워드로 벡터 검색 폴백 동작 확인
- ⬜ 의미적 유사어: `"부산 메디컬"` → 상위 후보에 정답 포함 확인
- ⬜ 벡터 검색 결과도 없을 때 "현장을 찾을 수 없습니다" 반환 확인

### T4-3. 복수 후보 처리
- ⬜ 후보 2개 이상 시 챗봇이 선택지 제시 확인
- ⬜ 사용자가 특정 현장 선택 후 조회 정상 진행 확인

---

## T5. 자연어 챗봇 (FR-03)

### T5-1. 기본 질의

| 입력 | 기대 동작 |
|------|-----------|
| `"부산 메디컬카운터 현장 미출 유리 있어?"` | 해당 현장 pending_qty > 0 품목 목록 답변 |
| `"이번 주 납기인 현장 알려줘"` | due_date between today~today+7 목록 답변 |
| `"포스코 현장들 생산 완료됐어?"` | customer LIKE '%포스코%' + status='produced' 조회 |
| `"메디컬 현장 전체 수량 얼마야?"` | SUM(order_qty) 집계 답변 |

- ⬜ 각 질의에 대해 SQL 생성 후 정상 실행 확인
- ⬜ 답변이 한국어 자연어로 생성됨 확인
- ⬜ 스트리밍 응답으로 점진적 출력 확인

### T5-2. 기본 조건 자동 적용
- ⬜ 날짜 미언급 시 `due_date >= CURRENT_DATE` 자동 적용 확인
  - 과거 납기 건이 결과에 포함되지 않아야 함
- ⬜ `pending_qty > 0` 기본 필터 적용 확인
  - 전량 출고 완료(shipped) 건이 기본 결과에 포함되지 않아야 함

### T5-3. 오류 및 엣지 케이스
- ⬜ **존재하지 않는 현장명**: `"존재하지않는현장ABC"` → 매칭 실패 안내 출력
- ⬜ **결과 0건**: 조건에 맞는 데이터 없을 때 → "데이터가 없습니다" 출력 (에러 아님)
- ⬜ **DML 시도**: `"모든 데이터 삭제해줘"` → SQL 생성 거부 확인
- ⬜ **Hallucination 방지**: 존재하지 않는 컬럼(예: `unit_price`) 사용 시 → SQL 실행 에러 또는 거부
- ⬜ **오타 현장명**: `"부산메디컬카우터"` → 퍼지 검색 경유 후 정상 답변

### T5-4. SQL 안전성 검증
- ⬜ 생성된 SQL에 `DROP`, `DELETE`, `UPDATE`, `INSERT` 포함 여부 필터링 확인
- ⬜ `order_docs.site_name_embedding` 컬럼 노출 여부 확인 (챗봇 답변에서 제외)

---

## T6. 담당자 대시보드 (FR-04, FR-05, FR-06)

### T6-1. 기본 목록 조회
- ⬜ 대시보드 로드 시 `due_date >= 오늘` 데이터만 표시 확인
- ⬜ 과거 납기 건은 기본 뷰에 노출되지 않음 확인
- ⬜ 미출수량(pending_qty) 값 정확성 확인 (item_status VIEW 값과 일치)
- ⬜ 상태 뱃지 색상 정확성 확인

### T6-2. 고급 검색
- ⬜ 납기일 기간 설정 → 해당 기간 데이터만 표시 확인
- ⬜ 현장명 입력 → 필터링 확인
- ⬜ 상태 필터 → 해당 상태 건만 표시 확인
- ⬜ "초기화" 버튼 → 오늘 이후 기본값으로 복원 확인

### T6-3. 생산 로그 추가
- ⬜ 품목 행 클릭 → 로그 패널 오픈 확인
- ⬜ 생산 로그 추가 폼에서 날짜, 수량, 메모 입력 후 저장 확인
  - ⬜ `production_logs` DB 삽입 확인
  - ⬜ seq 자동 채번 확인
  - ⬜ `updated_by` 기록 확인
- ⬜ 저장 후 테이블의 `total_produced_qty` 즉시 갱신 확인
- ⬜ 수량 합계가 order_qty 초과 시 경고 표시 확인 (선택적)

### T6-4. 출고 로그 추가
- ⬜ 출고 로그 추가 후 `pending_qty` 감소 확인
- ⬜ 전량 출고(pending_qty = 0) 후 status → `shipped` 변경 확인
- ⬜ 수량 합계가 order_qty 초과 시 에러 또는 경고 처리 확인

### T6-5. 로그 수정/삭제
- ⬜ 기존 회차 수정 후 합계 재계산 확인
- ⬜ 회차 삭제 후 seq 번호 정합성 확인 (또는 gap 허용 여부 결정)
- ⬜ 삭제 확인 모달 동작 확인

### T6-6. Realtime 동기화
- ⬜ 브라우저 탭 2개 열고 한 탭에서 로그 추가 → 다른 탭 자동 갱신 확인
- ⬜ 네트워크 재연결 시 Realtime 자동 재구독 확인

---

## T7. Excel 마이그레이션

### T7-1. 파싱 검증 (드라이런)
- ⬜ 발주현황.xlsx 드라이런 실행 → 파싱 결과 CSV 출력 확인
- ⬜ 생산 컬럼 파싱 샘플 검증
  - ⬜ `"1/29 16조"` → `produced_date=YYYY-01-29`, `produced_qty=16`
  - ⬜ datetime 값 → `produced_qty=order_qty`
  - ⬜ `"완료"` → `is_completed=true`
  - ⬜ 메모성 텍스트(`"5/16 전무님"`) → `note` 컬럼
- ⬜ 오류 행 리포트 출력 확인 (파싱 불가 데이터 목록)

### T7-2. DB 적재 검증
- ⬜ 전체 행 수 확인 (Excel 약 11,000행 vs DB order_items 행 수 비교)
- ⬜ 결측값(None) 처리 확인 — DB에 null로 저장
- ⬜ site_name_embedding 생성 완료 확인 (임베딩 없는 행 0건)
- ⬜ 중복 doc_no 처리 확인 (upsert 정상 동작)

---

## T8. 배포 환경 검증

### T8-1. Vercel 배포
- ⬜ `npm run build` 빌드 에러 없음 확인
- ⬜ Vercel 배포 성공 확인
- ⬜ 환경 변수 로드 확인 (프로덕션 환경)
- ⬜ API Route 응답 확인 (`/api/chat`, `/api/upload`, `/api/items`)

### T8-2. 성능 체감
- ⬜ 챗봇 첫 응답 토큰 출력 시간 < 3초 확인
- ⬜ PDF 업로드 → 파싱 완료 시간 < 30초 확인
- ⬜ 대시보드 초기 로드 시간 < 2초 확인
- ⬜ 모바일(375px) 챗봇 UI 레이아웃 깨짐 없음 확인

---

## 자주 발생하는 문제 & 대응 방법

| 증상 | 원인 추정 | 확인 방법 |
|------|-----------|-----------|
| Vision API 파싱 필드 누락 | 프롬프트 필드명 불일치 | 응답 JSON 구조 로그 출력 후 프롬프트 수정 |
| 퍼지 검색 결과 없음 | pg_trgm 인덱스 미생성 | `\d order_docs` 인덱스 목록 확인 |
| 벡터 검색 오류 | pgvector 미활성화 또는 차원 불일치 | 확장 확인 + embedding 차원(1536) 확인 |
| item_status VIEW 값 0 | JOIN 조건 오류 | 각 테이블 직접 SELECT 후 VIEW와 비교 |
| Realtime 미작동 | RLS 정책 차단 또는 채널명 오류 | Supabase 대시보드 Realtime 로그 확인 |
| SQL 생성 후 실행 에러 | 스키마 정보 프롬프트 불일치 | 생성된 SQL 로그 출력 후 컬럼명 검증 |
| PDF 업로드 504 타임아웃 | Vercel 함수 10초 제한 초과 | Edge Runtime 또는 배경 처리(Queue) 전환 고려 |
| 임베딩 생성 느림 | 대량 데이터 순차 처리 | 배치 처리 또는 병렬 처리로 전환 |
