import type ts from 'typescript';
import type { FrameworkSemanticCandidate } from '../framework-semantic/contracts';
import type { ImportRecord } from '../import-analysis/runner';

export type SvelteSemanticCandidate = FrameworkSemanticCandidate<
  ts.SourceFile,
  ts.StringLiteralLike
>;

export interface SvelteUnmappedGeneratedDependency {
  generatedFilePath: string;
  semanticSpecifier: string;
}

export type SvelteDependencyPreparation =
  | {
      candidates: SvelteSemanticCandidate[];
      kind: 'supported';
      sourceRecords: ImportRecord[];
      unmapped: SvelteUnmappedGeneratedDependency[];
    }
  | {
      kind: 'unsupported';
      reason: string;
      stage:
        | 'service-script-materialization'
        | 'source-map-ambiguity'
        | 'source-map-mismatch';
    };

export { prepareSvelteSemanticDependencies } from './preparation';
export {
  getSvelteSourceMappingFailure,
  selectSvelteSourceMapping,
} from './source-mapping';
export { collectSvelteSemanticSourceRecords } from './source-records';
