# evaluation-back-end

Project NOVA 심사 웹 시스템의 백엔드 (Express + Mongoose, TypeScript). 회의실 동시 심사용 단일 웹앱의 API 서버이며 MongoDB Atlas + Cloudtype 배포를 전제로 합니다.

> Source spec: `/Users/yongs/workspace/Skill/.omc/specs/deep-interview-nova-judging-web.md`
> Plan: `/Users/yongs/workspace/Skill/.omc/plans/nova-judging-web-plan.md`

## 개요

- **심사 단위**: 심사위원 7명 (유동) × 35팀 × 5항목 (1~5점, step 0.5)
- **환산점**: `(점수 / 5) × 가중치(%)` → 0~100점
- **순위 결정**: PDF 동점 처리 5단계 (0차 가중 총점 → 1차 구현 raw → 2차 차별 → 3차 문제정의 → 4차 STDEV asc → 5차 TF 합의)
- **인증**: 이름 선택 + 4자리 PIN (bcrypt) → JWT HS256 12h
- **자동 저장**: 별도 제출 단계 없음, debounce 800ms PATCH

## 환경 변수

`.env.example` 참고. 운영 배포 시 모든 값을 Cloudtype의 환경 변수로 등록.

| 키 | 필수 | 기본값 | 설명 |
|---|---|---|---|
| `MONGODB_URI` | ✅ | `mongodb://localhost:27017/nova-judging` | MongoDB Atlas 연결 문자열 |
| `JWT_SECRET` | ✅ | — | HS256 서명용 비밀키. 32+ 바이트 랜덤 권장 |
| `JWT_TTL` |  | `12h` | JWT 만료 시간 (`vercel/ms` 포맷) |
| `CORS_ORIGINS` | ✅ | `http://localhost:5173` | 콤마 구분 origin 화이트리스트 (Vercel preview/production 등록) |
| `PORT` |  | `3000` | Express 리스닝 포트 |
| `NODE_ENV` |  | `development` | `production` 시 보안 헤더 강화 |
| `BCRYPT_ROUNDS` |  | `10` | PIN bcrypt cost factor |
| `LOGIN_RATE_LIMIT_MAX` |  | `10` | 1분당 로그인 시도 한도 (IP+name) |
| `LOGIN_RATE_LIMIT_WINDOW_MS` |  | `60000` | rate-limit 윈도우 (ms) |
| `SEED_MD_PATH` |  | `./seed-data/팀별_스킬_정리.md` | 시드 원천 md 파일 |
| `ADMIN_NAME` |  | — | 시드 시 생성할 admin 계정 이름 |
| `ADMIN_PIN` |  | — | 시드 시 admin 초기 PIN (4자리) |

## 로컬 실행

```bash
# 1. 의존성 설치
npm install

# 2. 환경 변수 작성
cp .env.example .env
# .env 의 MONGODB_URI, JWT_SECRET 등 채우기

# 3. 시드 적재 (9 divisions, 35 teams, 5 criteria + admin 계정)
npm run seed

# 4. 개발 서버 (tsx watch)
npm run dev

# 5. 빌드 + 프로덕션 실행
npm run build
npm start

# 기타
npm run typecheck   # tsc --noEmit
npm test            # vitest run
npm run sync-types  # shared/types.ts → ../evaluation-front/src/types/shared.ts
```

서버 기동 후 `curl http://localhost:3000/healthz` 로 상태 확인.

## MongoDB Atlas (M0 무료 티어) 셋업

1. https://cloud.mongodb.com 가입 후 **Build a Database** → **M0 Free** 선택 (us-east-1 또는 ap-northeast-2)
2. **Database Access** → 사용자 생성 (read/write 권한)
3. **Network Access** → Cloudtype IP 또는 `0.0.0.0/0` (시연 후 제한)
4. **Databases** → **Connect** → **Drivers** → Node.js 5+ 선택 → 연결 문자열 복사
5. `<password>` 자리 채워 `MONGODB_URI` 로 등록. DB 이름은 `?retryWrites=true&w=majority` 앞에 `/nova` 추가
6. 시드 후 컬렉션 6개 확인: `divisions`, `teams`, `criteria`, `judges`, `evaluations`, `settings`

> 무료 티어 연결 풀 한도 500. 본 앱은 `maxPoolSize=5`로 제한되어 7개 동시 클라이언트 환경에서 안전합니다.

## Cloudtype 배포

