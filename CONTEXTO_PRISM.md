# CONTEXTO_PRISM — Referência técnica completa para Claude

Sistema financeiro da **Brave Educação** chamado **Prism DRE System**. Gerencia importação de extratos OFX, classificação de lançamentos e geração de DRE mensal por unidade.

Dono/dev: Savio (savio@braveeducacao.com.br)
Repositório: `github.com/Sav-Coelho/prism-financeiro` (branch `main`)
Deploy: Vercel (hobby plan) — auto-deploy a cada push no main
Banco: PostgreSQL na Neon, região `sa-east-1` (São Paulo), free tier

---

## Stack

| Camada | Tech |
|--------|------|
| Frontend | Next.js 14 (App Router) + TypeScript strict |
| Backend | API Routes serverless (mesmo projeto) |
| ORM | Prisma 5.10 |
| DB | PostgreSQL — Neon free (0.5 GB, 5h compute/mês) |
| Gráficos | Recharts |
| Deploy | Vercel — `prisma generate && prisma db push && next build` |

Env vars (Vercel):
```
DATABASE_URL=   # URL com connection pooling (runtime)
DIRECT_URL=     # URL direta (para prisma db push no build)
```
`ANTHROPIC_API_KEY` está configurado mas o assistente IA foi desativado.

---

## Estrutura de arquivos

```
financeiro/
├── prisma/
│   └── schema.prisma              # 5 modelos
├── src/
│   ├── app/
│   │   ├── layout.tsx             # Title="Prism DRE System", favicon losango amarelo
│   │   ├── page.tsx               # Redirect → /dashboard
│   │   ├── globals.css            # Sistema de design (sem biblioteca UI)
│   │   ├── dashboard/page.tsx     # KPIs + gráfico DRE anual
│   │   ├── dre/page.tsx           # DRE estruturado + gráfico anual + histórico
│   │   ├── lancamentos/page.tsx   # Importação OFX + classificação (página principal, ~760 linhas)
│   │   ├── plano-de-contas/       # CRUD de contas do plano
│   │   ├── saldo/page.tsx         # Evolução de saldo por conta bancária
│   │   ├── unidades/              # CRUD de unidades e contas bancárias
│   │   └── api/
│   │       ├── accounts/route.ts             # GET lista, POST cria
│   │       ├── accounts/[id]/route.ts        # PUT edita, DELETE remove
│   │       ├── accounts/import/route.ts      # POST importação Excel/CSV
│   │       ├── classify/suggest/route.ts     # POST sugestões Jaccard
│   │       ├── dre/route.ts                  # GET DRE mensal + yearData
│   │       ├── ofx/route.ts                  # POST salva lançamentos OFX em lote
│   │       ├── ofx/parse/route.ts            # POST parseia OFX → preview
│   │       ├── saldo/route.ts                # GET snapshots de saldo
│   │       ├── transactions/route.ts         # GET lista filtrada, POST cria
│   │       ├── transactions/[id]/route.ts    # PUT classifica, DELETE remove
│   │       └── units/route.ts               # GET unidades com bankAccounts aninhados
│   ├── components/
│   │   ├── Shell.tsx              # Layout: topbar "Prism" + sidebar 6 itens
│   │   └── AccountCombobox.tsx    # Combobox buscável por nome/código
│   └── lib/
│       ├── prisma.ts              # Singleton PrismaClient + seed automático
│       ├── ofx-parser.ts          # Parser OFX (transações, saldo LEDGER, info banco)
│       ├── dre.ts                 # calcDRE() + DRELineType + MONTH_NAMES
│       └── classifier.ts          # tokenize() + jaccardSimilarity()
```

---

## Schema do banco (`prisma/schema.prisma`)

### Unit
```
id        Int     @id @default(autoincrement())
name      String  @unique
bankAccounts BankAccount[]
transactions Transaction[]
```
Unidades fixas (criadas pelo seed): MATRIZ, CICERO, CIPO, NOVA SOURE, FERNANDA

### BankAccount
```
id             Int     @id
name           String
unitId         Int
initialBalance Float   @default(0)
ofxBankId      String? — identificador OFX (BANKID ou ORG do <FI>)
ofxAcctId      String? — número da conta OFX (ACCTID)
transactions     Transaction[]
balanceSnapshots BalanceSnapshot[]
```
Usado para auto-identificar a conta ao importar OFX.

