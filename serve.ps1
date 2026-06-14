param([string]$Root = 'd:\Propisi', [int]$Port = 8080)

$mime = @{
    '.html' = 'text/html; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.js'   = 'application/javascript; charset=utf-8'
    '.svg'  = 'image/svg+xml'
    '.ttf'  = 'font/truetype'
    '.woff' = 'font/woff'
    '.woff2'= 'font/woff2'
    '.png'  = 'image/png'
    '.jpg'  = 'image/jpeg'
    '.ico'  = 'image/x-icon'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "✅ Serving http://localhost:$Port  (Ctrl+C to stop)" -ForegroundColor Green

while ($listener.IsListening) {
    try {
        $ctx  = $listener.GetContext()
        $req  = $ctx.Request
        $res  = $ctx.Response

        $url  = $req.Url.LocalPath
        if ($url -eq '/') { $url = '/index.html' }

        $file = Join-Path $Root $url.TrimStart('/')

        if (Test-Path $file -PathType Leaf) {
            $ext  = [System.IO.Path]::GetExtension($file).ToLower()
            $ct   = if ($mime[$ext]) { $mime[$ext] } else { 'application/octet-stream' }
            $bytes = [System.IO.File]::ReadAllBytes($file)
            $res.ContentType   = $ct
            $res.ContentLength64 = $bytes.Length
            $res.Headers.Add('Cache-Control', 'no-cache')
            $res.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $res.StatusCode = 404
            $body = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $url")
            $res.OutputStream.Write($body, 0, $body.Length)
        }
        $res.OutputStream.Close()
    } catch {
        if ($listener.IsListening) { Write-Warning "Error: $_" }
    }
}
