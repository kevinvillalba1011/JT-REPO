export interface ClientSourceStrategy {
  fetchClients(): Promise<string[]>; // returns list of identifications
}
