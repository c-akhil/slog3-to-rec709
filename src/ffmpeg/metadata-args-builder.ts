import type { MediaMetadataSnapshot, MetadataField, MetadataMismatch } from '../types/metadata.js';

/** Tags FFmpeg regenerates when re-muxing; excluded from strict comparison. */
export const CONTAINER_GENERATED_TAGS = new Set([
  'minor_version',
  'compatible_brands',
]);

/**
 * Builds FFmpeg arguments to copy container, stream, and chapter metadata from the source.
 */
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

  if (videoStream) {
    args.push('-map_metadata:s:v', `${videoStream.index}:s:v`);
  }

  if (audioStream) {
    args.push('-map_metadata:s:a', `${audioStream.index}:s:a`);
  }

  for (const [key, value] of Object.entries(snapshot.formatTags)) {
    args.push('-metadata', `${key}=${value}`);
  }

  if (videoStream) {
    for (const [key, value] of Object.entries(videoStream.tags)) {
      args.push('-metadata:s:v:0', `${key}=${value}`);
    }
  }

  if (audioStream) {
    for (const [key, value] of Object.entries(audioStream.tags)) {
      args.push('-metadata:s:a:0', `${key}=${value}`);
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
