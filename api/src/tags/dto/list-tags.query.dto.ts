import { PaginationQueryDto } from "../../common/dto/pagination.dto"

/**
 * Query parameters for the public `GET /tags` endpoint.
 *
 * `page` is 1-indexed; `limit` is capped at 100 to keep payloads bounded.
 */
export class ListTagsQueryDto extends PaginationQueryDto {}