Bancos pré-configurados no seed:
```
MATRIZ:     ITAU MATRIZ, BRADESCO MATRIZ, BNB MATRIZ, BB MATRIZ
CICERO:     ITAU CICERO, BRADESCO CICERO
CIPO:       ITAU CIPO, BRADESCO CIPO
NOVA SOURE: ITAU NOVA SOURE, CAIXA NOVA SOURE
FERNANDA:   ITAU FERNANDA, BRADESCO FERNANDA, BNB FERNANDA
```

### Account (Plano de contas)
```
id       Int     @id
code     String  @unique  — ex: "3.1.1"
name     String
type     String           — RECEITA | DESPESA | ATIVO | PASSIVO | NEUTRO
dreGroup String           — agrupa no DRE (ex: "Receita Operacional")
active   Boolean @default(true)
```
**Conta especial:** `9.9.01 — Transferência entre Contas` (type=NEUTRO)
- Aparece no topo do AccountCombobox com ícone ↔ e separador visual
- Não entra nos totais do DRE, mas aparece na seção informativa

### Transaction
```
id            Int      @id
date          DateTime
description   String
amount        Float
memo          String?
fitid         String?  @unique  — previne duplicatas OFX
accountId     Int?             — null = não classificado, não entra no DRE
unitId        Int?
bankAccountId Int?
transferToUnitId        Int?   — preenchido quando é uma saída de transferência
transferToBankAccountId Int?   — preenchido quando é uma saída de transferência
month         Int              — índice para filtro
year          Int              — índice para filtro
```

**Lógica de transferências:**
- Transação original (saída): `amount < 0`, `transferToUnitId` e `transferToBankAccountId` preenchidos
- Contrapartida (entrada): criada automaticamente com `fitid = original_fitid + '_entrada'`, `amount = Math.abs(original)`, `unitId` e `bankAccountId` = destino da transferência
- Ambas têm `accountId` apontando para `9.9.01 — Transferência entre Contas`

### BalanceSnapshot
```
id            Int     @id
bankAccountId Int
date          DateTime
balance       Float
@@unique([bankAccountId, date])
```
Um snapshot por conta por dia. Populado pelas linhas `isBalance` e pelo `<LEDGERBAL>` do OFX.

---

## Fluxo de Importação OFX (`/lancamentos`)

### Parse (POST /api/ofx/parse)

1. Recebe arquivo `.OFX` via FormData
2. **Detecta a conta bancária primeiro** (por `ofxBankId+ofxAcctId` ou `org+acctId`)
3. Verifica duplicatas de `fitid` **escopadas à mesma conta bancária** — evita falsos positivos entre extratos de bancos diferentes
4. Retorna: lista de transações com `alreadyImported`, `isBalance`, info do banco, `matchedBankAccount`, `ledgerBalance`

### Preview na UI (`lancamentos/page.tsx`)

- Transações com `alreadyImported=true`: checkbox desabilitado, badge "já importada"
- Transações com `isBalance=true`: sem combobox, badge "saldo", usadas apenas para BalanceSnapshot
- Classificador inteligente roda em background → painel flutuante arrastável com sugestões
- **Se conta selecionada for Transferência entre Contas:** aparecem dois selects em cascata:
  - Unidade destino (todas as unidades)
  - Conta bancária destino (contas da unidade selecionada)
  - Auto-propagação Jaccard é bloqueada para transferências (cada uma tem destino diferente)

### Save (POST /api/ofx)

Recebe lista de transações com `accountId`, `unitId`, `transferToUnitId?`, `transferToBankAccountId?`.

1. `createMany({ skipDuplicates: true })` — salva todas as transações originais
2. Para transações com `transferToBankAccountId` preenchido: cria contrapartidas de entrada automaticamente
3. Salva BalanceSnapshots (linhas `isBalance` + `LEDGERBAL`)
4. Atualiza `ofxBankId/ofxAcctId` na conta bancária (primeira vez que o extrato é importado)

---

## Classificador Inteligente

**Arquivo:** `src/lib/classifier.ts` + `src/app/api/classify/suggest/route.ts`

```
tokenize(memo): lowercase → remove dígitos → remove não-letras → split → filtra tokens > 2 chars
jaccardSimilarity(A, B): |A∩B| / |A∪B|
```

