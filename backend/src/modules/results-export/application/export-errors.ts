export class ResultsExportError extends Error {
  constructor(message: string, public readonly statusCode = 400, public readonly details: string[] = []) { super(message); }
}
