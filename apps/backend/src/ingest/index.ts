// The api <-> ingest contract — see ADR 0002 and ADR 0003. `api` calls this
// after storing an upload; the real implementation (Document state machine,
// parser dispatch) lands in M3.
export interface IngestModule {
  startImport(documentId: string): Promise<void>;
}

export const ingest: IngestModule = {
  async startImport(_documentId: string): Promise<void> {
    throw new Error("not implemented — see milestone M3");
  },
};
