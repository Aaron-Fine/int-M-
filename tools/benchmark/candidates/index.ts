/**
 * Candidate registry. Contestants add exactly ONE import line and ONE array
 * entry below (see README.md). The BASELINE is not listed here: the judge
 * always supplies it.
 */
import { checkpoint } from './checkpoint';
import { v2PrefixCache } from './v2-prefix-cache';
import type { Candidate } from './types';

export const CANDIDATES: readonly Candidate[] = [checkpoint, v2PrefixCache];
