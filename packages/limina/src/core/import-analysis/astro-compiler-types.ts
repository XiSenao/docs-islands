export interface AstroCompilerDiagnostic {
  code?: number;
  hint?: string;
  location?: {
    column?: number;
    line?: number;
  };
  severity?: number;
  text?: string;
}

export interface AstroNode {
  attributes?: {
    name?: string;
    value?: string;
  }[];
  children?: AstroNode[];
  name?: string;
  position?: {
    end?: { column?: number; line?: number; offset?: number };
    start?: { column?: number; line?: number; offset?: number };
  };
  type: string;
  value?: string;
}

export interface AstroParseResult {
  ast: AstroNode;
  diagnostics?: AstroCompilerDiagnostic[];
}

export interface AstroCompiler {
  parse(
    source: string,
    options?: { position?: boolean },
  ): Promise<AstroParseResult>;
}

export interface AstroCompilerModule {
  default?: Partial<AstroCompiler>;
  parse?: AstroCompiler['parse'];
}
