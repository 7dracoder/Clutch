$ErrorActionPreference = "Stop"

$Revision = "1e388b922a64f2be39cbf1925e5fd5fc4f7dd771"
$ModelDirectory = "services/vision/models/rfdetr-soccernet"

Write-Warning "Research-only model: trained on non-commercial SoccerNet data."
Write-Host "Installing CUDA 13.0 PyTorch for the soccer detector..."
& ".venv/Scripts/python.exe" -m pip install `
  torch==2.14.0 torchvision==0.29.0 `
  --index-url https://download.pytorch.org/whl/cu130
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& ".venv/Scripts/python.exe" -m pip install -r services/vision/requirements-soccer.txt
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& ".venv/Scripts/hf.exe" download julianzu9612/RFDETR-Soccernet `
  weights/checkpoint_best_regular.pth `
  --revision $Revision `
  --local-dir $ModelDirectory
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Soccer checkpoint installed in $ModelDirectory"