**API suggest:**
1. Carrega até 10.000 transações classificadas do histórico (excluindo dreGroup = 'Transferência entre Contas')
2. Deduplica: por memo único, mantém conta mais frequente
3. Para cada memo novo, calcula similaridade com todas as referências
4. Retorna sugestões com score ≥ 0.35 (confidence 0-100%)

**Propagação em tempo real:** ao classificar uma linha manualmente, aplica a mesma conta nas linhas com similaridade ≥ 0.25 ainda não classificadas. Não propaga transferências.

**Painel de sugestões:** flutuante, arrastável pelo header, minimizável. Aceitar/negar por linha ou em lote.

---

## DRE (`src/lib/dre.ts`)

### Tipos
```typescript
export type DRELineType = 'section' | 'group' | 'account' | 'subtotal' | 'breakeven' | 'transfer'
```
O tipo `'transfer'` renderiza com estilo separado (cinza azulado, linha tracejada) e não afeta nenhum total.

### calcDRE()

Agrupa transações por `dreGroup`. Estrutura calculada:

```
Receita Operacional
Deduções sobre a Venda
= Receita Líquida de Vendas

(-) Custos Variáveis
  Custo do Produto/Serviço
  Despesa Variável
= Margem de Contribuição
= PEO (Ponto de Equilíbrio Operacional)

(-) Custos Fixos
  Despesas Administrativas
  Despesas Financeiras
  Despesas com Pessoal
  Despesas com Marketing
= Lucro Operacional (EBIT)
= PEI (Ponto de Equilíbrio de Investimentos)

(-) Investimentos
= Lucro após os Investimentos
= PEF (Ponto de Equilíbrio Financeiro)

(+/-) Outras Receitas e Despesas Não Operacionais
= Lucro antes dos Impostos

Impostos
= Lucro Líquido

--- Transferências entre Contas (type='transfer', apenas informativo) ---
  Saídas de Transferência
  Entradas de Transferência
```

**Pontos de equilíbrio:**
- `PEO = custosFixos / (margem / receitaOp)`
- `PEI = (custosFixos + invest) / mcPct`
- `PEF = (custosFixos + invest + max(0, despNaoOp - recNaoOp)) / mcPct`

Filtro: `month`, `year`, `unitId` (opcional). Quando `unitId` é omitido, consolida todas as unidades.

---

## Decisões técnicas

### TypeScript / Vercel
O target do compilador não suporta `for...of` em `Map`/`Set` nem spread de Set. **Sempre usar `Array.from()`:**
```typescript
// ❌ quebra no build
const arr = [...set]
for (const [k, v] of map) { }

// ✅ correto
const arr = Array.from(set)
Array.from(map.entries()).forEach(([k, v]) => { })
```

### Migrations
Usa `prisma db push` (sem migration files versionadas). Schema-first: mudanças no schema são aplicadas diretamente no banco.

### Seed automático
`src/lib/prisma.ts` exporta o singleton do PrismaClient. Ao inicializar, chama `seedUnits()` e `seedTransferAccount()` com upsert — idempotente, roda em cada cold start sem problema.

### Fitid e duplicatas
`fitid` é `@unique` no banco — impede duplicatas absolutas. A checagem de "já importado" no parse é escopada à mesma `bankAccountId` para não marcar como duplicata transações de bancos diferentes com o mesmo fitid.

### Batch save
`createMany({ skipDuplicates: true })` salva todas as transações em 1 query SQL.

---

## Identidade visual

- Fonte: **Bricolage Grotesque** (`--font-sub`)
- Amarelo: `#eaca2d` (`--brave-yellow`)
- Escuro: `var(--brave-dark)` (`#2b2d42`)
- Sem biblioteca de UI — CSS inline + classes em `globals.css`: `.card`, `.btn`, `.btn-primary`, `.btn-danger`, `.btn-sm`, `.metric-card`, `.form-select`, `.form-input`, `.upload-zone`, `.table-wrap`, `.badge-neutro`, `.toast`, `.page-header`, `.page-title`
- Favicon: `src/app/icon.svg` — losango amarelo simples

---

## Comandos de desenvolvimento

```bash
cd "C:\Users\whohe\Projeto Claude\financeiro-mpf\financeiro"
npm run dev          # servidor local em http://localhost:3000
npm run db:studio    # Prisma Studio (editor visual do banco)
npm run build        # build de produção
git push             # Vercel auto-deploya
```
