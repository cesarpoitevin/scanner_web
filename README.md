# Document Scanner Web App

Um aplicativo web para escanear documentos usando a câmera do dispositivo móvel, construído com React e Vite.

## Funcionalidades

- Acesso à câmera do dispositivo móvel
- Captura de imagens de documentos
- **Processamento automático**: Ajuste de brilho, contraste, saturação e centralização
- **OCR (Reconhecimento Óptico de Caracteres)**: Extração automática de texto em português
- Visualização de imagens processadas e texto extraído
- Exportação para PDF
- **Gerenciamento de documentos**: Salvar com nome e categoria (trabalho, estudos, diversos)
- **Compartilhamento**: Via WhatsApp, email ou compartilhamento nativo
- **Exclusão**: Remover documentos salvos
- Design responsivo e otimizado para mobile
- Armazenamento local persistente
- ~~Integração com Google Drive (temporariamente desabilitada)~~

## Tecnologias Utilizadas

- **React**: Framework para interface
- **Vite**: Build tool rápido
- **react-webcam**: Biblioteca para acesso à câmera
- **jsPDF**: Geração de PDFs
- **Canvas API**: Processamento de imagens (brilho, contraste, saturação)
- **Tesseract.js**: OCR (reconhecimento óptico de caracteres) em português
- **localStorage**: Armazenamento local de documentos
- **Web Share API**: Compartilhamento nativo (com fallbacks para WhatsApp/email)
- **CSS**: Estilização customizada
- ~~Google APIs: Integração com Google Drive (temporariamente desabilitada)~~

## Como Usar

1. Abra o aplicativo em um dispositivo com câmera (preferencialmente mobile)
2. **Conecte sua conta Google** (opcional, para upload na nuvem)
3. Clique em "Iniciar Câmera" para ativar a câmera traseira
4. Posicione o documento e clique em "Capturar"
5. As imagens são automaticamente processadas (melhoria de luz, cores e centralização)
6. **OCR é executado automaticamente** para extrair texto em português
7. Digite um nome para o documento e selecione uma categoria
8. **Marque "Enviar para Google Drive"** se quiser fazer backup na nuvem
9. Clique em "Salvar Documento" para armazenar localmente (e na nuvem se marcado)
10. Acesse "Documentos Salvos" para gerenciar seus arquivos
11. Use "Ver Texto" para visualizar conteúdo extraído, "Compartilhar" para enviar via WhatsApp/email ou "Excluir" para remover

## Desenvolvimento

### Pré-requisitos

- Node.js (versão 16 ou superior)
- npm ou yarn

### Instalação

```bash
npm install
```

### Executar em desenvolvimento

```bash
npm run dev
```

O aplicativo estará disponível em `http://localhost:5173`

### Build para produção

```bash
npm run build
```

### Preview da build

```bash
npm run preview
```

<!-- Google Drive Configuration temporarily removed -->

## Licença

Este projeto é open source e disponível sob a licença MIT.
