import type { CheckerName } from '#config/runner';
import type { ImportRecord } from '#core/import-analysis/runner';

export type CheckerOwner =
  | { kind: 'pending' }
  | { checker: CheckerName; kind: 'resolved' };

export type CheckerEvidenceSource =
  | 'explicit'
  | 'config'
  | 'root-file'
  | 'dependency'
  | 'vue-promotion'
  | 'solution-constraint'
  | 'fallback';

export interface CheckerEvidence {
  checker: CheckerName;
  configPath: string;
  detail: string;
  source: CheckerEvidenceSource;
}

export interface TypeConfigOwnershipState {
  configPath: string;
  constraintCandidates: Map<CheckerName, CheckerEvidence[]>;
  evidence: CheckerEvidence[];
  finalOwner?: CheckerName;
  kind: 'type';
  localOwner: CheckerOwner;
}

export interface SolutionOwnershipState {
  configPath: string;
  constraintCandidates: Map<CheckerName, CheckerEvidence[]>;
  declaredConstraint?: CheckerName;
  finalOwner?: CheckerName;
  kind: 'solution';
  leafConfigPaths: string[];
}

export interface CheckerDependencyFact {
  consumerConfigPath: string;
  importRecord: ImportRecord;
  physicalTargetPath: string | null;
  typeEvidenceKind:
    | 'ambient'
    | 'checker-source'
    | 'concrete-declaration'
    | 'missing';
}

export interface CheckerOwnershipPlan {
  dependencyFacts: CheckerDependencyFact[];
  entryOwnerByConfigPath: Map<string, CheckerName>;
  solutions: Map<string, SolutionOwnershipState>;
  typeConfigs: Map<string, TypeConfigOwnershipState>;
}
