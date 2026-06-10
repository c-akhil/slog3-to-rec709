import type { MediaMetadataSnapshot, MetadataField, MetadataMismatch } from '../types/metadata.js';

/** Tags FFmpeg regenerates when re-muxing; excluded from strict comparison. */
export const CONTAINER_GENERATED_TAGS = new Set([
  'minor_version',
  'compatible_brands',
]);

/**
 * Builds FFmpeg arguments to copy container, stream, and chapter metadata from the source.
 */
export function buildImageMetadataCopyArgs(snapshot: MediaMetadataSnapshot): string[] {
  const args: string[] = ['-map_metadata', '0'];

  const videoStream = snapshot.streams.find((stream) => stream.codecType === 'video');

  if (videoStream) {
    args.push('-map_metadata:s:v', '0:s:v');
  }

  for (const [key, value] of Object.entries(snapshot.formatTags)) {
    args.push('-metadata', `${key}=${sanitizeMetadataValue(value)}`);
  }

  if (videoStream) {
    for (const [key, value] of Object.entries(videoStream.tags)) {
      args.push('-metadata:s:v:0', `${key}=${sanitizeMetadataValue(value)}`);
    }
  }

  return args;
}

export function buildMetadataCopyArgs(snapshot: MediaMetadataSnapshot): string[] {
  const args: string[] = [
    '-map_metadata',
    '0',
    '-map_chapters',
    '0',
    '-movflags',
    'use_metadata_tags',
  ];

  const videoStream = snapshot.streams.find((stream) => stream.codecType === 'video');
  const audioStream = snapshot.streams.find((stream) => stream.codecType === 'audio');

  // FFmpeg map_metadata input spec uses *input file index* (always 0 here), not ffprobe stream index.
  // Using audio stream index "1:s:a" is parsed as input file 1 and fails on single-input encodes.
  if (videoStream) {
    args.push('-map_metadata:s:v', '0:s:v');
  }

  if (audioStream) {
    args.push('-map_metadata:s:a', '0:s:a');
  }

  for (const [key, value] of Object.entries(snapshot.formatTags)) {
    args.push('-metadata', `${key}=${sanitizeMetadataValue(value)}`);
  }

  if (videoStream) {
    for (const [key, value] of Object.entries(videoStream.tags)) {
      args.push('-metadata:s:v:0', `${key}=${sanitizeMetadataValue(value)}`);
    }
  }

  if (audioStream) {
    for (const [key, value] of Object.entries(audioStream.tags)) {
      args.push('-metadata:s:a:0', `${key}=${sanitizeMetadataValue(value)}`);
    }
  }

  return args;
}

export function flattenMetadata(snapshot: MediaMetadataSnapshot): MetadataField[] {
  const fields: MetadataField[] = [];

  for (const [key, value] of Object.entries(snapshot.formatTags)) {
    fields.push({ scope: 'format', key, value });
  }

  for (const stream of snapshot.streams) {
    for (const [key, value] of Object.entries(stream.tags)) {
      fields.push({
        scope: 'stream',
        streamType: stream.codecType,
        streamIndex: stream.index,
        key,
        value,
      });
    }
  }

  return fields;
}

export function compareMetadata(
  source: MediaMetadataSnapshot,
  output: MediaMetadataSnapshot,
): MetadataMismatch[] {
  const mismatches: MetadataMismatch[] = [];
  const sourceFields = flattenMetadata(source);
  const outputFields = flattenMetadata(output);

  for (const sourceField of sourceFields) {
    if (CONTAINER_GENERATED_TAGS.has(sourceField.key)) {
      continue;
    }

    const outputField = findMatchingField(outputFields, sourceField);
    if (!outputField) {
      mismatches.push({
        scope: describeScope(sourceField),
        key: sourceField.key,
        sourceValue: sourceField.value,
        reason: 'missing',
      });
      continue;
    }

    if (normalizeValue(outputField.value) !== normalizeValue(sourceField.value)) {
      mismatches.push({
        scope: describeScope(sourceField),
        key: sourceField.key,
        sourceValue: sourceField.value,
        outputValue: outputField.value,
        reason: 'mismatch',
      });
    }
  }

  return mismatches;
}

function findMatchingField(
  outputFields: MetadataField[],
  sourceField: MetadataField,
): MetadataField | undefined {
  return outputFields.find(
    (field) =>
      field.scope === sourceField.scope &&
      field.key === sourceField.key &&
      field.streamType === sourceField.streamType &&
      field.streamIndex === sourceField.streamIndex,
  );
}

function describeScope(field: MetadataField): string {
  if (field.scope === 'format') {
    return 'format';
  }

  return `stream:${field.streamType}:${field.streamIndex}`;
}

function normalizeValue(value: string): string {
  return value.trim();
}

/** Strip characters that break FFmpeg metadata argument parsing. */
function sanitizeMetadataValue(value: string): string {
  return value.replace(/\0/g, '').replace(/[\r\n]/g, ' ').trim();
}
