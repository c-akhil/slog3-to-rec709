export interface MetadataField {
  scope: 'format' | 'stream';
  streamType?: string;
  streamIndex?: number;
  key: string;
  value: string;
}

export interface MediaMetadataSnapshot {
  formatTags: Record<string, string>;
  streams: Array<{
    index: number;
    codecType: string;
    tags: Record<string, string>;
  }>;
  hasSubtitleStreams: boolean;
}

export interface MetadataMismatch {
  scope: string;
  key: string;
  sourceValue: string;
  outputValue?: string;
  reason: 'missing' | 'mismatch';
}

export interface MetadataVerificationResult {
  matched: number;
  mismatches: MetadataMismatch[];
  subtitleMetadataSkipped: boolean;
}

export interface FilesystemTimestampResult {
  mtimePreserved: boolean;
  birthtimePreserved: boolean;
  birthtimeSupported: boolean;
}
