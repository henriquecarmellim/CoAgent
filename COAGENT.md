# COAGENT.md — Diretrizes e Memória de Projeto do CoAgent

Este arquivo é lido automaticamente pelo **CoAgent** e injetado como contexto soberano para todos os agentes subordinados (**Google AGY**, **Claude Code**, **OpenAI Codex** e **OpenCode**).

---

## 1. Diretrizes de Engenharia e Padrões de Código

- **Linguagem e Tipagem**: TypeScript 5.8+ em modo estrito (`strict: true`). Nenhum uso de `any` sem justificativa formal.
- **Node.js**: v22+ (otimizado para Node.js v24 no Windows 11).
- **Persistência**: Utilizar o módulo nativo `node:sqlite` (`DatabaseSync`), com modo WAL habilitado.
- **Convenção de Idioma**:
  - Código-fonte, classes, funções, variáveis, métodos e APIs em **inglês técnico convencional**.
  - Documentações, comentários explicativos, relatórios e saídas de usuário sempre em **português brasileiro (PT-BR)**.
- **Testes**: Toda nova funcionalidade deve possuir testes unitários e de integração escritos em **Vitest**.
- **Segurança**: Nunca salvar credenciais ou chaves em arquivos de código. Respeitar as políticas de diretório e permissões.

---

## 2. Papéis Recomendados dos Agentes

- **Google Antigravity (AGY)**: Arquitetura, modelagem de sistemas, exploração de documentação e análise de impacto.
- **Claude Code**: Implementação ágil de features, refatoração de código e fluxos de Git.
- **OpenAI Codex**: Algoritmos complexos, resolução cirúrgica de bugs e criação de suítes de testes.
- **OpenCode**: Auditoria cruzada, revisão independente e suporte a modelos locais/alternativos.
- **CoAgent Advisor**: Consultoria estratégica, crítica pré-execução de planos e ultrareview de diffs.
