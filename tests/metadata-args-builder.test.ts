import { describe, expect, it } from 'vitest';
import {
  buildMetadataCopyArgs,
  compareMetadata,
  flattenMetadata,
} from '../src/ffmpeg/metadata-args-builder.js';
import type { MediaMetadataSnapshot } from '../src/types/metadata.js';

describe('metadata-args-builder', () => {
  const snapshot: MediaMetadataSnapshot = {
    formatTags: {
      creation_time: '2024-01-01T12:00:00.000000Z',
      artist: 'Sony Camera',
      copyright: 'Test',
      location: 'GPS data',
    },
    streams: [
      {
        index: 0,
        codecType: 'video',
        tags: {
          creation_time: '2024-01-01T12:00:00.000000Z',
          handler_name: 'VideoHandler',
        },
      },
      {
        index: 1,
        codecType: 'audio',
        tags: {
          creation_time: '2024-01-01T12:00:00.000000Z',
          handler_name: 'SoundHandler',
        },
      },
    ],
    hasSubtitleStreams: false,
  };

  it('builds metadata copy arguments for format and streams', () => {
    const args = buildMetadataCopyArgs(snapshot);

    expect(args).toContain('-map_metadata');
    expect(args).toContain('0');
    expect(args).toContain('-map_chapters');
    expect(args).toContain('-movflags');
    expect(args).toContain('use_metadata_tags');
    expect(args).toContain('-map_metadata:s:v');
    expect(args).toContain('0:s:v');
    expect(args).toContain('-map_metadata:s:a');
    expect(args).toContain('1:s:a');
    expect(args).toContain('-metadata');
    expect(args).toContain('artist=Sony Camera');
    expect(args).toContain('-metadata:s:v:0');
    expect(args).toContain('handler_name=VideoHandler');
    expect(args).toContain('-metadata:s:a:0');
    expect(args).toContain('handler_name=SoundHandler');
  });

  it('flattens metadata from format and streams', () => {
    const fields = flattenMetadata(snapshot);
    expect(fields.length).toBe(8);
    expect(fields.some((field) => field.scope === 'format' && field.key === 'artist')).toBe(true);
    expect(
      fields.some(
        (field) =>
          field.scope === 'stream' && field.streamType === 'video' && field.key === 'handler_name',
      ),
    ).toBe(true);
  });

  it('reports missing and mismatched metadata fields', () => {
    const outputSnapshot: MediaMetadataSnapshot = {
      formatTags: {
        creation_time: '2024-01-01T12:00:00.000000Z',
        artist: 'Sony Camera',
      },
      streams: [
        {
          index: 0,
          codecType: 'video',
          tags: {
            creation_time: '2024-01-02T12:00:00.000000Z',
            handler_name: 'VideoHandler',
          },
        },
        {
          index: 1,
          codecType: 'audio',
          tags: {
            creation_time: '2024-01-01T12:00:00.000000Z',
            handler_name: 'SoundHandler',
          },
        },
      ],
      hasSubtitleStreams: false,
    };

    const mismatches = compareMetadata(snapshot, outputSnapshot);
    expect(mismatches.some((item) => item.key === 'copyright' && item.reason === 'missing')).toBe(
      true,
    );
    expect(
      mismatches.some(
        (item) => item.key === 'creation_time' && item.reason === 'mismatch' && item.scope.startsWith('stream:video'),
      ),
    ).toBe(true);
  });
});
