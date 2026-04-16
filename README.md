# 📊 Financeiro MPF — Sistema de Gestão Financeira

Sistema web para gestão financeira empresarial com:
- **Plano de Contas** configurável
- **Importação de extratos OFX**
- **DRE automática** mês a mês
- **Dashboard** com gráficos e indicadores
- **Banco de dados** SQLite (arquivo local, zero configuração)

---

## 🚀 Subir localmente (primeira vez)

### 1. Pré-requisitos
- Node.js 18+ instalado → https://nodejs.org

### 2. Instalar e configurar

```bash
# Entre na pasta do projeto
cd financeiro

# Instale as dependências
npm install

# Crie o banco de dados
npm run setup
```

### 3. Rodar o sistema

```bash
npm run dev
```

Acesse: **http://localhost:3000**

---

## ☁️ Deploy no Railway (recomendado — gratuito)

1. Crie conta em https://railway.app
2. Novo projeto → "Deploy from GitHub"
3. Suba o código no GitHub (ou arraste a pasta)
4. Adicione variável de ambiente:
   ```
   DATABASE_URL=file:./prisma/prod.db
   ```
5. O Railway detecta Next.js automaticamente e sobe o sistema

---

## ☁️ Deploy na Vercel

1. Crie conta em https://vercel.com
2. Importe o repositório do GitHub
3. Adicione `DATABASE_URL=file:./prisma/prod.db` em Environment Variables
4. Deploy automático

> ⚠️ Na Vercel o sistema de arquivos é efêmero. Para produção com muitos dados, migre para PostgreSQL (substituir `provider = "sqlite"` por `"postgresql"` no schema.prisma e atualizar DATABASE_URL).

---

## 📋 Como usar

### Passo 1 — Plano de Contas
- Acesse **Plano de Contas**
- Clique em **"Carregar Padrão"** para criar contas pré-definidas, ou
- Adicione manualmente: código (ex: 3.1.1), nome, tipo e grupo DRE

### Passo 2 — Importar OFX
- Acesse **Lançamentos**
- Arraste ou clique para selecionar o arquivo `.OFX` do seu banco
- As transações são importadas automaticamente (duplicatas ignoradas)

### Passo 3 — Classificar Transações
- Para cada transação importada, selecione a **Conta do Plano**
- Transações sem conta não entram no DRE
- Use o filtro "Sem classificação" para ver o que falta

### Passo 4 — Visualizar DRE e Dashboard
- Acesse **DRE** para ver o resultado detalhado do mês
- Acesse **Dashboard** para visão geral com gráficos

---

## 🗂️ Estrutura do projeto

```
financeiro/
├── prisma/
│   └── schema.prisma       # Modelo do banco de dados
├── src/
│   ├── app/
│   │   ├── api/            # APIs (accounts, transactions, ofx, dre)
│   │   ├── dashboard/      # Página do dashboard
│   │   ├── plano-de-contas/# Configuração do plano
│   │   ├── lancamentos/    # Importação OFX + classificação
│   │   └── dre/            # DRE detalhada
│   ├── components/
│   │   └── Shell.tsx       # Layout (topbar + sidebar)
│   └── lib/
│       ├── prisma.ts       # Cliente do banco
│       ├── ofx-parser.ts   # Parser de arquivos OFX
│       └── dre.ts          # Cálculo do DRE
├── .env                    # Configuração do banco
└── package.json
```

---

## 🔧 Banco de dados

O sistema usa **SQLite** por padrão — o banco fica em `prisma/dev.db`.

Para ver os dados visualmente:
```bash
npm run db:studio
```

### Migrar para PostgreSQL (produção)
1. No `prisma/schema.prisma`, mude `provider = "sqlite"` para `"postgresql"`
2. Atualize `DATABASE_URL` para a string de conexão do PostgreSQL
3. Rode `npx prisma migrate dev`

---

## 📦 Tecnologias

- **Next.js 14** — Framework React full-stack
- **Prisma + SQLite** — Banco de dados
- **Recharts** — Gráficos
- **TypeScript** — Tipagem

---

*Desenvolvido com identidade visual Brave Educação Empresarial*
