export class SearchIndexerHelper {
  constructor(serviceName: string);
  initialize(): Promise<void>;
  indexEvent(event: any): Promise<boolean>;
}
