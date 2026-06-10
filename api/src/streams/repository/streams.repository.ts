import { Injectable } from "@nestjs/common"
import { Stream } from "../stream.entity"

/**
 * In-memory streams repository.
 *
 * Persistence-agnostic: the controller and service depend only on the
 * public methods exposed here. When the Postgres layer is ready this
 * class can be swapped for a DB-backed repository without changing
 * higher layers.
 */
@Injectable()
export class StreamsRepository {
  private readonly streamsById = new Map<number, Stream>()
  private nextId = 1

  findById(id: number): Stream | undefined {
    return this.streamsById.get(id)
  }

  /**
   * Returns all streams, optionally filtered by status.
   */
  listFiltered(filter?: { status?: string }): Stream[] {
    let results = Array.from(this.streamsById.values())
    if (filter?.status) {
      results = results.filter((s) => s.status === filter.status)
    }
    return results.sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    )
  }

  /**
   * Paginated listing.
   */
  listPaginated(
    page: number,
    limit: number,
    filter?: { status?: string },
  ): { items: Stream[]; total: number } {
    const filtered = this.listFiltered(filter)
    const offset = (page - 1) * limit
    return {
      items: filtered.slice(offset, offset + limit),
      total: filtered.length,
    }
  }

  create(params: { userId: number; name: string; description?: string }): Stream {
    const stream: Stream = {
      id: this.nextId++,
      userId: params.userId,
      name: params.name,
      description: params.description ?? null,
      status: "inactive",
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    this.streamsById.set(stream.id, stream)
    return stream
  }

  update(
    id: number,
    changes: { name?: string; description?: string; status?: string },
  ): Stream {
    const stream = this.streamsById.get(id)!
    if (changes.name !== undefined) stream.name = changes.name
    if (changes.description !== undefined) stream.description = changes.description
    if (changes.status !== undefined) {
      stream.status = changes.status as Stream["status"]
    }
    stream.updatedAt = new Date()
    return stream
  }

  delete(id: number): boolean {
    return this.streamsById.delete(id)
  }
}
