# OLHA.AI · sistema de gestão de marketing indoor

Painel web para colocar **conteúdo em TVs, tablets e painéis de LED pela internet**, com programação por horário, **mapa com a localização de cada tela**, captura do que está no ar, relatórios de exibição e **dois portais no mesmo sistema**: o seu (agência, enxerga todas as empresas) e o do seu cliente (vê e controla só a rede dele).

Inspirado no fluxo de produtos como o Climb Player — gestão centralizada, autonomia para o cliente, conteúdo no ar mesmo com a internet instável.

---

## Como usar em 3 comandos

```bash
npm install
npm run seed     # cria agência + 3 empresas cliente, pontos com coordenadas, telas, peças e grades
npm run build && npm start
```

- painel: <http://localhost:4000>
- player da tela: <http://localhost:4000/player>
- API: <http://localhost:4000/api/health>

| acesso | login | senha | o que faz |
| --- | --- | --- | --- |
| **agência (você)** | `admin@olha.ai` | `olha12345` | todas as empresas, biblioteca comum, planos, acessos, mapa e relatórios consolidados |
| **cliente** | `rafael@inovepiscinas.com.br` | `cliente123` | só a Piscinas Inove: 3 telas em 3 pontos |
| cliente | `ju@fitmoveis.com.br` | `cliente123` | só a Rede Fit Movel |
| cliente | `contato@sorrisonorte.com.br` | `cliente123` | só a Clínica Sorriso Norte (tem tablet em veículo) |

Códigos de pareamento do seed: `OLHA101 OLHA102 OLHA103 · OLHA201 OLHA202 · OLHA301 OLHA302 OLHA303`.

### ver funcionando sem hardware

```bash
npm run simulate     # 8 aparelhos falsos: heartbeat, bateria, GPS em movimento, playlog e capturas
```

Abra o painel com o login da agência: as telas ficam **online no mapa**, o *Tablet Carro 01* anda pela cidade, o dashboard mostra as capturas e os relatórios começam a somar minutos reais.

### desenvolvimento (HMR)

```bash
npm run dev          # API em :4000 + Vite em :5173 com proxy de /api, /uploads e /ws
```

---

## O que o sistema faz

### Painel (agência e cliente)

| área | o que entrega |
| --- | --- |
| **Visão geral** | telas no ar/sem sinal, minutos exibidos hoje por hora, "o que está no ar agora" com a captura real de cada aparelho, alertas (queda, tela sem pareamento, ponto sem grade), feed de atividade ao vivo |
| **Telas & aparelhos** | cadastro de TV Box/Android TV/tablet/painel LED/monitor, orientação H/V, vínculo com ponto, código de pareamento + QR, comandos remotos (recarregar, pausar, retomar, capturar, identificar, destaque, limpar cache), detalhe com telemetria, logs, trilha de GPS e histórico de exibição |
| **Mapa da rede** | Leaflet com um pino por tela (cor = online/sem sinal/aguardando), alternância tela↔ponto, precisão e origem da posição, bateria, "GPS agora" e **posição manual com busca de endereço (Nominatim) ou clique no mapa**; lista de telas sem localização |
| **Conteúdo** | upload em lote (arraste, MP4/WebM/MOV/JPG/PNG/WebP/GIF/SVG, até 400 MB), detecção de resolução/duração no navegador, peças dinâmicas (aviso rolante, HTML, link/iframe, YouTube, relógio, previsão do tempo, manchetes RSS), biblioteca comum da agência para todas as empresas |
| **Programação** | playlists com trilha reordenável por arraste, duração por peça (ou automática), janelas por dia/faixa de horário com prioridade, **alcance por aparelho, por ponto ou para a empresa toda**, prévia em tela cheia com o mesmo renderizador do player, publicação com push imediato e versão incrementada |
| **Relatórios** | minutos no ar por dia, por tela e por conteúdo, telas ativas, estimativa de impressões (público do ponto × fração do horário comercial), exportação CSV e layout de impressão |
| **Empresas** *(agência)* | carteira com saúde de rede, pontos, grades, acessos, plano e valor mensal, custo por tela, criar acesso do cliente, "abrir como o cliente" |
| **Pontos de exibição** | endereço, tipo de local, fluxo de pessoas/dia, mapa para marcar a coordenada, telas vinculadas |
| **Equipe & acessos** | usuários da agência e do cliente, perfis, troca de senha, aviso no navegador quando a tela cai |
| **Instalação** | guia por tipo de aparelho, validador de código de pareamento, atalhos de teclado do player, troubleshooting |
| **Configurações** | status da API/WebSocket, fila de comandos, endpoints de integração, armazenamento, dados da instalação |

### Player (`/player`) — roda no navegador do aparelho

1. Tela de pareamento pedindo o código de 6 caracteres (ou `?code=OLHA101`, ou QR lido pela câmera do celular).
2. Recebe o **manifest** com a grade do momento (resolvida no servidor: aparelho > ponto > empresa + janelas de horário).
3. **Baixa e guarda as peças em Cache Storage**; compara pelo checksum e só rebaixa o que mudou.
4. Exibe a sequência: vídeo com avanço no `ended`, imagem/texto/HTML com tempo do item, widgets (relógio, previsão Open-Meteo, manchetes) sempre atualizados, iframe/YouTube.
5. **Sem internet → continua rodando do cache**; volta a sincronizar sozinho e mostra um selo discreto de "sem conexão".
6. Mantém a tela acordada (Wake Lock), lê bateria, e envia heartbeat com telemetria.
7. Responde em tempo real ao WebSocket: `manifest:changed`, mudança de modo e comandos (`screenshot`, `locate`, `identify`, `reload`, `clear`).
8. Tablets enviam posição por `watchPosition` (o mapa acompanha e a trilha fica no histórico da tela).
9. Atalhos: `F` tela cheia · `I` diagnóstico · `R` reiniciar · `espaço` congelar · `→` próxima peça · `Esc` fechar overlay.

