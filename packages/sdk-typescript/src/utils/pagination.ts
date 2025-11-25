import { PaginatedResponse, PaginationParams } from '../types/api';

export interface PaginationHelper<T> {
  data: T[];
  hasMore: boolean;
  nextPage: number | null;
  totalPages: number | null;
  totalCount: number | null;
}

export class Paginator<T> {
  private currentPage: number = 1;

  constructor(
    private fetchFunction: (params: PaginationParams) => Promise<PaginatedResponse<T>>,
    private defaultPageSize: number = 20
  ) {}

  async next(): Promise<PaginationHelper<T>> {
    const response = await this.fetchFunction({
      page: this.currentPage,
      limit: this.defaultPageSize,  // ← FIXED: changed pageSize to limit
    });

    this.currentPage++;

    return {
      data: response.data,
      hasMore: this.currentPage <= (response.pagination?.totalPages || 0),
      nextPage: this.currentPage <= (response.pagination?.totalPages || 0) ? this.currentPage : null,
      totalPages: response.pagination?.totalPages || null,
      totalCount: response.pagination?.total || null,  // ← FIXED: changed totalCount to total
    };
  }

  async *iterate(): AsyncGenerator<T[], void, unknown> {
    let hasMore = true;
    while (hasMore) {
      const result = await this.next();
      yield result.data;
      hasMore = result.hasMore;
    }
  }

  async all(): Promise<T[]> {
    const allItems: T[] = [];
    for await (const items of this.iterate()) {
      allItems.push(...items);
    }
    return allItems;
  }

  reset(): void {
    this.currentPage = 1;
  }
}

export function paginate<T>(
  fetchFunction: (params: PaginationParams) => Promise<PaginatedResponse<T>>,
  pageSize?: number
): Paginator<T> {
  return new Paginator(fetchFunction, pageSize);
}
