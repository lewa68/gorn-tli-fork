# Обновление Горна с сохранением наших правок.
#
# Наши фиксы живут коммитами в этом репозитории (git log --oneline).
# Когда автор выпускает новую версию:
#   .\update-gorn.ps1            — влить upstream/main, проверить, собрать
#   .\update-gorn.ps1 -SkipBuild — только влить и проверить, без сборки
#
# Схема: у портативной версии автообновление выключено самой природой
# портативности, поэтому официальный апдейтер никогда не затрёт наши
# правки — обновляемся только этим скриптом.
param([switch]$SkipBuild)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $repo
try {
  $dirty = git status --porcelain=v1
  if ($dirty) {
    Write-Host "Рабочее дерево грязное — сначала разберись с изменениями:" -ForegroundColor Yellow
    $dirty | Write-Host
    exit 1
  }

  Write-Host "== 1/5 Забираю upstream ==" -ForegroundColor Cyan
  git fetch upstream main
  $base = git rev-parse HEAD
  $theirs = git rev-parse upstream/main

  if ($base -eq $theirs) {
    Write-Host "upstream не менялся (наша база совпадает) — вливать нечего." -ForegroundColor Green
  } else {
    Write-Host "Сливаю $theirs ..."
    git merge upstream/main --no-edit
    if ($LASTEXITCODE -ne 0) {
      Write-Host @"
Конфликт слияния. Наши коммиты целы, но руками разрешить конфликт придётся:
  1. git status                  — список конфликтных файлов
  2. правишь файлы (<<< ours / >>> theirs)
  3. git add <файлы>; git commit
Либо откатить слияние и подождать:  git merge --abort
"@ -ForegroundColor Yellow
      exit 1
    }
  }

  Write-Host "== 2/5 Зависимости ==" -ForegroundColor Cyan
  npm install --no-audit --no-fund | Out-Null

  Write-Host "== 3/5 Типы ==" -ForegroundColor Cyan
  npm run typecheck
  if ($LASTEXITCODE -ne 0) { throw "typecheck упал" }

  Write-Host "== 4/5 Тесты ==" -ForegroundColor Cyan
  npx vitest run --no-file-parallelism
  if ($LASTEXITCODE -ne 0) { throw "тесты упали" }

  if ($SkipBuild) {
    Write-Host "Сборка пропущена (-SkipBuild). Запуск: npm start" -ForegroundColor Green
  } else {
    Write-Host "== 5/5 Сборка portable + установщика ==" -ForegroundColor Cyan
    npm run dist
    if ($LASTEXITCODE -ne 0) { throw "сборка упала" }
    Write-Host "Готово: release\Gorn-*-portable.exe и Gorn-*-setup.exe" -ForegroundColor Green
  }
} finally {
  Pop-Location
}
