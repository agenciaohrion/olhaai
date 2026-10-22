# OLHA.AI · demonstração completa no Windows  —  cole isto no PowerShell e pronto:
#
#   powershell -ExecutionPolicy Bypass -File .\demo-windows.ps1
#
# O que ele faz, nesta ordem, sem pedir nada para você:
#   0. mata qualquer "node" pendurado (senão a porta 4000 fica presa)
#   1. confere o Node (precisa 22.5+)
#   2. npm install            (se faltar dependência)
#   3. npm run build          (gera o painel web/dist — sem isso a tela fica preta)
#   4. npm run seed           (agência + 3 empresas + 8 telas + peças + grades + histórico)
#   5. sobe a API numa janela e os 8 aparelhos simulados em outra
#   6. espera a API responder e ABRE O NAVEGADOR sozinho em http://127.0.0.1:4000
#
# Para parar tudo: feche as duas janelas que ele abrir (ou rode
#   Get-Process node | Stop-Process -Force ).

$ErrorActionPreference = 'Stop'
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')

# pasta do projeto: a deste script, ou a atual se você já está nela
$dir = if (Test-Path (Join-Path $PSScriptRoot 'package.json')) { $PSScriptRoot } else { (Get-Location).Path }
Set-Location $dir
Write-Host "`n  OLHA.AI · demonstração  ($dir)`n" -ForegroundColor Magenta

function Say($m) { Write-Host "  $m" }
function Head($m) { Write-Host "`n  $m" -ForegroundColor Cyan }

# 0 · limpa servidores pendurados ------------------------------------------------
Head '0/6  liberando a porta 4000'
Get-Process node -ErrorAction SilentlyContinue | ForEach-Object { $_.Kill(); $_.WaitForExit(3000) }
Say 'pronto'

# 1 · Node ----------------------------------------------------------------------
Head '1/6  Node'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Say 'NÃO ENCONTRADO. Instale o Node LTS em https://nodejs.org e rode de novo.' -ForegroundColor Yellow
  Write-Host ''
  exit 1
}
$v = (node -v) -replace 'v', ''
$parts = $v.Split('.')
if ([int]$parts[0] -lt 22 -or ([int]$parts[0] -eq 22 -and [int]$parts[1] -lt 5)) {
  Say "Node $v é velho demais (precisa 22.5+). Instale o LTS em https://nodejs.org"
  exit 1
}
Say "Node $v ok"

# 2 · dependências --------------------------------------------------------------
Head '2/6  dependências'
if (-not (Test-Path 'node_modules\express') -or -not (Test-Path 'node_modules\vite')) {
  Say 'npm install …'
  npm install --no-audit --no-fund
  if (-not (Test-Path 'node_modules\express')) { Say 'npm install falhou (sem internet?). Rode de novo manualmente.'; exit 1 }
} else { Say 'já instaladas' }

# 3 · build do painel -----------------------------------------------------------
Head '3/6  painel (web/dist)'
Say 'npm run build …'
npm run build
if (-not (Test-Path 'web\dist\index.html')) { Say 'o build não gerou web/dist — me mande a saída acima.'; exit 1 }

# 4 · dados de demonstração -----------------------------------------------------
Head '4/6  base de demonstração'
if (Test-Path 'data\signage.db') { Say 'base já existe — completando o que falta'; npm run seed -- --keep }
else { npm run seed }

# 5 · servidor + aparelhos em janelas próprias ---------------------------------
Head '5/6  subindo painel, API e aparelhos'
Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$dir'; npm start"
Start-Sleep -Seconds 5
Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$dir'; npm run simulate"

# 6 · espera a API e abre o navegador ------------------------------------------
Head '6/6  esperando a API responder'
$up = $false
for ($i = 0; $i -lt 30; $i++) {
  try {
    $r = Invoke-WebRequest 'http://127.0.0.1:4000/api/health' -UseBasicParsing -TimeoutSec 2
    if ($r.StatusCode -eq 200) { $up = $true; Say ("API: " + $r.Content); break }
  } catch { Start-Sleep -Milliseconds 700 }
}
if (-not $up) {
  Say 'a API não respondeu. Abra a janela "npm start" que apareceu na barra de tarefas e me mande o que está escrito nela.'
  exit 1
}

Say 'abrindo http://127.0.0.1:4000'
Start-Process 'http://127.0.0.1:4000'

Write-Host @"

  ──────────────────────────────────────────────────────────────
   ABRIU?  use Ctrl+Shift+R se a tela vier escura uma vez.

   login    console da agência   admin@olha.ai          olha12345
            portal do cliente     ju@fitmoveis.com.br    cliente123
            (na tela de login existem botões de acesso rápido)

   para ver de ponta a ponta:
     Visão geral    as 8 telas com a captura real, trocando sozinhas
     card           'identificar' e 'destaque agora' mexem na tela na hora
     Mapa           dois tablets andam pela cidade em tempo real
     Programação    grades com janela de horário; publicar empurra para as telas
     Relatórios     minutos por peça/tela/dia + CSV + imprimir
     /player        código OLHA101 (abra no celular na mesma rede Wi-Fi)

   as duas janelas que ele abriu precisam ficar abertas.
  ──────────────────────────────────────────────────────────────

"@
