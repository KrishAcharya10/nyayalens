## **NyayaLens - Indian Legal Document Intelligence Platform**

### **Project Overview**

NyayaLens is an advanced **Indian legal document intelligence platform** that converts residential rental agreements and land lease deeds into structured, evidence-grounded information. The system extracts:
- **Entities** (parties, amounts, dates, property details)
- **Clauses** (numbered sections with semantic classification)
- **Risks** (five categories of potentially unfavorable terms with evidence)
- **Relations** (connections between entities)
- **Knowledge graphs** (structured relationships between document components)
- **RAG-powered Q&A** (question answering with full provenance and refusal logic)

All extracted information is **provenance-backed** — every fact carries traceability back to its source location in the original document.

---

### **Technology Stack**

**Frontend (Next.js + React)**
- Next.js 15 for server-side rendering and static generation
- React 18 with TypeScript for component development
- Tailwind CSS for responsive design with design-token system
- Reactflow for knowledge graph visualization
- Vitest for unit testing

**Backend (Node.js + Express)**
- Express.js for REST API
- TypeScript for type safety
- Prisma ORM with PostgreSQL 16
- JWT-based authentication with refresh token rotation
- Rate limiting and security middleware (Helmet, CORS)

**Document Processing**
- PDF extraction: pdfjs-dist (native text) + Tesseract.js (OCR)
- DOCX extraction: mammoth
- PDF rasterization: @napi-rs/canvas (CPU-only, no build tools needed)

**NLP & ML Pipeline**
- Rule-based NER with regex patterns grounded in synthetic data
- Generic-transformer baseline for named entity recognition
- InLegalBERT fine-tuning (Phase 4B) with StratifiedGroupKFold evaluation
- BM25 retrieval for RAG

**Python Services**
- PyTorch for transformer models
- Scikit-learn for evaluation metrics
- Datasets: 300 synthetic documents (150 residential rental, 150 land lease) + 150 adversarial test cases

---

### **Architecture Phases**

The project is organized into 7 development phases, currently implementing **Phase 1-7B**:

#### **Phase 1-2: Repository & Authentication**
- User registration and login
- JWT-based authentication with access + refresh tokens
- Refresh token rotation with family-based revocation
- Argon2id password hashing
- Role-based access control (RBAC): USER, ADMIN

#### **Phase 3: Document Upload & Storage**
- File upload handler (PDF/DOCX, max 20MB)
- Canonical text extraction from documents
- Page-level storage with extraction method tracking (NATIVE/OCR)
- Ownership-based access control

#### **Phase 4A: Extraction Pipeline**
- **Text Extraction**: PDF (native + OCR) and DOCX parsing
- **OCR Pipeline**: PDF rasterization + Tesseract recognition (for scanned pages)
- **Rule-based NER**: 15+ entity types (RENT, LESSOR, SURVEY_NUMBER, LAND_AREA, etc.)
- **Generic-transformer NER**: PyTorch-based baseline model
- **Clause Classification**: Rule-based segmentation into 12+ clause types (LEASE_DURATION, RENT_PAYMENT, SECURITY_DEPOSIT, etc.)

#### **Phase 4B: Fine-tuning & Evaluation**
- InLegalBERT fine-tuning with 5-fold cross-validation
- Metrics: Precision, Recall, F1 (across all three model sources)
- Comparison: RULE_BASED vs GENERIC_TRANSFORMER vs FINE_TUNED
- Span-overlap scoring with IoU ≥ 0.5

#### **Phase 6: Risk Engine & Adversarial Testing**
- **Two-pass architecture**:
  - **Pass 1**: Per-clause risk classification (single-clause context)
  - **Pass 2**: Cross-clause/cross-entity comparison
- **Five risk categories**:
  1. LIABILITY_SHIFT (unfavorable responsibility shifts)
  2. ASYMMETRIC_OBLIGATION (unequal notice periods)
  3. UNBOUNDED_DISCRETION (vague deposit deduction language)
  4. LAND_USE_CONTRADICTION (conflicting use restrictions)
  5. MISSING_CLAUSE (expected clauses absent)
- **Severity levels**: LOW, MEDIUM, HIGH
- **Evidence model**: Multi-span provenance for complex findings
- **Adversarial test set**: 150 documents (15 positive + 15 control per category)

#### **Phase 7A: Knowledge Graph & RAG**
- **Knowledge Graph**: Read-time construction from entities and clauses
- **Chunking Strategy**: 
  - Per-clause chunks (from DocumentClause rows)
  - Preamble-entity chunks (LANDLORD, TENANT, ADDRESS, SURVEY_NUMBER, etc.)
