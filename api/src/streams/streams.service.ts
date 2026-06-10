import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common"
import { PaginatedResult } from "../common/dto/pagination.dto"
import { Stream } from "./stream.entity"
import { StreamsRepository } from "./repository/streams.repository"

export interface PagedStreams extends PaginatedResult<Stream> {
  hasMore: boolean
}

@Injectable()
export class StreamsService {
  constructor(private readonly repo: StreamsRepository) {}

  create(dto: { userId: number; name: string; description?: string }): Stream {
    return this.repo.create({
      userId: dto.userId,
      name: dto.name.trim(),
      description: dto.description?.trim(),
    })
  }

  list(
    page: number,
    limit: number,
    filter?: { status?: string },
  ): PagedStreams {
    const { items, total } = this.repo.listPaginated(page, limit, filter)
    return {
      data: items,
      page,
      limit,
      total,
      hasMore: page * limit < total,
    }
  }

  findById(id: number): Stream {
    const stream = this.repo.findById(id)
    if (!stream) {
      throw new NotFoundException(`stream ${id} not found`)
    }
    return stream
  }

  update(
    id: number,
    changes: { name?: string; description?: string; status?: string },
  ): Stream {
    const stream = this.findById(id)

    // Validate status transitions
    if (changes.status !== undefined) {
      this.validateStatusTransition(stream.status, changes.status)
    }

    return this.repo.update(id, {
      name: changes.name?.trim(),
      description: changes.description?.trim(),
      status: changes.status,
    })
  }

  delete(id: number): void {
    const exists = this.repo.delete(id)
    if (!exists) {
      throw new NotFoundException(`stream ${id} not found`)
    }
  }

  /**
   * Enforces valid status transitions:
   *   inactive → active   (start streaming)
   *   active   → inactive (stop streaming)
   *   *        → error    (any status can transition to error)
   *   error    → inactive (recover from error)
   */
  private validateStatusTransition(
    current: string,
    next: string,
  ): void {
    const allowed: Record<string, string[]> = {
      inactive: ["active", "error"],
      active: ["inactive", "error"],
      error: ["inactive"],
    }

    const allowedTransitions = allowed[current]
    if (!allowedTransitions?.includes(next)) {
      throw new ConflictException(
        `cannot transition stream from "${current}" to "${next}"`,
      )
    }
  }
}
