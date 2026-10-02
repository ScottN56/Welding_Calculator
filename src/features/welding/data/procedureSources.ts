export interface ApprovedProcedureSource {
  readonly publisher: string;
  readonly hostname: string;
  readonly pathPrefix: string;
}

export const APPROVED_PROCEDURE_SOURCES: readonly ApprovedProcedureSource[] = [
  {
    publisher: 'Los Alamos National Laboratory',
    hostname: 'engstandards.lanl.gov',
    pathPrefix: '/esm/welding/welding_specs/',
  },
];

export function approvedProcedureUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error('Procedure source URL must be an absolute HTTPS URL.');
  }

  const source = APPROVED_PROCEDURE_SOURCES.find((candidate) =>
    url.hostname === candidate.hostname && url.pathname.startsWith(candidate.pathPrefix),
  );
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash || !source || !url.pathname.toLowerCase().endsWith('.pdf')) {
    throw new Error(`Procedure source URL is not approved: ${url.hostname}${url.pathname}`);
  }
  return url;
}