- **RAG Pipeline**: Retrieve → Filter → Generate
- **Providers**:
  - RetrievalProvider: BM25 scoring (TOP_K=3)
  - LLMProvider: Extractive (default) or Anthropic (optional)
- **Features**: 
  - Grounding detection (MIN_BM25_SCORE = 0)
  - Citation accuracy tracking
  - Prompt-injection defense
  - Honest refusal on unanswerable questions

#### **Phase 7B: Legal Intelligence Workspace (UI)**
- **Document Viewer**: Overlap-safe span segmentation (clauses + entities)
- **Intelligence Panel** with tabs:
  - **Overview**: Document metadata and processing status
  - **Entities**: Extracted entities with type labels and confidence
  - **Clauses**: Segmented clauses with types and extracted entities
  - **Risks**: Risk findings with severity, evidence, and trust indicators
  - **Graph**: Knowledge graph visualization (Reactflow)
  - **Ask**: RAG-powered Q&A with mandatory evidence citations
- **Evidence Navigation**: Click-to-highlight evidence in document viewer
- **Trust Indicators**: Permanent, non-dismissible status on risks and answers

---

### **Database Schema (Prisma)**

**Core Models:**
- **User**: Authentication, roles, audit logging
- **RefreshToken**: Token rotation with family-based revocation
- **Document**: Metadata, ownership, processing status, synthetic/adversarial tags
- **DocumentPage**: Page-level text, extraction method, OCR confidence
- **DocumentSection**: Reserved for future use (section-level metadata)
- **DocumentClause**: Labeled clause spans with model_source, confidence, bbox
- **Entity**: Named entities with labels, model_source, confidence, bbox
- **Relation**: Entity-to-entity relationships (reserved for Phase 8+)
- **Risk**: Risk findings with category, severity, pass, evidence array
- **Obligation**: Extracted obligations (reserved for Phase 8+)
- **Embedding**: Vector embeddings for search (reserved for Phase 8+)
- **ProcessingJob**: Pipeline execution tracking (status, timestamps, error messages)

**Enums:**
- **DocumentType**: RESIDENTIAL_RENTAL, LAND_LEASE
- **ModelSource**: RULE_BASED, GENERIC_TRANSFORMER, FINE_TUNED
- **ExtractionMethod**: NATIVE, OCR
- **RiskCategory**: 5 categories as above
- **RiskSeverity**: LOW, MEDIUM, HIGH
- **RiskPass**: PASS_1, PASS_2

---

### **Project Structure**

