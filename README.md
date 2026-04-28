# Prism DRE System — Documentação Técnica

Sistema financeiro da **Brave Educação** para importação de extratos OFX, classificação de lançamentos e geração de DRE por unidade/mês. Desenvolvido em Next.js 14 + Prisma + PostgreSQL (Neon), hospedado na Vercel com deploy automático via GitHub.

---

## Stack

- **Next.js 14** (App Router, full-stack — páginas e APIs no mesmo projeto)
- **Prisma ORM** + **PostgreSQL** (Neon free tier, `sa-east-1`)
- **Recharts** para gráficos
- **TypeScript** strict
- **Vercel** para deploy (build: `prisma generate && prisma db push && next build`)

### Variáveis de ambiente (Vercel)
```
DATABASE_URL=   # Neon connection pooling URL
DIRECT_URL=     # Neon direct URL (para migrations)
ANTHROPIC_API_KEY=  # Claude API (assistente IA na página AI)
```

---

## Estrutura de arquivos

```
financeiro/
├── prisma/
│   └── schema.prisma          # Modelos do banco
├── src/
│   ├── app/
│   │   ├── layout.tsx         # Title: "Prism DRE System", favicon losango amarelo
│   │   ├── page.tsx           # Redirect para /dashboard
│   │   ├── dashboard/         # Visão geral com métricas e gráfico DRE
│   │   ├── dre/               # DRE detalhada por mês/unidade
│   │   ├── lancamentos/       # Importação OFX + classificação (página principal)
│   │   ├── plano-de-contas/   # CRUD do plano de contas
│   │   ├── saldo/             # Evolução do saldo bancário
│   │   ├── unidades/          # Cadastro de unidades e contas bancárias
│   │   └── api/
│   │       ├── accounts/      # CRUD contas do plano (GET, POST, PUT, DELETE)
│   │       ├── classify/
│   │       │   └── suggest/   # POST — sugestões do classificador inteligente
│   │       ├── dre/           # GET — cálculo DRE agregado
│   │       ├── ofx/
│   │       │   ├── route.ts   # POST — salva lançamentos OFX em lote
│   │       │   └── parse/     # POST — parseia arquivo OFX (preview)
│   │       ├── saldo/         # GET — snapshots de saldo por conta bancária
│   │       ├── transactions/  # GET lista, PUT classifica, DELETE remove
│   │       └── units/         # GET unidades com bankAccounts aninhados
│   ├── components/
│   │   ├── Shell.tsx          # Layout (topbar "Prism" + sidebar com nav)
│   │   ├── AccountCombobox.tsx# Combobox buscável para seleção de conta do plano
│   │   └── AIAssistant.tsx    # Assistente IA (Claude API)
│   └── lib/
│       ├── prisma.ts          # PrismaClient singleton + seed de unidades/bancos/conta neutra
│       ├── ofx-parser.ts      # Parser OFX (transações, saldo, banco)
│       ├── dre.ts             # Cálculo do DRE (calcDRE, MONTH_NAMES)
│       └── classifier.ts      # tokenize() + jaccardSimilarity() para sugestões
└── src/app/icon.svg           # Favicon: losango amarelo (#eaca2d)
```

---

## Banco de dados (schema.prisma)

### Modelos

**Unit** — Unidades do negócio (MATRIZ, CICERO, CIPO, NOVA SOURE, FERNANDA)
- `id`, `name` (unique)
- Relações: `bankAccounts[]`, `transactions[]`

**BankAccount** — Contas bancárias vinculadas a uma unidade
- `id`, `name`, `unitId`, `initialBalance` (Float, default 0)
- `ofxBankId String?` — identificador OFX (BANKID ou ORG do `<FI>`)
- `ofxAcctId String?` — número da conta OFX (ACCTID)
- Usado para auto-identificar o banco ao importar OFX

**Account** — Plano de contas
- `id`, `code` (unique, ex: "3.1.1"), `name`, `type`, `dreGroup`, `active`
- Tipos: `RECEITA`, `DESPESA`, `ATIVO`, `PASSIVO`, `NEUTRO`
- `dreGroup` controla onde aparece no DRE
- Conta especial: `9.9.01 — Transferência entre Contas` (type=NEUTRO) — ao classificar, exibe seletores de unidade/conta destino e cria contrapartida automaticamente; aparece na DRE como seção informativa sem contabilizar

**Transaction** — Lançamentos financeiros
- `id`, `date`, `description`, `amount`, `memo?`, `fitid?` (unique — previne duplicatas OFX)
- `accountId?` — conta do plano (null = não classificado, não entra no DRE)
- `unitId?`, `bankAccountId?`
- `transferToUnitId?`, `transferToBankAccountId?` — preenchidos quando é saída de transferência; a contrapartida de entrada é criada automaticamente com `fitid + '_entrada'`
- `month`, `year` — índices para filtro

**BalanceSnapshot** — Saldos capturados via OFX
- `id`, `bankAccountId`, `date`, `balance`
- `@@unique([bankAccountId, date])` — um snapshot por conta por dia
- Populado por: linhas `isBalance` do OFX + bloco `<LEDGERBAL>`

### Seed automático (prisma.ts)
Ao iniciar, `seedUnits()` cria as 5 unidades e seus bancos se não existirem. `seedTransferAccount()` garante a conta 9.9.01.

