# Votação Cine Despertacular

Página de votação do público para os curtas do Cine Despertacular (30 e 31 de outubro de 2026).

- Notas de 0 a 5, uma vez por CPF em cada filme.
- Cada filme libera ao fim da exibição (horário de Brasília); a Sessão das 14h fecha às 16h e a das 19h fecha às 21h.
- Os votos ficam numa planilha do Google, gravados por um Apps Script. As regras são conferidas no servidor.

## Configuração (uma vez)

1. Crie uma planilha nova no Google Drive, por exemplo "Votação Cine Despertacular".
2. Na planilha, abra **Extensões > Apps Script**.
3. Apague o conteúdo do arquivo `Código.gs` e cole todo o conteúdo de [`apps-script/Code.gs`](apps-script/Code.gs). Salve.
4. No menu de funções, escolha **configurar** e clique em **Executar**. Autorize o acesso quando o Google pedir. Isso cria as abas Cadastros, Votos e Teste.
5. Clique em **Implantar > Nova implantação**, tipo **App da Web**:
   - Executar como: **Eu**
   - Quem pode acessar: **Qualquer pessoa**
6. Copie o link do App da Web (termina em `/exec`) e coloque no `index.html`, na linha `const API_URL = "..."`.

## Publicar

Settings > Pages > Branch `main`, pasta `/ (root)` > Save.

## Administrador

O CPF de administrador fica só no Apps Script (não aparece no site). Ao entrar com ele, a página mostra o resultado do Prêmio do Público e o botão de teste, que libera todos os filmes sem horário. Votos de teste vão para a aba Teste e não entram no resultado.

Se alterar o `Code.gs` depois de publicado, use **Implantar > Gerenciar implantações > Editar > Nova versão** para manter o mesmo link.