```
nyayalens/
├── apps/
│   ├── web/                           # Next.js frontend
│   │   ├── src/
│   │   │   ├── app/                   # Next.js routes
│   │   │   │   ├── documents/[id]/    # Workspace page
│   │   │   │   ├── how-it-works/      # Trust/transparency explainer
│   │   │   │   ├── login/, register/  # Auth pages
│   │   │   │   └── api/eval-stats/    # Evaluation results API
│   │   │   ├── components/
│   │   │   │   ├── workspace/         # Document viewer, intelligence panel
│   │   │   │   ├── shell/             # App chrome (sidebar, top bar)
│   │   │   │   └── ui/                # Design-token primitives
│   │   │   └── lib/
│   │   │       ├── spans.ts           # Overlap-safe span segmentation
│   │   │       ├── api.ts             # API client
│   │   │       └── AuthProvider.tsx   # Auth context
│   │   └── tailwind.config.ts         # Design tokens
│   │
│   └── api/                           # Express API
│       ├── src/
│       │   ├── routes/                # API endpoints
│       │   │   ├── auth.ts            # /auth (login, register, refresh)
│       │   │   ├── documents.ts       # /documents (upload, list, details)
│       │   │   └── admin.ts           # /admin (system info)
│       │   ├── extraction/            # Document text extraction
│       │   │   ├── extractText.ts     # Main extractor
│       │   │   ├── pdfExtractor.ts    # PDF native text
│       │   │   └── docxExtractor.ts   # DOCX extraction
│       │   ├── ocr/                   # Optical character recognition
│       │   │   ├── rasterizePdfPage.ts # PDF → PNG
│       │   │   └── runOcr.ts          # Tesseract recognition
│       │   ├── ner/                   # Named entity recognition
│       │   │   ├── rulePatterns.ts    # Rule-based patterns
│       │   │   ├── genericTransformerNer.ts # Transformer baseline
│       │   │   └── types.ts           # NER types
│       │   ├── clauses/               # Clause segmentation & classification
│       │   │   ├── clauseSegmenter.ts # Heading-based segmentation
│       │   │   ├── clauseTaxonomy.ts  # 12+ clause types
│       │   │   └── ruleBasedClauseClassifier.ts
│       │   ├── risk/                  # Risk detection engine
│       │   │   ├── pass1PerClause.ts  # Per-clause checks
│       │   │   ├── pass2CrossClause.ts # Cross-clause checks
│       │   │   ├── runRiskEngine.ts   # Orchestrator
│       │   │   └── types.ts           # Risk types
│       │   ├── rag/                   # Retrieval-augmented generation
│       │   │   ├── chunking.ts        # Clause + entity chunks
│       │   │   ├── runAsk.ts          # Q&A pipeline
│       │   │   ├── bm25Retriever.ts   # BM25 search
│       │   │   ├── llmProviderFactory.ts # Extractive/Anthropic
│       │   │   └── systemInstructions.ts # RAG prompts
│       │   ├── graph/                 # Knowledge graph
│       │   │   ├── buildGraph.ts      # Graph construction
│       │   │   └── loadDocumentGraph.ts
│       │   ├── jobs/                  # Async pipeline infrastructure
│       │   │   ├── pipeline.ts        # Orchestration (6 stages)
│       │   │   ├── queue.ts           # Job queue
│       │   │   └── recovery.ts        # Startup recovery
│       │   ├── storage/               # File storage adapter
│       │   ├── middleware/            # Auth, error handling, rate limiting
│       │   ├── lib/                   # JWT, password hashing
│       │   └── config/                # Environment config
│       ├── scripts/                   # Evaluation & testing scripts
│       │   ├── validate-extraction-sample.mjs
│       │   ├── evaluate-adversarial.mjs
│       │   ├── evaluate-rag.mjs
│       │   └── ...
│       └── rag_eval/                  # RAG test set + results
│
├── packages/
│   └── db/                            # Prisma schema & migrations
│       ├── prisma/
│       │   ├── schema.prisma          # Database schema
│       │   └── migrations/            # Migration history
│       └── generated/
│           └── client/                # Generated Prisma client
│
├── services/
│   └── ml/                            # Python ML services
│       ├── baseline_ner.py            # Generic-transformer NER
│       ├── finetune_ner.py            # InLegalBERT fine-tuning
│       ├── evaluate.py                # Evaluation metrics
│       └── requirements.txt           # Python dependencies
│
├── research/
│   ├── data/
│   │   ├── synthetic/                 # 300 synthetic documents
│   │   ├── real/                      # (Empty - real docs not yet collected)
│   │   └── adversarial/               # 150 adversarial test cases
│   └── generator/                     # Dataset generation code
│       ├── generator.py               # Main generator
│       ├── value_pools.py             # Entity value templates
│       └── adversarial_generator.py   # Adversarial case generation
│
├── docs/
│   ├── architecture/                  # Design documentation
│   │   ├── database.md                # Schema rationale
│   │   ├── auth.md                    # Authentication design
│   │   ├── extraction_pipeline.md     # Phase 4A pipeline
│   │   ├── evaluation_results.md      # Phase 4B metrics
│   │   ├── risk_engine.md             # Phase 6 design
│   │   ├── adversarial_evaluation_results.md # Phase 6 metrics
│   │   ├── knowledge_graph.md         # Phase 7A graph
│   │   ├── rag_design.md              # Phase 7A RAG
│   │   ├── rag_evaluation_results.md  # Phase 7A metrics
│   │   └── ...
│   └── research/                      # Research notes
│       └── adversarial_test_design.md # Test case design
│
├── package.json                       # Workspace root config
├── docker-compose.yml                 # PostgreSQL setup
├── .env.example                       # Environment template
└── README.md                          # This file
```

---

### **Quick Start Guide**

#### **Prerequisites**
- Node.js ≥ 20, npm ≥ 10
- Docker (for PostgreSQL) OR existing PostgreSQL 16 instance
- Python 3.10+ (optional, for ML pipeline)

#### **Installation Steps**

```bash
# 1. Install dependencies
npm install

# 2. Setup environment
cp .env.example .env
# Edit .env: Set JWT_ACCESS_SECRET and JWT_REFRESH_SECRET to random 64-char hex strings:
# node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# 3. Start PostgreSQL
docker compose up -d postgres

# 4. Setup database
npm run db:generate
npm run db:migrate:deploy
npm run db:seed

# 5. Start API and web app (in separate terminals)
npm run dev:api      # Runs on http://localhost:4000
npm run dev:web      # Runs on http://localhost:3000

# 6. Login/Register
# Navigate to http://localhost:3000 → Register → Upload a document
```

