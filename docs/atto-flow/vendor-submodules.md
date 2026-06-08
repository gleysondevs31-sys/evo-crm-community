# Vendorização definitiva dos submodules

Sim, é possível anexar os submodules definitivamente no Git principal para evitar baixar os repositórios toda vez.

Hoje o repositório guarda cada serviço como **gitlink** de submodule. Isso deixa o clone principal leve, mas exige:

```bash
git submodule update --init --recursive
```

Para a ATTO FLOW, se a decisão for ter tudo dentro do mesmo repositório, o caminho correto é **vendorizar** os submodules: transformar cada submodule em uma pasta normal versionada pelo Git principal.

## Importante

A vendorização só pode ser feita em uma máquina que consiga acessar e baixar todos os submodules. Se as pastas estiverem vazias, não rode a conversão, porque isso removeria os gitlinks sem trazer o código real.

Neste ambiente de execução, os submodules não estão disponíveis para download. Por isso o repositório agora inclui o script, mas a conversão final precisa ser executada onde houver acesso aos repositórios originais.

## Como executar

```bash
git checkout main
git pull
git submodule update --init --recursive
./scripts/vendor-submodules.sh
git status --short
git commit -m "chore: vendor service submodules"
git push
```

## O que o script faz

1. Confirma que `.gitmodules` existe.
2. Confirma que a árvore de trabalho está limpa.
3. Lê todos os paths de submodule.
4. Bloqueia a execução se algum submodule estiver vazio ou não inicializado.
5. Remove os gitlinks do índice com `git rm --cached`.
6. Remove os metadados `.git` internos dos submodules.
7. Remove `.gitmodules`.
8. Adiciona as pastas como código normal do repositório principal.

## Efeito após o commit

Depois do commit de vendorização:

- Novos clones não precisam baixar submodules.
- A Render não precisa resolver submodules para buildar.
- O Git principal passa a carregar o código completo dos serviços.
- O repositório fica maior.
- Atualizações dos antigos serviços deixam de ser `git submodule update` e passam a ser commits normais no monorepo.

## Quando não fazer

Não vendorize se a intenção for manter cada serviço com ciclo de release independente em repositórios separados. Nesse caso, mantenha submodules ou use imagens Docker publicadas.

## Estratégia recomendada para ATTO FLOW

Para a ATTO FLOW como SaaS único, a recomendação é:

1. Vendorizar os serviços base uma única vez.
2. Remover dependência operacional de submodules.
3. Migrar gradualmente o código para a estrutura modular:

```text
/apps
/modules
/packages
```

4. Manter o Dockerfile raiz para preview/deploy Render.
5. Evoluir ATTOZAP, CRM, Automation, Reports, Gamification e ATTO AI como módulos internos do monorepo.
