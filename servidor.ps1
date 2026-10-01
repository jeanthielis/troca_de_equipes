# Servidor local simples para testar o app no Windows (nao precisa instalar nada).
# E iniciado pelo arquivo iniciar.bat. Para parar, feche a janela.
$porta = 8080
$pasta = [IO.Path]::GetFullPath((Split-Path -Parent $MyInvocation.MyCommand.Path))

$tipos = @{
  ".html" = "text/html; charset=utf-8"; ".css" = "text/css; charset=utf-8";
  ".js" = "application/javascript; charset=utf-8"; ".json" = "application/json; charset=utf-8";
  ".pdf" = "application/pdf"; ".png" = "image/png"; ".svg" = "image/svg+xml"; ".ico" = "image/x-icon"
}

$servidor = New-Object System.Net.HttpListener
$servidor.Prefixes.Add("http://localhost:$porta/")
try {
  $servidor.Start()
} catch {
  Write-Host ""
  Write-Host "Nao foi possivel usar a porta $porta. Talvez o app ja esteja aberto em outra janela." -ForegroundColor Yellow
  Write-Host "Feche as outras janelas do servidor e tente de novo."
  Read-Host "Pressione Enter para sair"
  exit 1
}

Write-Host ""
Write-Host "  App de troca de escala rodando em:  http://localhost:$porta" -ForegroundColor Green
Write-Host "  Deixe esta janela aberta enquanto usa o app. Para parar, feche a janela."
Write-Host ""
Start-Process "http://localhost:$porta/"

while ($servidor.IsListening) {
  $contexto = $servidor.GetContext()
  $resposta = $contexto.Response
  try {
    $caminho = [Uri]::UnescapeDataString($contexto.Request.Url.AbsolutePath.TrimStart('/'))
    if ($caminho -eq "") { $caminho = "index.html" }
    $arquivo = [IO.Path]::GetFullPath((Join-Path $pasta $caminho))
    if ($arquivo.StartsWith($pasta) -and (Test-Path -LiteralPath $arquivo -PathType Leaf)) {
      $bytes = [IO.File]::ReadAllBytes($arquivo)
      $extensao = [IO.Path]::GetExtension($arquivo).ToLower()
      if ($tipos.ContainsKey($extensao)) { $resposta.ContentType = $tipos[$extensao] } else { $resposta.ContentType = "application/octet-stream" }
      $resposta.AddHeader("Cache-Control", "no-cache")
      $resposta.ContentLength64 = $bytes.Length
      $resposta.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $resposta.StatusCode = 404
    }
  } catch {
    $resposta.StatusCode = 500
  } finally {
    $resposta.Close()
  }
}