#### **Optional: Python ML Service**
```bash
cd services/ml
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt --index-url https://download.pytorch.org/whl/cpu --extra-index-url https://pypi.org/simple

# Set ML_SERVICE_PYTHON in .env to the venv's python.exe path
```

---

### **API Endpoints**

**Authentication**
- `POST /auth/register` — Create user account
- `POST /auth/login` — Login (returns access + refresh tokens)
- `POST /auth/refresh` — Refresh access token
- `POST /auth/logout` — Logout (revokes refresh token)

**Documents**
- `GET /documents` — List user's documents
- `GET /documents/:id` — Get document details
- `GET /documents/:id/summary` — Get document with processing status
- `POST /documents` — Upload document (multipart/form-data)
- `DELETE /documents/:id` — Delete document

**Extraction Results**
- `GET /documents/:id/entities` — List extracted entities
- `GET /documents/:id/clauses` — List extracted clauses
- `GET /documents/:id/risks` — List detected risks

**Intelligence**
- `GET /documents/:id/graph` — Get knowledge graph
- `POST /documents/:id/ask` — Ask question about document (RAG)

**Admin**
- `GET /admin/health` — Health check
- `GET /admin/system-info` — System information

---

### **Frontend Components**

**Document Viewer** (`DocumentViewer.tsx`)
- Renders canonical text with:
  - Clause highlights (subtle background + left border)
  - Entity underlines (smart nesting, no overlap)
- Overlap-safe segmentation via `spans.ts`
- Smooth scroll-to on evidence navigation

**Intelligence Panel** (`IntelligencePanel.tsx`)
- Tabbed interface: Overview → Entities → Clauses → Risks → Graph → Ask
- Click graph nodes to navigate to relevant tab + highlight
- Each tab shows detailed information with evidence buttons

**Ask Panel** (`AskPanel.tsx`)
- Question input with example questions
- RAG-powered answers with grounding status
- Mandatory, non-dismissible evidence citations
- Evaluation stats displayed (if available)

**Risk Panel** (`RiskPanel.tsx`)
- Risk cards by severity (HIGH → MEDIUM → LOW)
- Non-definitive language ("potentially unfavorable")
- Trust indicators and evidence expandable sections

**Document Search** (`DocumentSearch.tsx`)
- Full-text search across clauses and entities
- Highlight matches in document viewer

---

### **Running Tests**

```bash
# All tests (requires running PostgreSQL)
npm run test

# Targeted tests
npm run test -- apps/api/src/ner/rulePatterns.test.ts
npm run test -- apps/web/src/components/workspace/

# Test coverage
npm run test -- --coverage

# Python tests
python -m pytest services/ml/tests

# Linting & type checking
npm run lint
npm run format
npm run typecheck
```

---

### **Extraction Pipeline Stages**

1. **text_extraction**: PDF/DOCX text → DocumentPage rows
2. **ocr**: Scanned pages → Tesseract recognition (if needed)
3. **rule_based_ner**: Rule patterns → Entity rows (confidence 0.7-0.95)
4. **generic_transformer_ner**: PyTorch model → Entity rows (optional)
5. **clause_classification**: Heading patterns → DocumentClause rows
6. **risk_engine**: Clauses/entities → Risk rows (Pass 1 + Pass 2)

Each stage is its own `ProcessingJob` row tracking status, start/end time, errors.

---

### **Risk Categories Explained**

