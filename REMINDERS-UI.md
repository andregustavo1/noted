# Lembretes: o que a UI precisa saber

O backend está pronto: banco, envio e service worker. Esta é a parte de UI. Pode apagar este arquivo quando terminar.

## Formato (já implementado em `src/lib/lines.js`)
- O lembrete vive dentro do **marker** da tarefa, logo depois do checkbox:
  `- [ ] <@2026-10-09T18:00:00.000Z w> academia`
  - O horário é um ISO em UTC (`date.toISOString()`).
  - A repetição é `""` (uma vez), `d` (diária), `w` (semanal), `m` (mensal) ou `y` (anual).
- `parseLine(line).remind` devolve `{ at, repeat }` ou `undefined`. O `text` já vem **sem** o lembrete.
- `setReminder(line, { at, repeat })` grava o lembrete, e `setReminder(line, null)` remove. Linhas que não são tarefa voltam sem mudança.
- Basta salvar a nota normalmente, pela fila offline. Um trigger no banco agenda o push sozinho.

## O que a UI faz
1. **Seletor (bottom sheet)** no estilo da referência: calendário em círculos, hora `HH : MM` e as opções "Nunca · Diária · Semanal · Mensal · Anual". O botão "Remover" chama `setReminder(line, null)`.
2. **Chip na tarefa** (no editor e no `NoteCard`), por exemplo "⏰ 9 out, 15:00 ↻ semanal". Formate com `Intl.DateTimeFormat("pt-BR")` usando o horário local do aparelho.
3. **Cuidado no editor:** o `nextMarker` (`NoteEditor.jsx`) copia o marker inteiro quando você aperta Enter, e isso copiaria o lembrete para a linha nova. Ele precisa limpar o lembrete, por exemplo passando o resultado por `setReminder(..., null)`. Confira também o "Copiar tudo" (linha ~52): ele não deve exportar o `<@...>`.
4. **Ativar notificações** em `ProfileConfig.jsx`, usando `src/lib/push.js`:
   - `pushSupported()` diz se dá para mostrar a opção (iOS só oferece no app da tela de início).
   - `pushEnabled()` é async e diz se este aparelho já está recebendo.
   - `enablePush()` precisa ser chamado **direto no onClick**, sem await antes, por exigência do iOS. Retorna `false` se você negar a permissão e lança erro se estiver no `pnpm dev`, porque o service worker só existe em produção.
   - `disablePush()` desliga.
5. **Abrir a nota ao tocar na notificação:**
   - Com o app fechado, ele abre em `/dashboard?note=<id>`. Leia esse parâmetro no `Home.jsx`, abra a nota e limpe a URL.
   - Com o app aberto, chega `navigator.serviceWorker.addEventListener("message", e => e.data.type === "open-note" && abrir(e.data.note))`.

## Regras que o backend já cuida
- Tarefa feita: o lembrete de uma vez não toca, mas o que se repete continua tocando.
- O mensal no dia 31 toca no último dia dos meses mais curtos.
- A repetição mantém a hora local do aparelho.
- O push pode chegar até 1 minuto depois do horário, porque o cron roda de minuto em minuto.
