import { PaginationQueryDto } from "../../common/dto/pagination.dto"

/**
 * Query parameters for `GET /webhooks/:id/deliveries`. Paging behaviour
 * matches the rest of the API (1-indexed page, limit capped at 100).
 */
export class ListDeliveriesQueryDto extends PaginationQueryDto {}