| # | Category | Pass | Applies To | Example |
|---|----------|------|-----------|---------|
| 1 | LIABILITY_SHIFT | 1 | Residential Rental | Tenant responsible for structural repairs (normally Landlord's duty) |
| 2 | ASYMMETRIC_OBLIGATION | 2 | Both | Notice period for eviction differs drastically (e.g., 30 days vs 5 days) |
| 3 | UNBOUNDED_DISCRETION | 1 | Residential Rental | "Deposit deductions at landlord's discretion" without itemization |
| 4 | LAND_USE_CONTRADICTION | 2 | Land Lease | Clause says "agricultural use" but restrictions prohibit cultivation |
| 5 | MISSING_CLAUSE | 1 | Both | No DISPUTE_RESOLUTION clause (expected in both types) |

---

### **Key Design Principles**

1. **Provenance Everything**: Every extracted fact references its source (textStart, textEnd, pageNumber, bbox)
2. **Model Source Transparency**: All entities/clauses tagged with extraction method (RULE_BASED, GENERIC_TRANSFORMER, FINE_TUNED)
3. **Non-Definitive Risk Language**: Risks frame findings as "potentially unfavorable" requiring review, never definitive legal judgments
4. **Honest Refusal**: RAG refuses unanswerable questions instead of hallucinating
5. **Evidence-First UI**: Risk findings and RAG answers always include clickable evidence with permanent indicators
6. **Ownership-Based Access**: Every document scoped to its owner; 403/404 on unauthorized access
7. **Deterministic Chunking**: Same input rows in any order produce same chunk list (testable)
8. **Defensive Against Prompt Injection**: RAG system instructions isolated, input validation, refusal on injection patterns

---

### **Development Commands**

```bash
# Development
npm run dev:api           # Start API (port 4000)
npm run dev:web           # Start web app (port 3000)

# Building
npm run build             # Build all packages
npm run typecheck         # TypeScript validation
npm run lint              # ESLint check
npm run format:write      # Auto-format code

# Database
npm run db:generate       # Generate Prisma client
npm run db:migrate:dev    # Create + apply new migration
npm run db:migrate:deploy # Apply migrations to production DB
npm run db:seed           # Load synthetic metadata
npm run db:studio         # Open Prisma Studio (GUI)

# Testing & Evaluation
npm run test              # Run all tests
npm run test -- --watch   # Watch mode
node apps/api/scripts/validate-extraction-sample.mjs 10
node apps/api/scripts/evaluate-adversarial.mjs
node apps/api/scripts/evaluate-rag.mjs
```

---

### **Configuration**

All configuration via `.env` (see `.env.example` for full list):

- **Database**: `DATABASE_URL` (PostgreSQL 16)
- **API**: `API_PORT` (default 4000), `NODE_ENV`
- **Auth**: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, token TTLs, Argon2 params
- **Storage**: `STORAGE_ROOT`, `MAX_UPLOAD_SIZE_MB`
- **ML**: `ML_SERVICE_PYTHON` (path to Python venv, optional)
- **Web**: `NEXT_PUBLIC_API_BASE_URL`
- **RAG**: `LLM_PROVIDER` (extractive/anthropic), `ANTHROPIC_API_KEY`

---

### **Known Limitations & Scope**

✅ **Implemented:**
- Residential rental agreements & land lease deeds
- 300 synthetic + 150 adversarial test documents
- Rule-based + generic-transformer + fine-tuned NER
- 12+ clause types with semantic classification
- 5 risk categories with 2-pass detection
- Knowledge graph (entities + clauses + relations)
- RAG with grounding detection and refusal logic
- Full-stack workspace UI with evidence navigation

❌ **Out of Scope (Explicitly):**
- Commercial leases, general contracts
- Real documents (research/data/real/ is empty)
- Embeddings / vector search
- Real generative answer synthesis (no LLM key configured by default)
- Relation extraction (schema reserved but unimplemented)
- Obligation extraction (schema reserved but unimplemented)

---

### **Documentation**

Detailed architecture docs in `docs/architecture/`:
- `database.md` — Schema design & normalization
- `auth.md` — JWT flow, refresh token rotation, RBAC
- `extraction_pipeline.md` — OCR, NER, clause classification
- `evaluation_results.md` — Phase 4B metrics (precision/recall/F1)
- `risk_engine.md` — Pass 1/Pass 2 architecture, 5 categories
- `adversarial_evaluation_results.md` — Phase 6 metrics
- `rag_design.md` — Chunking, retrieval, generation, security
- `rag_evaluation_results.md` — Phase 7A metrics
- `knowledge_graph.md` — Graph construction & traversal
- `provenance.md` — Evidence model & traceability

---

### **Contributing**

1. **Code Style**: ESLint + Prettier (check with `npm run format`)
2. **Type Safety**: `npm run typecheck --strict`
3. **Tests**: Required for new features (run with `npm run test`)
4. **Documentation**: Update `docs/architecture/` if design changes
5. **Database**: Use Prisma migrations (`npm run db:migrate:dev`)

---

### **License & Attribution**

This is a college NLP project demonstrating legal document intelligence. The synthetic dataset and evaluation frameworks are for research purposes only.

---

This comprehensive README covers the entire architecture, key components, setup, API, database, phases, and design principles. It provides both high-level overview and specific implementation details for developers working with any part of the system.