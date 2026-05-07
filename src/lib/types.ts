export interface GlobalOptions {
  json?: boolean;
  jq?: string;
  site?: string;
  url?: string;
  staffToken?: string;
  enableDestructiveActions?: boolean;
  debug?: string | boolean;
  color?: boolean;
}

export interface ConnectionConfig {
  url: string;
  staffToken: string;
  apiVersion: string;
  siteAlias?: string;
  source: 'flags' | 'env' | 'site' | 'project' | 'active';
}
