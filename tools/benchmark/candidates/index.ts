/**
 * Candidate registry. Contestants add exactly ONE import line and ONE array
 * entry below (see README.md). The BASELINE is not listed here: the judge
 * always supplies it.
 */
import { checkpoint } from './checkpoint';
import type { Candidate } from './types';

export const CANDIDATES: readonly Candidate[] = [checkpoint];
