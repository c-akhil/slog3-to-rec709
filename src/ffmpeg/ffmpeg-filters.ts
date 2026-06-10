import path from 'node:path';

/**
 * FFmpeg video filter for Sony ILCE-7SM3 (A7S III) S-Log3 / S-Gamut3.Cine → Rec.709.
 *
 * Pipeline:
 * 1. Expand legal (limited) range to full range
 * 2. Decode S-Log3 log encoding to scene-linear light
 * 3. Convert S-Gamut3.Cine primaries to Rec.709
 * 4. Encode Rec.709 gamma 2.4
 *
 * For best color accuracy, supply a .cube LUT via --lut.
 * This built-in chain is a reasonable default when no LUT is available.
 */
export const SLOG3_TO_REC709_FILTER = [
  'scale=in_range=limited:out_range=full',
  'format=gbrpf32le',
  // S-Log3 inverse log curve (Sony spec) per channel
  "geq=" +
    "r='if(gte(r(X\\,Y)\\,0.011361)\\,(pow(10\\,((r(X\\,Y)-0.092864)/0.432699))-0.037584)/5.263157\\,(r(X\\,Y)-0.011361)/5.367655)':" +
    "g='if(gte(g(X\\,Y)\\,0.011361)\\,(pow(10\\,((g(X\\,Y)-0.092864)/0.432699))-0.037584)/5.263157\\,(g(X\\,Y)-0.011361)/5.367655)':" +
    "b='if(gte(b(X\\,Y)\\,0.011361)\\,(pow(10\\,((b(X\\,Y)-0.092864)/0.432699))-0.037584)/5.263157\\,(b(X\\,Y)-0.011361)/5.367655)'",
  'format=gbrpf32le',
  // S-Gamut3.Cine → Rec.709 matrix (Sony published values)
  'colorchannelmixer=' +
    'rr=1.706055:rg=-0.128351:rb=-0.577704:' +
    'gr=-0.095617:gg=1.424316:gb=-0.328699:' +
    'br=-0.061583:bg=-0.347011:bb=1.408595',
  // Rec.709 gamma 2.4 encode (1/2.4 ≈ 0.416667)
  'eq=gamma=0.416667:contrast=1.0',
  'format=yuv420p',
].join(',');

export const ENCODE_ARGS = ['-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-c:a', 'copy'] as const;

export function buildImageEncodeArgs(outputPath: string): string[] {
  const ext = path.extname(outputPath).toLowerCase();
  const base = ['-frames:v', '1', '-update', '1'];

  switch (ext) {
    case '.png':
      return base;
    case '.webp':
      return [...base, '-quality', '90'];
    case '.jpg':
    case '.jpeg':
    default:
      return [...base, '-q:v', '2'];
  }
}

export const OVERWRITE_ARG = '-y' as const;
export const NO_OVERWRITE_ARG = '-n' as const;
