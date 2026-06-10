import path from 'node:path';

const MP4_EXTENSION = '.mp4';

export const IMAGE_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.heic',
  '.heif',
  '.tif',
  '.tiff',
  '.arw',
  '.webp',
]);

/**
 * Returns true when the file has a .mp4 extension (case-insensitive).
 */
export function isMp4File(filePath: string): boolean {
  return path.extname(filePath).toLowerCase() === MP4_EXTENSION;
}

/**
 * Returns true for common still-image extensions (case-insensitive).
 */
export function isImageFile(filePath: string): boolean {
  return IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

/**
 * Returns true when the file is a supported video or image for conversion.
 */
export function isConvertibleMediaFile(filePath: string): boolean {
  return isMp4File(filePath) || isImageFile(filePath);
}

export function getMediaType(filePath: string): 'video' | 'image' | null {
  if (isMp4File(filePath)) {
    return 'video';
  }
  if (isImageFile(filePath)) {
    return 'image';
  }
  return null;
}

/**
 * Maps an input file path to its corresponding output path, preserving
 * the relative folder structure under the input root.
 */
export function mapInputToOutput(
  inputRoot: string,
  outputRoot: string,
  inputFilePath: string,
): string {
  const relativePath = path.relative(inputRoot, inputFilePath);
  return path.join(outputRoot, relativePath);
}

/**
 * Ensures the output directory path is not nested inside the input directory,
 * which would cause re-processing of converted files on subsequent runs.
 */
export function isOutputInsideInput(inputRoot: string, outputRoot: string): boolean {
  const normalizedInput = path.resolve(inputRoot);
  const normalizedOutput = path.resolve(outputRoot);

  if (normalizedInput === normalizedOutput) {
    return true;
  }

  const relative = path.relative(normalizedInput, normalizedOutput);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

/**
 * Escapes a filesystem path for use inside an FFmpeg filter expression.
 */
export function escapeFfmpegFilterPath(filePath: string): string {
  return filePath.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/:/g, '\\:');
}

/**
 * Validates that a path string is non-empty and free of null bytes.
 */
export function isValidPathString(value: string): boolean {
  return value.length > 0 && !value.includes('\0');
}
