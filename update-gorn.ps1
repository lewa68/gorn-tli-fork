# Обновление Горна с сохранением наших правок.
#
# Наши фиксы живут коммитами в этом репозитории (git log --oneline).
# Когда автор выпускает новую версию:
#   .\update-gorn.ps1            — влить upstream, проверить, собрать и опубликовать
#   .\update-gorn.ps1 -SkipBuild — только влить и проверить, без сборки
#
# Канал обновлений — форк-репозиторий на GitHub (publish в package.json).
# Установленные приложения сами качают и ставят новые релизы с него:
# в каждой версии — «официальная + наши фиксы».
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

  Write-Host "== 1/6 Забираю upstream ==" -ForegroundColor Cyan
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
    git push -q origin master
  }

  Write-Host "== 2/6 Зависимости ==" -ForegroundColor Cyan
  npm install --no-audit --no-fund | Out-Null

  Write-Host "== 3/6 Типы ==" -ForegroundColor Cyan
  npm run typecheck
  if ($LASTEXITCODE -ne 0) { throw "typecheck упал" }

  Write-Host "== 4/6 Тесты ==" -ForegroundColor Cyan
  npx vitest run --no-file-parallelism
  if ($LASTEXITCODE -ne 0) { throw "тесты упали" }

  $version = (Get-Content package.json -Raw | ConvertFrom-Json).version

  if ($SkipBuild) {
    Write-Host "Сборка пропущена (-SkipBuild). Запуск: npm start" -ForegroundColor Green
  } else {
    Write-Host "== 5/6 Сборка portable + установщика ==" -ForegroundColor Cyan
    npm run dist
    if ($LASTEXITCODE -ne 0) { throw "сборка упала" }
    $setup = "release/Gorn-$version-setup.exe"

    Write-Host "== 6/6 Публикация релиза v$version на канал обновлений ==" -ForegroundColor Cyan
    git push -q origin master
    gh release create "v$version" $setup "$setup.blockmap" "release/latest.yml" "release/Gorn-$version-portable.exe" --repo lewa68/gorn-tli --title "Горн $version (официальная версия + фиксы форка)" --notes "Автосборка форка: версия автора + локальные фиксы. Коммиты форка: git log." 2>&1 | Write-Host
    Write-Host "Готово: установленные приложения обновятся сами при следующей проверке." -ForegroundColor Green
  }
} finally {
  Pop-Location
}
