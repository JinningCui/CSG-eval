export class IdCounter {
  idCounter = new Map<string, number>();

  constructor() { }

  getIdByPrefix(prefix: string): string {
    const id = this.idCounter.get(prefix) || 0;
    this.idCounter.set(prefix, id + 1);
    return `${prefix}-${id}`;
  }
}