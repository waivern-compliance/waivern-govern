/** Shared parsing for export query strings, so every endpoint reads them alike. */
export type ExportQuery = {
  entities?: string[];
  since?: Date;
  limit?: number;
};

export class BadQuery extends Error {}

export function parseExportQuery(url: URL): ExportQuery {
  const query: ExportQuery = {};

  const entity = url.searchParams.getAll("entity");
  if (entity.length) query.entities = entity;

  const since = url.searchParams.get("since");
  if (since) {
    const parsed = new Date(since);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadQuery("`since` must be an ISO-8601 instant");
    }
    query.since = parsed;
  }

  const limit = url.searchParams.get("limit");
  if (limit) {
    const parsed = Number(limit);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 1000) {
      throw new BadQuery("`limit` must be a whole number between 1 and 1000");
    }
    query.limit = parsed;
  }

  return query;
}