### Isolamento por papel

- `agency`: vê e edita todas as empresas; cria empresa, ponto, tela, usuário; publica na biblioteca comum.
- `client`: todo `GET`/`POST` é forçado ao `client_id` da sessão; tentar acessar recurso de outra empresa devolve `403`. O seletor de carteira nem aparece.
- Sessão em token HMAC assinado (sem JWT externo), senha com `scrypt`, token do aparelho separado do login humano.

---

## Arquitetura

```
server/
  index.js        Express + estáticos + SPA + upgrade de WebSocket
  db.js           SQLite nativo do Node (node:sqlite), schema e helpers
  auth.js         scrypt, token assinado, requireUser/requireDevice, escopo por papel
  program.js      motor de resolução da grade (alcance + janelas + prioridade + fallback)
  realtime.js     hub WS (painel e aparelhos), presença, fila de comandos, inválidação
  seed.js         dados de demonstração (gera as artes SVG em uploads/)
  routes/
    auth.js clients.js devices.js media.js playlists.js player.js dashboard.js
web/src/
  App.jsx         shell (sidebar, seletor de carteira, indicador ao vivo) + rotas
  api.js ui.jsx auth.jsx live.js Slide.jsx
  pages/          Dashboard, Devices, DeviceDetail, MapPage, Content, Playlists,
                  PlaylistEditor, Reports, Clients, Locations, Team, Setup, Settings,
                  Login, Landing
  player/PlayerPage.jsx   runtime completo do aparelho
scripts/
  simulate.mjs    simulador de aparelhos (heartbeat, GPS, capturas)
  smoke.mjs       55 checagens de contrato da API
  uitest.mjs      renderiza todas as rotas em jsdom contra a API real (com teste de isolamento por empresa)
uploads/          mídia enviada (pasta pública, nome aleatório, cache de 30 dias)
data/signage.db   SQLite
```

### Protocolo do aparelho

| método | rota | função |
| --- | --- | --- |
| `POST` | `/api/player/pair` | `{code, info{ua,os,width,height,orientation,geo}}` → `{token, manifest}` |
| `GET` | `/api/player/manifest` | grade do momento: peças, URLs, janelas, modo, orientação, cor de fundo, hash |
| `GET` | `/api/player/version` | só o hash (checagem barata de polling) |
| `POST` | `/api/player/heartbeat` | telemetria + `{playing, geo, battery, uptime, mode}` → `{hash, changed, commands[], manifest?}` |
| `POST` | `/api/player/geo` | posição avulsa (tablet em veículo) |
| `POST` | `/api/player/log` | eventos do aparelho (`cache`, `error`, `info`) |
| `POST` | `/api/player/screenshot` | imagem do que está na tela → visível no painel |
| `WS` | `/ws?kind=device&token=…` | empurrão instantâneo de publicação/comando |

Publicar uma playlist incrementa `version`, chama `invalidateClient()` e **empurra** para cada aparelho conectado; os que estão offline recebem a fila no próximo heartbeat. Nada depende de reenviar arquivo manualmente.

---

## Testes

```bash
npm test          # scripts/smoke.mjs  → contrato da API (auth, escopo, grade, player, relatórios) — 55 checagens
npm run test:ui   # scripts/uitest.mjs → monta cada rota no jsdom contra a API real e procura erro de runtime
npm run check     # build + os dois acima
```

O `test:ui` passa por todas as rotas com usuário agência e com usuário cliente, conferindo inclusive o **isolamento por empresa** (menu, seletor de carteira, lista de telas e de peças) e o pareamento automático no player.

Cobrem, entre outras: senha errada rejeitada, cliente lendo só a própria empresa, código de pareamento inválido, publicação bloqueada sem vínculo ou sem conteúdo, comando entregue **ou** enfileirado, GPS chegando no mapa, `takeover`, `pause`/`resume` refletindo no manifest e a cascata de remoção.

---

## Notes de produção

1. **HTTPS é obrigatório** para `geolocation`, Wake Lock e para o `navigator.clipboard`. Sem TLS o GPS do tablet não chega.
2. **WebSocket no proxy** (nginx):
   ```nginx
   location / { proxy_pass http://127.0.0.1:4000; proxy_http_version 1.1;
     proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";
     proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; }
   ```
3. **Processo**: `pm2 start server/index.js -n olha` ou systemd com `PORT=4000`; o `node:sqlite` é nativo do Node ≥ 22.5 — nenhum módulo compilado.
4. **Mídia**: hoje em `uploads/`. Para escala, troque o storage do multer por S3/R2+CDN e mantenha `/uploads/...` como URL pública (o player só precisa de URL + checksum).
5. **Variáveis**: `PORT`, `OLHA_SECRET` (assinatura de token; se ausente é gerado em `data/.secret`), `OLHA_MAX_MB`, `OLHA_ONLINE_WINDOW` (janela de presença, padrão 40 s).
6. **App nativo (Android TV / Kiosk)**: use `/pair` + `/manifest` + `/heartbeat` + `WS` e reproduza o comportamento de fila; o protocolo já é independente de navegador.
7. Backup = copiar `data/signage.db` + `uploads/`.

## Roadmap natural

`billing por plano` · `agendamento de campanha com início/fim` · `cache de RSS no servidor` · `múltiplas zonas na mesma tela (vídeo + ticker + relógio)` · `app nativo Android TV` · `SSO/2FA para a agência` · `integração com CAT de autoatendimento` · `métricas por QR/cupom`.

---

Licença: uso interno do produto.