Unidades e bancos pré-configurados:
```
MATRIZ:      ITAU MATRIZ, BRADESCO MATRIZ, BNB MATRIZ, BB MATRIZ
CICERO:      ITAU CICERO, BRADESCO CICERO
CIPO:        ITAU CIPO, BRADESCO CIPO
NOVA SOURE:  ITAU NOVA SOURE, CAIXA NOVA SOURE
FERNANDA:    ITAU FERNANDA, BRADESCO FERNANDA, BNB FERNANDA
```

---

## Funcionalidades principais

### Importação OFX (`/lancamentos`)

**Fluxo:**
1. Usuário arrasta/seleciona arquivo `.OFX`
2. `POST /api/ofx/parse` parseia o arquivo:
   - **Detecta a conta bancária primeiro**, depois verifica duplicatas de `fitid` escopadas à mesma conta — evita falsos positivos entre bancos diferentes
   - Extrai `<FI><ORG>` e `<BANKACCTFROM>` para identificar o banco
   - Extrai `<LEDGERBAL>` (saldo final)
   - Extrai todas as `<STMTTRN>` — marca `isBalance=true` se `TRNTYPE=BALANCE` ou memo começa com "SALDO"
3. Preview é exibido — linhas `isBalance` aparecem travadas (sem combobox)
4. Classificador inteligente roda em background (`POST /api/classify/suggest`) e abre painel flutuante com sugestões
5. Analista revisa, aceita/nega por linha ou em lote, pode arrastar o painel pela tela
6. `POST /api/ofx` salva em lote:
   - `createMany({ skipDuplicates: true })` — uma query para todas as transações
   - Salva linhas `isBalance` como `BalanceSnapshot` diários
   - Salva `LEDGERBAL` como `BalanceSnapshot`
   - Atualiza `ofxBankId/ofxAcctId` na conta bancária (primeira vez)

**Parser OFX (`ofx-parser.ts`):**
- Extrai `<ORG>` do bloco `<FI>` (aparece sem tag de fechamento em alguns bancos)
- Data OFX no formato `YYYYMMDD[HHMMSS[+offset]]`
- `isBalance`: `TRNTYPE=BALANCE` ou memo começa com `/^saldo\b/i`

### Classificador Inteligente (`/api/classify/suggest`)

Algoritmo baseado em similaridade Jaccard sem dependências externas:

```
tokenize(memo): lowercase → remove números → remove não-letras → split → filtra tokens > 2 chars
jaccardSimilarity(A, B): |A∩B| / |A∪B|
```

**Fluxo:**
1. Carrega até 10.000 transações classificadas do histórico (excluindo Transferência entre Contas)
2. Deduplica: por memo único, mantém a conta mais frequente
3. Para cada memo novo, calcula similaridade com todas as referências
4. Retorna sugestões com score ≥ 0.35, com `confidence` (0-100%)

**Propagação em tempo real:** quando analista classifica uma linha manualmente, aplica a mesma conta nas linhas com similaridade ≥ 0.25 ainda não classificadas.

**Painel flutuante:** aparece centralizado, arrastável pelo header, minimizável. Botões ✓/✕ por linha. "Aceitar todas" / "Negar todas".

### Classificação de conta (`AccountCombobox.tsx`)

Combobox buscável por nome ou código. Contas `NEUTRO` aparecem no topo com separador visual. Botão ✕ para limpar.

### Saldo Bancário (`/saldo`)

Exibe evolução do saldo usando apenas os `BalanceSnapshot` registrados. Gráfico de linha com Recharts. Um ponto por importação OFX (cada linha isBalance + LEDGERBAL = pontos diários).

### DRE (`/dre`)

Cálculo em `lib/dre.ts`. Agrupa transações por `dreGroup` da conta do plano. Filtra por mês/ano/unidade. Transferências entre contas aparecem ao final numa **seção informativa** (tipo `'transfer'`) que não contabiliza nos totais financeiros.

---

## Decisões técnicas importantes

**TypeScript no Vercel:** o compilador alvo não suporta `for...of` em `Map`/`Set` nem spread `[...set]`. Sempre usar `Array.from()`:
```typescript
// ❌ falha no build
for (const [k, v] of map) { ... }
const arr = [...set]

// ✅ correto
Array.from(map.entries()).forEach(([k, v]) => { ... })
const arr = Array.from(set)
```

**Neon PostgreSQL:** banco em `sa-east-1` (São Paulo). Free tier: 0.5 GB storage, 5h compute/mês. Com ~530 transações/mês × 12 contas ≈ 6.360 tx/mês ≈ 12.7 MB/mês → ~3 anos de capacidade.

**Performance de import:** usar `createMany` em vez de loop `await create` individual — reduz 530 round-trips para 1 query SQL.

**Conta neutra:** `9.9.01 — Transferência entre Contas` (type=NEUTRO) não entra no DRE (excluída em `calcDRE` + no `classify/suggest`). Aparece no topo do combobox destacada.

---

## Deploy

Repositório: `github.com/Sav-Coelho/prism-financeiro` (branch `main`)
Vercel auto-deploya a cada push.

Build script (`package.json`):
```
prisma generate && prisma db push && next build
```

`prisma db push` sincroniza o schema sem migrations versionadas.

---

## Identidade visual

- Fonte principal do brand: **Bricolage Grotesque** (`--font-sub`)
- Cor amarela: `#eaca2d` (`--brave-yellow`)
- Cor escura: `var(--brave-dark)`
- CSS global em `src/app/globals.css`
- Sem bibliotecas de UI — estilos inline + classes CSS próprias (`.card`, `.btn`, `.metric-card`, `.form-select`, `.badge-neutro`, etc.)
- Favicon: `src/app/icon.svg` — losango amarelo simples