### Dockerfile (자동 빌드 사용 시 불필요, Cloudtype Node 빌드팩으로 충분)

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["node", "dist/src/server.js"]
```

### Cloudtype 콘솔 설정

1. **새 프로젝트** → GitHub 연동 → `evaluation-back-end` 선택
2. 빌드 타입: **Node.js**
3. **Build command**: `npm install && npm run build`
4. **Start command**: `node dist/src/server.js`
5. **Port**: `3000`
6. **환경 변수**: 위 표의 키 모두 입력 (`NODE_ENV=production` 필수, `JWT_SECRET`은 안전한 랜덤 문자열)
7. **Health check**: `/healthz` (200 응답)
8. **Auto deploy**: main 브랜치 푸시 시 자동 배포

배포 후 발급된 도메인을 메모. 프론트 (`evaluation-front`)의 `VITE_API_BASE_URL` 환경 변수에 등록.

## Vercel (프론트) CORS 화이트리스트

Cloudtype 백엔드의 `CORS_ORIGINS` 에 다음 모두 추가 (콤마 구분):

```
https://evaluation-front.vercel.app,
https://evaluation-front-<team>.vercel.app,
https://*.vercel.app   # preview 모두 허용 시 (선택)
```

Vercel preview URL 패턴이 PR마다 달라지므로, 본선 시연 전 production 도메인만 남기고 `*.vercel.app` 는 제거 권장.

## 시연/리허설 워밍업

Cloudtype 무료 티어는 콜드스타트로 첫 응답이 5~10초 지연될 수 있습니다. 회의 30분 전:

```bash
# 1. 백엔드 워밍업
for i in {1..20}; do curl -s https://<cloudtype-domain>/healthz > /dev/null; sleep 60; done &

# 2. 프론트 + 인증 + 평가 화면 1회 로드
open https://evaluation-front.vercel.app/login
```

또는 회의실에서 Cron `*/1 * * * * curl https://<domain>/healthz` 을 별도 머신에서 1분 간격 실행.

## CSV / XLSX export

Admin 화면 `/admin/teams` 에서 **Export** 버튼:
- **CSV**: UTF-8 + BOM, Excel 한글 정상 표시. 컬럼 PDF 「09. 최종 순위」 시트와 1:1 매핑
- **XLSX**: `xlsx` 라이브러리로 직접 작성. 시트 1: 본부별 순위, 시트 2: 심사위원별 점수표

수동 백업: 매일 1회 admin이 export 수행, Google Drive 업로드. Atlas M0 자동 백업 없음 → 시연 전 반드시 수동 스냅샷.

## 백업/복구

- **백업**: Atlas Web UI → Collections → Export collection (JSON). 또는 admin export(CSV/XLSX) + `db.evaluations.find().forEach(printjson)` 출력 저장
- **복구**: `mongorestore --uri="$MONGODB_URI" dump/` 또는 admin UI에서 `npm run seed -- --reset` 후 백업 JSON re-import
- **롤백**: 평가 시작 전 `db.evaluations.copyTo('evaluations_backup_YYYYMMDD')` 권장

## 디렉토리 구조

```
evaluation-back-end/
├── shared/types.ts        # 프론트와 공유하는 도메인 타입 SOT
├── scripts/sync-types.sh  # shared/types.ts → frontend repo 복사
├── src/
│   ├── server.ts          # Express bootstrap, helmet+cors+json+/healthz
│   ├── db.ts              # mongoose connect (retry, pool=5)
│   ├── config.ts          # env loader
│   ├── models/            # Judge, Division, Team, Criterion, Evaluation, Settings
│   ├── routes/            # auth, teams, criteria, evaluations, stats, admin
│   ├── middleware/        # jwt verify, role guard, rate-limit
│   ├── services/          # rankTeams, aggregate stats
│   └── seed/              # md 파서 + 시드 실행
├── tests/
│   └── fixtures/tiebreak-golden.json  # G1~G5 동점 처리 케이스
└── .env.example
```

## 상태 코드 규약

| 상황 | 코드 |
|---|---|
| 정상 | 200 |
| 토큰 없음 | **401 unauthorized** |
| 권한 부족 (judge가 admin endpoint, judge + disclosure=false) | **403 forbidden** |
| 입력 검증 실패 | 400 bad_request |
| Optimistic lock 충돌 (If-Match version 불일치) | **409 conflict** |
| Rate-limit 초과 | 429 too_many_requests |
| 서버 오류 | 500 internal_error |

## API 개요

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/healthz` | — | 기본 헬스체크 |
| POST | `/api/auth/login` | — | name+pin → JWT (rate-limited) |
| GET | `/api/teams` | judge | 35팀 + division 조인 |
| GET | `/api/criteria` | judge | 5항목 + 가중치 |
| GET | `/api/me/evaluations` | judge | 본인 모든 평가 |
| PATCH | `/api/evaluations/:teamId` | judge | upsert + `If-Match: version` |
| GET | `/api/stats/teams` | judge(disclosureOpen=true)/admin | RankedTeam[] |
| GET | `/api/admin/progress` | admin | 심사위원별 완료 카운트 |
| GET | `/api/admin/progress/stream` | admin (JWT via `?token=`) | SSE 5초 push, polling fallback 가능 |
| POST/DELETE | `/api/admin/judges` | admin | 심사위원 추가/제거 |
| PATCH | `/api/admin/judges/:id/pin` | admin | PIN 재발급 (bcrypt 신규 hash) |
| PATCH | `/api/admin/settings` | admin | `disclosureOpen` 토글 |

## 참고

- 동점 처리 알고리즘은 `src/services/rankTeams.ts` 와 `tests/fixtures/tiebreak-golden.json` 골든 케이스로 강제 검증됩니다. PDF 「09. 최종 순위」 규정과 100% 일치하도록 G1~G5 5케이스 unit test 통과 시에만 배포.
- Shared types는 백엔드가 SOT 입니다. `shared/types.ts` 수정 후 반드시 `npm run sync-types` 로 프론트에 복사하고 양쪽 커밋.
