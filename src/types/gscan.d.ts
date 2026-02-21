declare module 'gscan' {
  export interface GscanResult {
    errors?: Array<unknown>;
    warnings?: Array<unknown>;
    results?: {
      errors?: Array<unknown>;
      warnings?: Array<unknown>;
    };
    [key: string]: unknown;
  }

  export function check(target: string, options?: Record<string, unknown>): Promise<GscanResult>;
  export function checkZip(target: string, options?: Record<string, unknown>): Promise<GscanResult>;

  const gscan: {
    check: typeof check;
    checkZip: typeof checkZip;
  };

  export default gscan;
}
