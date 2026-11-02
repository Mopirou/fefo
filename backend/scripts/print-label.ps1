# Prints a label straight to a Windows printer, no dialog and no PDF reader needed.
# Input (stdin): {"printer": "...", "lines": [{"text": "...", "size": 12, "bold": true}]}
Add-Type -AssemblyName System.Drawing
$job = [Console]::In.ReadToEnd() | ConvertFrom-Json

$doc = New-Object System.Drawing.Printing.PrintDocument
if ($job.printer) { $doc.PrinterSettings.PrinterName = $job.printer }
if (-not $doc.PrinterSettings.IsValid) { Write-Error "Imprimante introuvable: $($job.printer)"; exit 2 }
$doc.DocumentName = 'Etiquette HACCP'
$doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(10, 10, 10, 10)

$doc.add_PrintPage({
    param($sender, $e)
    $y = [single]$e.MarginBounds.Top
    $width = [single]$e.MarginBounds.Width
    foreach ($l in $job.lines) {
        $style = if ($l.bold) { [System.Drawing.FontStyle]::Bold } else { [System.Drawing.FontStyle]::Regular }
        $font = New-Object System.Drawing.Font('Arial', [single]$l.size, $style)
        $rect = New-Object System.Drawing.RectangleF(([single]$e.MarginBounds.Left), $y, $width, ([single]1000))
        $size = $e.Graphics.MeasureString([string]$l.text, $font, [int]$width)
        $e.Graphics.DrawString([string]$l.text, $font, [System.Drawing.Brushes]::Black, $rect)
        $y += $size.Height + 2
        $font.Dispose()
    }
    $e.HasMorePages = $false
})
$doc.Print()
